-- 0008_requeue_on_release.sql
-- Fix dialer repeats: a skipped/released contact returned to the FRONT of the queue
-- (claim_next ordered by created_at; release nulled claimed_at), so it was handed
-- straight back to the same rep. Now release stamps claimed_at = now() and claim_next
-- serves never-claimed contacts first, pushing requeued/skipped ones to the back.

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
  order by claimed_at asc nulls first, created_at asc
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
  -- Stamp claimed_at = now() so claim_next sends this contact to the BACK of the queue
  -- (served again only after the fresh, never-claimed contacts) instead of re-serving it.
  update public.call_list
     set status = 'pending', claimed_by = null, claimed_at = now()
   where id = p_contact and status = 'claimed';
end;
$$;

