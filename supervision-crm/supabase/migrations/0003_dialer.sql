-- 0003_dialer.sql
-- Telemarketer dialer: central campaigns, call lists, and a unified lead inbox.
--
-- Reps are lead-gen staff (auth users) ASSIGNED to campaigns; they are NOT
-- contractor members. Leads are "pre-tenant" until routed to a contractor, so
-- access is gated by is_platform_owner() (the RMO) and campaign assignment
-- rather than the contractor-scoped RLS used elsewhere.

-- ---------- Enums ----------
create type lead_source as enum ('telemarketer','canvasser','web_form','call_in','manual','other');
create type lead_status as enum ('new','contacted','qualified','assigned','converted','dead','duplicate','spam');
create type call_status as enum ('pending','claimed','good','not_interested','no_answer','bad_number','dnc');

-- ---------- Owner helper ----------
-- The owner/RMO is whoever holds an active 'rmo' membership anywhere. Leads and
-- campaigns are cross-tenant, so this is intentionally global (not per-contractor).
create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.profile_id = auth.uid()
      and m.role = 'rmo'
      and m.status = 'active'
  );
$$;

-- ---------- campaigns ----------
create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  source     lead_source not null default 'telemarketer',
  status     text not null default 'active', -- active | paused | done
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- campaign_assignments (which rep works which campaign) ----------
create table public.campaign_assignments (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  agent_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (campaign_id, agent_profile_id)
);
create index campaign_assignments_agent_idx on public.campaign_assignments (agent_profile_id);

-- Agent-access helper (defined after campaign_assignments exists).
create or replace function public.is_assigned_agent(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaign_assignments a
    where a.campaign_id = p_campaign
      and a.agent_profile_id = auth.uid()
  );
$$;

-- ---------- call_list (uploaded contacts = the work queue) ----------
create table public.call_list (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  owner_name     text,
  site_address   text,
  phone          text,
  city           text,
  email          text,
  raw            jsonb, -- original row, preserves any extra columns
  status         call_status not null default 'pending',
  claimed_by     uuid references public.profiles(id),
  claimed_at     timestamptz,
  call_seconds   int,
  notes          text,
  disposition_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index call_list_queue_idx on public.call_list (campaign_id, status);

-- ---------- leads (unified good-lead inbox across all sources) ----------
create table public.leads (
  id                     uuid primary key default gen_random_uuid(),
  source                 lead_source not null default 'telemarketer',
  status                 lead_status not null default 'qualified',
  campaign_id            uuid references public.campaigns(id) on delete set null,
  call_list_id           uuid references public.call_list(id) on delete set null,
  owner_name             text,
  site_address           text,
  phone                  text,
  email                  text,
  city                   text,
  notes                  text,
  call_seconds           int,
  rep_profile_id         uuid references public.profiles(id),
  source_domain          text,
  campaign               text,
  landing_page           text,
  enrichment             jsonb, -- future address->owner lookup snapshot
  assigned_contractor_id uuid references public.contractors(id) on delete set null,
  converted_project_id   uuid references public.projects(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index leads_source_status_idx on public.leads (source, status);
create index leads_created_idx on public.leads (created_at);

-- ---------- updated_at triggers ----------
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger call_list_set_updated_at before update on public.call_list
  for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------- RPC: claim_next_contact ----------
-- Atomic, concurrency-safe queue pull. Two reps calling this at the same moment
-- receive DIFFERENT contacts (FOR UPDATE SKIP LOCKED). Stale claims (>15 min,
-- e.g. a rep closed the app mid-call) become claimable again.
create or replace function public.claim_next_contact(p_campaign uuid)
returns public.call_list
language plpgsql security definer set search_path = public as $$
declare
  v_row public.call_list;
begin
  if not (public.is_assigned_agent(p_campaign) or public.is_platform_owner()) then
    raise exception 'not authorized for this campaign';
  end if;

  select * into v_row
  from public.call_list
  where campaign_id = p_campaign
    and (status = 'pending'
         or (status = 'claimed' and claimed_at < now() - interval '15 minutes'))
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.call_list
     set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
   where id = v_row.id
   returning * into v_row;

  return v_row;
end;
$$;

-- ---------- RPC: disposition_contact ----------
-- Records the call outcome for a claimed contact and, when 'good', promotes it
-- into the leads inbox. Only the rep who claimed it (or the owner) may disposition.
create or replace function public.disposition_contact(
  p_contact uuid,
  p_outcome call_status,
  p_notes   text default null,
  p_seconds int default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.call_list;
begin
  select * into v_row from public.call_list where id = p_contact;
  if not found then
    raise exception 'contact not found';
  end if;
  if not (v_row.claimed_by = auth.uid() or public.is_platform_owner()) then
    raise exception 'not authorized to disposition this contact';
  end if;
  if p_outcome in ('pending','claimed') then
    raise exception 'invalid disposition outcome';
  end if;

  update public.call_list
     set status         = p_outcome,
         notes          = coalesce(p_notes, notes),
         call_seconds   = coalesce(p_seconds, call_seconds),
         disposition_at = now()
   where id = p_contact;

  if p_outcome = 'good' then
    insert into public.leads (
      source, status, campaign_id, call_list_id,
      owner_name, site_address, phone, email, city,
      notes, call_seconds, rep_profile_id
    ) values (
      'telemarketer', 'qualified', v_row.campaign_id, v_row.id,
      v_row.owner_name, v_row.site_address, v_row.phone, v_row.email, v_row.city,
      coalesce(p_notes, v_row.notes), coalesce(p_seconds, v_row.call_seconds), auth.uid()
    );
  end if;
end;
$$;

-- ---------- RPC: release_contact ----------
-- Rep abandons a claim without dispositioning; the contact returns to the queue.
create or replace function public.release_contact(p_contact uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.call_list;
begin
  select * into v_row from public.call_list where id = p_contact;
  if not found then
    raise exception 'contact not found';
  end if;
  if not (v_row.claimed_by = auth.uid() or public.is_platform_owner()) then
    raise exception 'not authorized';
  end if;
  update public.call_list
     set status = 'pending', claimed_by = null, claimed_at = null
   where id = p_contact and status = 'claimed';
end;
$$;

-- ---------- Grants ----------
-- Action RPCs must not be callable anonymously. (Do NOT restrict the boolean
-- helpers is_platform_owner / is_assigned_agent: they are evaluated inside RLS
-- policies under the caller's role, including anon, and must remain executable.)
revoke all on function public.claim_next_contact(uuid) from public;
revoke all on function public.disposition_contact(uuid, call_status, text, int) from public;
revoke all on function public.release_contact(uuid) from public;
grant execute on function public.claim_next_contact(uuid) to authenticated;
grant execute on function public.disposition_contact(uuid, call_status, text, int) to authenticated;
grant execute on function public.release_contact(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.campaigns            enable row level security;
alter table public.campaign_assignments enable row level security;
alter table public.call_list            enable row level security;
alter table public.leads                enable row level security;

-- Owner needs to list staff profiles to assign them to campaigns. This is an
-- additional (OR-combined) SELECT policy on profiles; existing policies remain.
create policy profiles_owner_select on public.profiles for select
  using (public.is_platform_owner());

-- campaigns
create policy campaigns_select on public.campaigns for select
  using (public.is_platform_owner() or public.is_assigned_agent(id));
create policy campaigns_insert on public.campaigns for insert
  with check (public.is_platform_owner());
create policy campaigns_update on public.campaigns for update
  using (public.is_platform_owner()) with check (public.is_platform_owner());
create policy campaigns_delete on public.campaigns for delete
  using (public.is_platform_owner());

-- campaign_assignments
create policy ca_select on public.campaign_assignments for select
  using (public.is_platform_owner() or agent_profile_id = auth.uid());
create policy ca_write on public.campaign_assignments for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());

-- call_list (claim/disposition go through the security-definer RPCs above)
create policy call_list_select on public.call_list for select
  using (public.is_platform_owner() or public.is_assigned_agent(campaign_id));
create policy call_list_insert on public.call_list for insert
  with check (public.is_platform_owner());
create policy call_list_update on public.call_list for update
  using (public.is_platform_owner() or claimed_by = auth.uid())
  with check (public.is_platform_owner() or claimed_by = auth.uid());
create policy call_list_delete on public.call_list for delete
  using (public.is_platform_owner());

-- leads (inserted by disposition_contact(); owner reads/updates; contractor admin
-- may read leads routed to their company later)
create policy leads_select on public.leads for select
  using (
    public.is_platform_owner()
    or (assigned_contractor_id is not null
        and public.has_contractor_role(assigned_contractor_id, array['contractor_admin']::user_role[]))
  );
create policy leads_update on public.leads for update
  using (public.is_platform_owner()) with check (public.is_platform_owner());
