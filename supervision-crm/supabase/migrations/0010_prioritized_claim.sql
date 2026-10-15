-- 0010_prioritized_claim.sql
-- Priority dialing + "call again" recycling.
--
-- The email funnel scores contacts (clicked > opened > rest) onto call_list.priority; reps then
-- work the hottest contacts first. claim_next_contact_prioritized mirrors claim_next_contact
-- (0008) but orders by priority first, keeping "never-claimed first" within each priority band so
-- fresh contacts still beat requeued ones at the same priority. recycle_campaign re-queues
-- no-answer contacts for another pass after the funnel, capped by pass_count.

create or replace function public.claim_next_contact_prioritized(p_campaign uuid)
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
  order by priority desc, claimed_at asc nulls first, created_at asc
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

-- Owner re-queues no-answer contacts for another calling pass (bounded by p_max_passes).
-- claimed_at = now() sends them to the back (behind never-claimed contacts), matching 0008.
create or replace function public.recycle_campaign(p_campaign uuid, p_max_passes int default 3)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized';
  end if;

  update public.call_list
     set status = 'pending', claimed_by = null, claimed_at = now(),
         pass_count = pass_count + 1, last_pass_at = now()
   where campaign_id = p_campaign
     and status = 'no_answer'
     and pass_count < p_max_passes;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_next_contact_prioritized(uuid) from public;
grant execute on function public.claim_next_contact_prioritized(uuid) to authenticated;
revoke all on function public.recycle_campaign(uuid, int) from public;
grant execute on function public.recycle_campaign(uuid, int) to authenticated;
