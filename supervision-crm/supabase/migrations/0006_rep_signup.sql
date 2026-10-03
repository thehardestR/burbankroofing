-- 0006_rep_signup.sql
-- Self-service telemarketer signup with owner approval.
--
-- Reps register themselves in the dialer and land as 'pending'. The owner (RMO)
-- approves them before they can work campaigns. The approval flag lives in its
-- OWN table — NOT on profiles — because profiles_update lets a user edit their
-- own row, so a rep could otherwise self-approve. Here a rep may insert only
-- their own 'pending' row and read it back; only the owner can change status.

create table public.telemarketers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status     text not null default 'pending', -- pending | approved | rejected | disabled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index telemarketers_status_idx on public.telemarketers (status);

create trigger telemarketers_set_updated_at before update on public.telemarketers
  for each row execute function public.set_updated_at();

-- Grandfather in existing reps (anyone already assigned to a campaign) so the
-- live system keeps working the moment this migration runs.
insert into public.telemarketers (profile_id, status)
  select distinct agent_profile_id, 'approved' from public.campaign_assignments
  on conflict (profile_id) do nothing;

alter table public.telemarketers enable row level security;

-- A rep may create ONLY their own pending row (cannot self-approve).
create policy telemarketers_self_insert on public.telemarketers for insert
  with check (profile_id = auth.uid() and status = 'pending');

-- A rep reads their own row; the owner reads all (to show the approval queue).
create policy telemarketers_select on public.telemarketers for select
  using (profile_id = auth.uid() or public.is_platform_owner());

-- Only the owner may change or remove approval state.
create policy telemarketers_owner_update on public.telemarketers for update
  using (public.is_platform_owner()) with check (public.is_platform_owner());
create policy telemarketers_owner_delete on public.telemarketers for delete
  using (public.is_platform_owner());

-- Owner-only helper to approve/reject/disable a rep (centralizes validation).
create or replace function public.set_rep_status(p_profile uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('pending','approved','rejected','disabled') then
    raise exception 'invalid status';
  end if;
  update public.telemarketers set status = p_status where profile_id = p_profile;
end;
$$;

revoke all on function public.set_rep_status(uuid, text) from public;
grant execute on function public.set_rep_status(uuid, text) to authenticated;
