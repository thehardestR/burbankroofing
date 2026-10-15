-- 0002_rls.sql
-- Row-Level Security = the enforcement layer for multi-tenant isolation.
-- Company A can NEVER read Company B's rows. The RMO sees only the contractors
-- they are a member of. Security is enforced in the database, not the client,
-- so even a compromised frontend cannot cross tenant boundaries.

-- ---------- Helper functions ----------
-- SECURITY DEFINER so they can read `memberships` without triggering that
-- table's own RLS (avoids infinite recursion).
create or replace function public.is_contractor_member(p_contractor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.contractor_id = p_contractor
      and m.profile_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_contractor_role(p_contractor uuid, p_roles user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.contractor_id = p_contractor
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

create or replace function public.shares_contractor(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.contractor_id = me.contractor_id
    where me.profile_id = auth.uid() and me.status = 'active'
      and them.profile_id = p_profile and them.status = 'active'
  );
$$;

-- ---------- Enable RLS ----------
alter table public.profiles              enable row level security;
alter table public.contractors           enable row level security;
alter table public.memberships           enable row level security;
alter table public.qualifier_assignments enable row level security;
alter table public.projects              enable row level security;
alter table public.job_phases            enable row level security;
alter table public.documents             enable row level security;
alter table public.evidence              enable row level security;
alter table public.permits               enable row level security;
alter table public.inspections           enable row level security;
alter table public.supervision_reviews   enable row level security;
alter table public.compliance_records    enable row level security;
alter table public.audit_log             enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_contractor(id));
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- contractors (INSERT/DELETE only via service role during provisioning) ----------
create policy contractors_select on public.contractors for select
  using (public.is_contractor_member(id));
create policy contractors_update on public.contractors for update
  using (public.has_contractor_role(id, array['contractor_admin']::user_role[]))
  with check (public.has_contractor_role(id, array['contractor_admin']::user_role[]));

-- ---------- memberships ----------
create policy memberships_select on public.memberships for select
  using (public.is_contractor_member(contractor_id));
create policy memberships_write on public.memberships for all
  using (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]))
  with check (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]));

-- ---------- qualifier_assignments ----------
create policy qa_select on public.qualifier_assignments for select
  using (public.is_contractor_member(contractor_id));
create policy qa_write on public.qualifier_assignments for all
  using (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]))
  with check (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]));

-- ---------- projects ----------
create policy projects_select on public.projects for select
  using (public.is_contractor_member(contractor_id));
create policy projects_insert on public.projects for insert
  with check (public.has_contractor_role(contractor_id, array['contractor_admin','project_manager']::user_role[]));
create policy projects_update on public.projects for update
  using (public.has_contractor_role(contractor_id, array['contractor_admin','project_manager','rmo']::user_role[]))
  with check (public.has_contractor_role(contractor_id, array['contractor_admin','project_manager','rmo']::user_role[]));
create policy projects_delete on public.projects for delete
  using (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]));

-- ---------- job_phases (scoped via parent project) ----------
create policy job_phases_select on public.job_phases for select
  using (exists (select 1 from public.projects p
                 where p.id = project_id and public.is_contractor_member(p.contractor_id)));
create policy job_phases_write on public.job_phases for all
  using (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','rmo']::user_role[])))
  with check (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','rmo']::user_role[])));

-- ---------- documents ----------
create policy documents_select on public.documents for select
  using (exists (select 1 from public.projects p
                 where p.id = project_id and public.is_contractor_member(p.contractor_id)));
create policy documents_write on public.documents for all
  using (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','field_crew']::user_role[])))
  with check (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','field_crew']::user_role[])));

-- ---------- evidence (scoped via job_phase -> project) ----------
create policy evidence_select on public.evidence for select
  using (exists (select 1 from public.job_phases jp join public.projects p on p.id = jp.project_id
                 where jp.id = job_phase_id and public.is_contractor_member(p.contractor_id)));
create policy evidence_write on public.evidence for all
  using (exists (select 1 from public.job_phases jp join public.projects p on p.id = jp.project_id
                 where jp.id = job_phase_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','field_crew']::user_role[])))
  with check (exists (select 1 from public.job_phases jp join public.projects p on p.id = jp.project_id
                 where jp.id = job_phase_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager','field_crew']::user_role[])));

-- ---------- permits ----------
create policy permits_select on public.permits for select
  using (exists (select 1 from public.projects p
                 where p.id = project_id and public.is_contractor_member(p.contractor_id)));
create policy permits_write on public.permits for all
  using (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager']::user_role[])))
  with check (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager']::user_role[])));

-- ---------- inspections ----------
create policy inspections_select on public.inspections for select
  using (exists (select 1 from public.projects p
                 where p.id = project_id and public.is_contractor_member(p.contractor_id)));
create policy inspections_write on public.inspections for all
  using (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager']::user_role[])))
  with check (exists (select 1 from public.projects p
                 where p.id = project_id
                   and public.has_contractor_role(p.contractor_id, array['contractor_admin','project_manager']::user_role[])));

-- ---------- supervision_reviews (only the RMO signs off; rows are immutable) ----------
create policy sr_select on public.supervision_reviews for select
  using (exists (select 1 from public.job_phases jp join public.projects p on p.id = jp.project_id
                 where jp.id = job_phase_id and public.is_contractor_member(p.contractor_id)));
create policy sr_insert on public.supervision_reviews for insert
  with check (
    reviewer_profile_id = auth.uid()
    and exists (select 1 from public.job_phases jp join public.projects p on p.id = jp.project_id
                where jp.id = job_phase_id
                  and public.has_contractor_role(p.contractor_id, array['rmo']::user_role[]))
  );
-- No UPDATE/DELETE policies => sign-offs cannot be altered or removed (append-only).

-- ---------- compliance_records ----------
create policy compliance_select on public.compliance_records for select
  using (public.is_contractor_member(contractor_id));
create policy compliance_write on public.compliance_records for all
  using (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]))
  with check (public.has_contractor_role(contractor_id, array['contractor_admin']::user_role[]));

-- ---------- audit_log (append-only; no UPDATE/DELETE policies) ----------
create policy audit_select on public.audit_log for select
  using (contractor_id is not null
         and public.has_contractor_role(contractor_id, array['contractor_admin','rmo','auditor']::user_role[]));
create policy audit_insert on public.audit_log for insert
  with check (contractor_id is null or public.is_contractor_member(contractor_id));
