-- 0012_appointments.sql
-- First-class appointments (supersedes the single leads.appointment_at timestamp from 0005) so the
-- Appointments module can track status + reminders. Booking advances the contact to 'appointment'.

create table if not exists public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references public.leads(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  scheduled_at        timestamptz not null,
  status              text not null default 'scheduled', -- scheduled|confirmed|completed|no_show|canceled
  confirmation_sms_id uuid references public.sms_messages(id) on delete set null,
  reminder_sent_at    timestamptz,
  notes               text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists appointments_scheduled_idx on public.appointments (scheduled_at);
create index if not exists appointments_contact_idx on public.appointments (contact_id);

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

create or replace function public.trg_appointment_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    perform public.advance_contact_stage(new.contact_id, 'appointment');
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_lifecycle on public.appointments;
create trigger appointments_lifecycle after insert on public.appointments
  for each row execute function public.trg_appointment_lifecycle();
revoke all on function public.trg_appointment_lifecycle() from public;

-- Backfill from the legacy leads.appointment_at timestamp.
insert into public.appointments (lead_id, contact_id, scheduled_at, created_by, created_at)
select l.id, l.contact_id, l.appointment_at, l.rep_profile_id, l.created_at
  from public.leads l
 where l.appointment_at is not null
   and not exists (select 1 from public.appointments a where a.lead_id = l.id);

-- RLS: owner full; the rep who owns the lead can see/manage its appointments.
alter table public.appointments enable row level security;
drop policy if exists appointments_owner on public.appointments;
create policy appointments_owner on public.appointments for all
  using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists appointments_rep on public.appointments;
create policy appointments_rep on public.appointments for all
  using (exists (select 1 from public.leads l where l.id = lead_id and l.rep_profile_id = auth.uid()))
  with check (exists (select 1 from public.leads l where l.id = lead_id and l.rep_profile_id = auth.uid()));
