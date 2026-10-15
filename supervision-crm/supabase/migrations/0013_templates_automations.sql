-- 0013_templates_automations.sql
-- Reusable email/SMS templates + the built-in funnel automations and their job queue.
-- A pg_cron worker (added with the edge functions) drains automation_jobs; this sets up the config
-- and seed rows so the UI and senders have something to read. Safe to re-run.

create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null, -- 'email' | 'sms'
  key        text not null unique,
  name       text not null,
  subject    text,          -- email only
  body       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

create table if not exists public.automations (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  enabled    boolean not null default true,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists automations_set_updated_at on public.automations;
create trigger automations_set_updated_at before update on public.automations
  for each row execute function public.set_updated_at();

create table if not exists public.automation_jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,            -- no_answer_sms | appt_confirm_sms | appt_reminder | recycle_campaign
  due_at       timestamptz not null default now(),
  status       text not null default 'pending', -- pending | done | failed | skipped
  payload      jsonb not null default '{}'::jsonb,
  last_error   text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists automation_jobs_due_idx on public.automation_jobs (status, due_at);

-- Seed templates. {{ }} vars are resolved by the sender; SMS bodies carry the required STOP line.
insert into public.message_templates (kind, key, name, subject, body) values
  ('email','campaign_intro','Campaign — roof check intro','Is your roof ready, {{first_name}}?',
   '<p>Hi {{first_name}},</p><p>Quick question about the roof at {{site_address}} — when was it last inspected? We''re offering free inspections in {{city}} this month.</p><p><a href="{{cta_url}}">Book a free inspection</a></p>'),
  ('email','storm_alert','Storm alert re-engagement','Storm coming to {{city}} — is your roof good?',
   '<p>{{first_name}}, a storm system is headed for {{city}}.</p><p>Catch leaks before they start — <a href="{{cta_url}}">schedule a free roof inspection</a>.</p>'),
  ('sms','no_answer','No-answer follow-up SMS',null,
   'Hi {{first_name}}, this is Burbank Roofing — we just tried to reach you about a free roof inspection. Reply YES to book. Reply STOP to opt out.'),
  ('sms','appt_confirm','Appointment confirmation SMS',null,
   'Burbank Roofing: your roof inspection is set for {{appt_time}}. Reply C to confirm or R to reschedule. Reply STOP to opt out.'),
  ('sms','appt_reminder','Appointment reminder SMS',null,
   'Reminder: your Burbank Roofing inspection is {{appt_time}}. See you then! Reply STOP to opt out.')
on conflict (key) do nothing;

insert into public.automations (key, name, enabled, params) values
  ('no_answer_sms','Text contacts after a no-answer call', true,  '{"template_key":"no_answer","delay_minutes":5}'::jsonb),
  ('appt_confirm_sms','Text an appointment confirmation on booking', true, '{"template_key":"appt_confirm"}'::jsonb),
  ('appt_reminder','Text an appointment reminder before the visit', true, '{"template_key":"appt_reminder","hours_before":24}'::jsonb),
  ('recycle_campaign','Re-queue no-answer contacts for another pass', false, '{"max_passes":3,"after_days":3}'::jsonb)
on conflict (key) do nothing;

-- RLS: owner-only config; the pg_cron worker / edge functions use the service role (bypasses RLS).
alter table public.message_templates enable row level security;
alter table public.automations        enable row level security;
alter table public.automation_jobs    enable row level security;

drop policy if exists message_templates_owner on public.message_templates;
create policy message_templates_owner on public.message_templates for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists automations_owner on public.automations;
create policy automations_owner on public.automations for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists automation_jobs_owner on public.automation_jobs;
create policy automation_jobs_owner on public.automation_jobs for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());
