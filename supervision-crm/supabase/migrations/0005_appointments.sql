-- 0005_appointments.sql — telemarketer can schedule an appointment on a lead.

alter table public.leads add column if not exists appointment_at timestamptz;

-- Recreate disposition_contact with an optional appointment time. Existing 4-arg
-- calls keep working because the new argument defaults to null.
drop function if exists public.disposition_contact(uuid, call_status, text, int);

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

  if p_outcome = 'good' then
    insert into public.leads (
      source, status, campaign_id, call_list_id,
      owner_name, site_address, phone, email, city,
      notes, call_seconds, rep_profile_id, appointment_at
    ) values (
      'telemarketer', 'qualified', v_row.campaign_id, v_row.id,
      v_row.owner_name, v_row.site_address, v_row.phone, v_row.email, v_row.city,
      coalesce(p_notes, v_row.notes), coalesce(p_seconds, v_row.call_seconds), auth.uid(), p_appointment_at
    );
  end if;
end;
$$;

revoke all on function public.disposition_contact(uuid, call_status, text, int, timestamptz) from public;
grant execute on function public.disposition_contact(uuid, call_status, text, int, timestamptz) to authenticated;
