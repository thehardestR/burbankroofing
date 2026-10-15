-- 0011_campaign_tracking.sql
-- Per-recipient channel tracking for the funnel: email opens/clicks/replies, SMS, and calls.
-- Rows are written by Telnyx webhooks (service role). Email engagement feeds call_list.priority
-- (clicked > opened) and advances the contact to 'engaged'. Safe to re-run.

-- ---------- email ----------
create table if not exists public.email_messages (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid references public.campaigns(id) on delete set null,
  contact_id        uuid references public.contacts(id) on delete set null,
  call_list_id      uuid references public.call_list(id) on delete set null,
  telnyx_message_id text,
  template_key      text,
  to_email          text,
  subject           text,
  status            text not null default 'queued',
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  bounced_at        timestamptz,
  complained_at     timestamptz,
  replied_at        timestamptz,
  reply_excerpt     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists email_messages_telnyx_key on public.email_messages (telnyx_message_id) where telnyx_message_id is not null;
create index if not exists email_messages_campaign_idx on public.email_messages (campaign_id);
create index if not exists email_messages_contact_idx on public.email_messages (contact_id);

create table if not exists public.email_events (
  id               uuid primary key default gen_random_uuid(),
  email_message_id uuid references public.email_messages(id) on delete cascade,
  type             text not null,
  payload          jsonb,
  occurred_at      timestamptz not null default now()
);
create index if not exists email_events_msg_idx on public.email_events (email_message_id);

-- ---------- sms ----------
create table if not exists public.sms_messages (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid references public.campaigns(id) on delete set null,
  contact_id        uuid references public.contacts(id) on delete set null,
  call_list_id      uuid references public.call_list(id) on delete set null,
  direction         text not null default 'outbound',
  telnyx_message_id text,
  from_number       text,
  to_number         text,
  body              text,
  status            text not null default 'queued',
  is_opt_out        boolean not null default false,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  received_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sms_messages_contact_idx on public.sms_messages (contact_id);
create unique index if not exists sms_messages_telnyx_key on public.sms_messages (telnyx_message_id) where telnyx_message_id is not null;

-- ---------- calls ----------
create table if not exists public.call_log (
  id                     uuid primary key default gen_random_uuid(),
  call_list_id           uuid references public.call_list(id) on delete set null,
  contact_id             uuid references public.contacts(id) on delete set null,
  rep_profile_id         uuid references public.profiles(id),
  telnyx_call_control_id text,
  direction              text not null default 'outbound',
  from_number            text,
  to_number              text,
  status                 text not null default 'initiated',
  started_at             timestamptz,
  answered_at            timestamptz,
  ended_at               timestamptz,
  duration_seconds       int,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists call_log_contact_idx on public.call_log (contact_id);
create index if not exists call_log_rep_idx on public.call_log (rep_profile_id);

drop trigger if exists email_messages_set_updated_at on public.email_messages;
create trigger email_messages_set_updated_at before update on public.email_messages for each row execute function public.set_updated_at();
drop trigger if exists sms_messages_set_updated_at on public.sms_messages;
create trigger sms_messages_set_updated_at before update on public.sms_messages for each row execute function public.set_updated_at();
drop trigger if exists call_log_set_updated_at on public.call_log;
create trigger call_log_set_updated_at before update on public.call_log for each row execute function public.set_updated_at();

-- ---------- record_email_event: webhook entry point that also scores engagement ----------
create or replace function public.record_email_event(p_telnyx_id text, p_type text, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_msg public.email_messages;
  v_pri int;
begin
  select * into v_msg from public.email_messages where telnyx_message_id = p_telnyx_id;
  if not found then return; end if;

  insert into public.email_events (email_message_id, type, payload) values (v_msg.id, p_type, p_payload);

  update public.email_messages set
    status        = p_type,
    delivered_at  = case when p_type = 'delivered'  then coalesce(delivered_at, now())  else delivered_at end,
    opened_at     = case when p_type = 'opened'     then coalesce(opened_at, now())     else opened_at end,
    clicked_at    = case when p_type = 'clicked'    then coalesce(clicked_at, now())    else clicked_at end,
    bounced_at    = case when p_type = 'bounced'    then coalesce(bounced_at, now())    else bounced_at end,
    complained_at = case when p_type = 'complained' then coalesce(complained_at, now()) else complained_at end,
    replied_at    = case when p_type = 'replied'    then coalesce(replied_at, now())    else replied_at end,
    reply_excerpt = case when p_type = 'replied'    then coalesce(p_payload->>'excerpt', reply_excerpt) else reply_excerpt end
  where id = v_msg.id;

  if v_msg.contact_id is not null then
    v_pri := case p_type when 'clicked' then 3 when 'opened' then 1 else 0 end;
    if v_pri > 0 then
      update public.contacts set engagement_score = engagement_score + v_pri where id = v_msg.contact_id;
      perform public.advance_contact_stage(v_msg.contact_id, 'engaged');
      update public.call_list set priority = greatest(priority, v_pri)
        where contact_id = v_msg.contact_id and status in ('pending', 'claimed');
    end if;
    if p_type = 'complained' then
      update public.contacts set email_opt_out = true where id = v_msg.contact_id;
    end if;
  end if;
end;
$$;

-- ---------- RLS (owner-scoped; service role bypasses for webhooks) ----------
alter table public.email_messages enable row level security;
alter table public.email_events   enable row level security;
alter table public.sms_messages   enable row level security;
alter table public.call_log       enable row level security;

drop policy if exists email_messages_owner on public.email_messages;
create policy email_messages_owner on public.email_messages for all using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists email_events_owner on public.email_events;
create policy email_events_owner on public.email_events for select using (public.is_platform_owner());
drop policy if exists sms_messages_owner on public.sms_messages;
create policy sms_messages_owner on public.sms_messages for all using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists call_log_owner on public.call_log;
create policy call_log_owner on public.call_log for all using (public.is_platform_owner()) with check (public.is_platform_owner());
-- Reps see/append/update only their own call rows (softphone writes these).
drop policy if exists call_log_rep_select on public.call_log;
create policy call_log_rep_select on public.call_log for select using (rep_profile_id = auth.uid());
drop policy if exists call_log_rep_insert on public.call_log;
create policy call_log_rep_insert on public.call_log for insert with check (rep_profile_id = auth.uid());
drop policy if exists call_log_rep_update on public.call_log;
create policy call_log_rep_update on public.call_log for update using (rep_profile_id = auth.uid()) with check (rep_profile_id = auth.uid());

revoke all on function public.record_email_event(text, text, jsonb) from public;
grant execute on function public.record_email_event(text, text, jsonb) to service_role;

-- ---------- mark_sms_opt_out: honor STOP replies (matches any of a contact's numbers) ----------
create or replace function public.mark_sms_opt_out(p_phone_last10 text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.contacts
     set sms_opt_out = true
   where phone_norm = p_phone_last10
      or exists (select 1 from unnest(phones) ph where public.norm_phone(ph) = p_phone_last10);
end;
$$;
revoke all on function public.mark_sms_opt_out(text) from public;
grant execute on function public.mark_sms_opt_out(text) to service_role;
