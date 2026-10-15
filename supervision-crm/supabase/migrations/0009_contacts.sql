-- 0009_contacts.sql
-- Canonical contact = one person/property that a lifecycle follows end to end:
-- cold -> contacted -> engaged -> lead -> appointment -> customer -> repeat_customer (or lost).
--
-- Until now the journey was split across call_list.status (cold funnel), leads.status
-- (pipeline) and projects (the job), with no "customer"/"repeat" concept. `contacts` unifies
-- them: call_list, leads and projects all gain a contact_id, and a single lifecycle_stage on
-- the contact is advanced as the person moves through calls, email engagement and won jobs.
-- Safe to re-run (guards + if-not-exists throughout).

-- ---------- lifecycle enum ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'lifecycle_stage') then
    create type lifecycle_stage as enum
      ('cold','contacted','engaged','lead','appointment','customer','repeat_customer','lost');
  end if;
end $$;

-- ---------- normalization helpers (dedupe keys) ----------
-- Last 10 digits of a phone; null when there are none. Matches the dialer's normPhone().
create or replace function public.norm_phone(p text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '');
$$;

create or replace function public.norm_email(p text)
returns text language sql immutable as $$
  select nullif(lower(trim(coalesce(p, ''))), '');
$$;

-- Funnel ordering so lifecycle_stage only ever moves forward (lost is terminal, rank -1).
create or replace function public.contact_stage_rank(p lifecycle_stage)
returns int language sql immutable as $$
  select case p
    when 'lost' then -1
    when 'cold' then 0
    when 'contacted' then 1
    when 'engaged' then 2
    when 'lead' then 3
    when 'appointment' then 4
    when 'customer' then 5
    when 'repeat_customer' then 6
  end;
$$;

-- ---------- contacts ----------
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_name      text,
  site_address    text,
  city            text,
  email           text,
  email_norm      text,
  phones          text[] not null default '{}',
  phone_norm      text,
  email_opt_out   boolean not null default false,
  sms_opt_out     boolean not null default false,
  dnc             boolean not null default false,
  engagement_score int not null default 0,
  lifecycle_stage lifecycle_stage not null default 'cold',
  customer_since  timestamptz,
  projects_count  int not null default 0,
  lifetime_value  numeric(12,2) not null default 0,
  last_emailed_at timestamptz,
  last_called_at  timestamptz,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One contact per real phone / email (dedupe). Partial so blanks never collide.
create unique index if not exists contacts_phone_norm_key on public.contacts (phone_norm) where phone_norm is not null;
create unique index if not exists contacts_email_norm_key on public.contacts (email_norm) where email_norm is not null;
create index if not exists contacts_lifecycle_idx on public.contacts (lifecycle_stage);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------- link existing tables to contacts ----------
alter table public.call_list add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.call_list add column if not exists priority    int not null default 0;
alter table public.call_list add column if not exists lead_score  int not null default 0;
alter table public.call_list add column if not exists pass_count  int not null default 0;
alter table public.call_list add column if not exists last_pass_at timestamptz;
create index if not exists call_list_priority_idx on public.call_list (campaign_id, status, priority desc);

alter table public.leads add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists leads_contact_idx on public.leads (contact_id);

alter table public.projects add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists projects_contact_idx on public.projects (contact_id);

-- ---------- lifecycle transition helpers ----------
-- Forward-only advance: never downgrades. Used by funnel events (disposition, email engagement).
create or replace function public.advance_contact_stage(p_contact uuid, p_stage lifecycle_stage)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_contact is null then return; end if;
  update public.contacts
     set lifecycle_stage = p_stage
   where id = p_contact
     and public.contact_stage_rank(p_stage) > public.contact_stage_rank(lifecycle_stage);
end;
$$;

-- Explicit owner override (can also set 'lost'/'cold').
create or replace function public.set_lifecycle_stage(p_contact uuid, p_stage lifecycle_stage)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'not authorized'; end if;
  update public.contacts set lifecycle_stage = p_stage where id = p_contact;
end;
$$;

-- Recompute customer rollups from linked jobs; a contact with >=2 jobs is a repeat customer.
create or replace function public.roll_up_customer(p_contact uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int; v_value numeric; v_since timestamptz;
begin
  if p_contact is null then return; end if;
  select count(*), coalesce(sum(contract_value), 0), min(created_at)
    into v_count, v_value, v_since
    from public.projects where contact_id = p_contact;
  update public.contacts
     set projects_count = v_count,
         lifetime_value = v_value,
         customer_since = coalesce(customer_since, v_since)
   where id = p_contact;
  if v_count >= 2 then
    perform public.advance_contact_stage(p_contact, 'repeat_customer');
  elsif v_count = 1 then
    perform public.advance_contact_stage(p_contact, 'customer');
  end if;
end;
$$;

create or replace function public.trg_project_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.roll_up_customer(old.contact_id);
    return old;
  end if;
  perform public.roll_up_customer(new.contact_id);
  if tg_op = 'UPDATE' and new.contact_id is distinct from old.contact_id then
    perform public.roll_up_customer(old.contact_id);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_rollup on public.projects;
create trigger projects_rollup
  after insert or update of contact_id, contract_value or delete on public.projects
  for each row execute function public.trg_project_rollup();

-- Any new call_list row (React import OR the existing dialer upload) is auto-linked to a canonical
-- contact: reuse one matching by phone/email, else create it. Keeps the contact book deduped with
-- zero client changes. Only the owner can insert call_list (RLS), so this never runs for a rep.
create or replace function public.trg_call_list_link_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phones text[];
  v_pn text;
  v_en text;
  v_cid uuid;
begin
  if new.contact_id is not null then
    return new;
  end if;
  v_phones := case when coalesce(cardinality(new.phones), 0) > 0 then new.phones
                   when new.phone is not null then array[new.phone]
                   else '{}' end;
  v_pn := public.norm_phone(coalesce(new.phone, v_phones[1]));
  v_en := public.norm_email(new.email);

  if v_pn is not null then
    select id into v_cid from public.contacts where phone_norm = v_pn limit 1;
  end if;
  if v_cid is null and v_en is not null then
    select id into v_cid from public.contacts where email_norm = v_en limit 1;
  end if;
  if v_cid is null then
    begin
      insert into public.contacts (owner_name, site_address, city, email, email_norm, phones, phone_norm, raw)
      values (new.owner_name, new.site_address, new.city, new.email, v_en, v_phones, v_pn, new.raw)
      returning id into v_cid;
    exception when unique_violation then
      -- A concurrent insert won the race; re-read the contact it created.
      if v_pn is not null then
        select id into v_cid from public.contacts where phone_norm = v_pn limit 1;
      end if;
      if v_cid is null and v_en is not null then
        select id into v_cid from public.contacts where email_norm = v_en limit 1;
      end if;
    end;
  end if;

  new.contact_id := v_cid;
  return new;
end;
$$;

drop trigger if exists call_list_link_contact on public.call_list;
create trigger call_list_link_contact before insert on public.call_list
  for each row execute function public.trg_call_list_link_contact();

revoke all on function public.trg_call_list_link_contact() from public;

-- ---------- disposition_contact: carry contact_id onto the lead + advance lifecycle ----------
-- Recreated from 0005 (same 5-arg signature) so good/appointment/dnc update the canonical contact.
create or replace function public.disposition_contact(
  p_contact        uuid,
  p_outcome        call_status,
  p_notes          text default null,
  p_seconds        int default null,
  p_appointment_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.call_list;
begin
  select * into v_row from public.call_list where id = p_contact;
  if not found then raise exception 'contact not found'; end if;
  if not (v_row.claimed_by = auth.uid() or public.is_platform_owner()) then
    raise exception 'not authorized to disposition this contact';
  end if;
  if p_outcome in ('pending','claimed') then raise exception 'invalid disposition outcome'; end if;

  update public.call_list
     set status         = p_outcome,
         notes          = coalesce(p_notes, notes),
         call_seconds   = coalesce(p_seconds, call_seconds),
         disposition_at = now()
   where id = p_contact;

  -- Mirror the call outcome onto the canonical contact.
  if v_row.contact_id is not null then
    update public.contacts set last_called_at = now() where id = v_row.contact_id;
    if p_outcome = 'dnc' then
      update public.contacts set dnc = true where id = v_row.contact_id;
    elsif p_outcome = 'good' then
      if p_appointment_at is not null then
        perform public.advance_contact_stage(v_row.contact_id, 'appointment');
      else
        perform public.advance_contact_stage(v_row.contact_id, 'lead');
      end if;
    end if;
  end if;

  if p_outcome = 'good' then
    insert into public.leads (
      source, status, campaign_id, call_list_id, contact_id,
      owner_name, site_address, phone, email, city,
      notes, call_seconds, rep_profile_id, appointment_at
    ) values (
      'telemarketer', 'qualified', v_row.campaign_id, v_row.id, v_row.contact_id,
      v_row.owner_name, v_row.site_address, v_row.phone, v_row.email, v_row.city,
      coalesce(p_notes, v_row.notes), coalesce(p_seconds, v_row.call_seconds), auth.uid(), p_appointment_at
    );
  end if;
end;
$$;

-- ---------- backfill: one contact per existing call_list contact ----------
-- Temporary column records which call_list row seeded each contact, so rows that have
-- neither phone nor email (no dedupe key) can still be linked back.
alter table public.contacts add column if not exists _src_cl uuid;

with src as (
  select cl.id as call_list_id, cl.owner_name, cl.site_address, cl.city, cl.email, cl.phone,
         cl.phones, cl.raw, public.norm_phone(cl.phone) as pn, public.norm_email(cl.email) as en
  from public.call_list cl
  where cl.contact_id is null
),
keyed as (
  select *, coalesce(pn, en, call_list_id::text) as dedupe_key from src
),
firsts as (
  select * from (
    select *, row_number() over (partition by dedupe_key order by call_list_id) as rn from keyed
  ) q where rn = 1
)
insert into public.contacts (owner_name, site_address, city, email, email_norm, phones, phone_norm, raw, _src_cl)
select owner_name, site_address, city, email, en,
       case when coalesce(cardinality(phones), 0) > 0 then phones
            when phone is not null then array[phone]
            else '{}' end,
       pn, raw, call_list_id
from firsts
on conflict do nothing;

-- Link call_list rows to their contact (phone first, then email, then the seed row).
update public.call_list cl set contact_id = c.id
  from public.contacts c
 where cl.contact_id is null and public.norm_phone(cl.phone) is not null
   and c.phone_norm = public.norm_phone(cl.phone);
update public.call_list cl set contact_id = c.id
  from public.contacts c
 where cl.contact_id is null and public.norm_phone(cl.phone) is null
   and public.norm_email(cl.email) is not null and c.email_norm = public.norm_email(cl.email);
update public.call_list cl set contact_id = c.id
  from public.contacts c
 where cl.contact_id is null and c._src_cl = cl.id;

alter table public.contacts drop column if exists _src_cl;

-- Link existing leads to contacts (via their call_list row first, then by phone/email).
update public.leads l set contact_id = cl.contact_id
  from public.call_list cl
 where l.contact_id is null and l.call_list_id = cl.id and cl.contact_id is not null;
update public.leads l set contact_id = c.id
  from public.contacts c
 where l.contact_id is null and public.norm_phone(l.phone) is not null
   and c.phone_norm = public.norm_phone(l.phone);

-- An existing lead means the contact reached at least 'lead'; an appointment means 'appointment'.
update public.contacts c set lifecycle_stage = 'lead'
  from public.leads l
 where l.contact_id = c.id
   and public.contact_stage_rank(c.lifecycle_stage) < public.contact_stage_rank('lead');
update public.contacts c set lifecycle_stage = 'appointment'
  from public.leads l
 where l.contact_id = c.id and l.appointment_at is not null
   and public.contact_stage_rank(c.lifecycle_stage) < public.contact_stage_rank('appointment');

-- ---------- RLS ----------
alter table public.contacts enable row level security;

-- Owner (RMO) has full access to the canonical contact book.
drop policy if exists contacts_owner_all on public.contacts;
create policy contacts_owner_all on public.contacts for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());

-- A rep may read a contact only while it sits in a campaign they're assigned to.
drop policy if exists contacts_agent_select on public.contacts;
create policy contacts_agent_select on public.contacts for select
  using (exists (
    select 1 from public.call_list cl
    where cl.contact_id = contacts.id and public.is_assigned_agent(cl.campaign_id)
  ));

-- ---------- grants ----------
-- Lifecycle mutators run inside SECURITY DEFINER callers/triggers, never from the client.
revoke all on function public.advance_contact_stage(uuid, lifecycle_stage) from public;
revoke all on function public.roll_up_customer(uuid) from public;
revoke all on function public.trg_project_rollup() from public;
revoke all on function public.set_lifecycle_stage(uuid, lifecycle_stage) from public;
grant execute on function public.set_lifecycle_stage(uuid, lifecycle_stage) to authenticated;

revoke all on function public.disposition_contact(uuid, call_status, text, int, timestamptz) from public;
grant execute on function public.disposition_contact(uuid, call_status, text, int, timestamptz) to authenticated;
