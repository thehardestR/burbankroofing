-- 0007_multi_phone.sql
-- Multiple phone numbers per contact + "try the next number" cycling.
--
-- call_list.phones holds every usable number for a contact, in order; phone_idx is
-- the 0-based pointer to the one currently shown. `phone` mirrors the current number
-- so existing dialer/leads code keeps working unchanged.

alter table public.call_list add column if not exists phones    text[] not null default '{}';
alter table public.call_list add column if not exists phone_idx  int    not null default 0;

-- Backfill existing single-phone rows into a 1-element list.
update public.call_list
   set phones = array[phone]
 where phone is not null and cardinality(phones) = 0;

-- Advance to the contact's next number on Bad Number / No Answer. While numbers
-- remain, the row stays 'claimed' and `phone` moves to the next one; when the list
-- is exhausted, the given outcome is recorded. Only the claimer (or owner) may call it.
create or replace function public.advance_phone(p_contact uuid, p_exhausted_outcome call_status)
returns public.call_list
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.call_list;
  v_next int;
begin
  select * into v_row from public.call_list where id = p_contact;
  if not found then raise exception 'contact not found'; end if;
  if not (v_row.claimed_by = auth.uid() or public.is_platform_owner()) then
    raise exception 'not authorized';
  end if;
  if p_exhausted_outcome not in ('bad_number','no_answer') then
    raise exception 'invalid outcome';
  end if;

  v_next := v_row.phone_idx + 1;
  if v_next < cardinality(v_row.phones) then
    update public.call_list
       set phone_idx = v_next, phone = v_row.phones[v_next + 1]  -- Postgres arrays are 1-based
     where id = p_contact
     returning * into v_row;
    return v_row;
  end if;

  update public.call_list
     set status = p_exhausted_outcome, disposition_at = now()
   where id = p_contact
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.advance_phone(uuid, call_status) from public;
grant execute on function public.advance_phone(uuid, call_status) to authenticated;
