-- 0001_init.sql
-- Core schema for the RMO Supervision CRM.
-- Multi-tenant: every business row is scoped to a `contractor` (tenant/company).
-- Compliance rationale (BPC 7068 / 7068.1) lives in ../CRM-SUPERVISOR-PLAN.md.

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type user_role            as enum ('rmo','contractor_admin','project_manager','field_crew','auditor');
create type qualifier_type       as enum ('rmo','rme');
create type section_7068_1_basis as enum ('common_ownership_20','subsidiary_jv','shared_majority_officers','single_firm');
create type phase_type           as enum ('contract','permit','material_delivery','tearoff','decking','underlayment','city_inspection_presheathing','install','final_inspection','completion');
create type phase_status         as enum ('pending','submitted','under_review','approved','rejected');
create type evidence_type        as enum ('photo','video','doc');
create type review_decision      as enum ('approved','needs_correction','directive');
create type doc_type             as enum ('contract','permit','coi','warranty','other');
create type compliance_type      as enum ('workers_comp','gl_insurance','license_renewal');
create type inspection_type      as enum ('sheathing','nailing','final','other');
create type inspection_result    as enum ('passed','failed','pending');

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- contractors (tenants / companies) ----------
create table public.contractors (
  id             uuid primary key default gen_random_uuid(),
  legal_name     text not null,
  dba            text,
  cslb_license_no text,
  classification text not null default 'C-39',
  license_status text,
  license_expiry date,
  address        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- memberships (access control: user <-> contractor + role) ----------
create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  role          user_role not null,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, contractor_id)
);

-- ---------- qualifier_assignments (legal qualifying relationship + BPC 7068.1 basis) ----------
create table public.qualifier_assignments (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  contractor_id        uuid not null references public.contractors(id) on delete cascade,
  qualifier_type       qualifier_type not null,
  section_7068_1_basis section_7068_1_basis not null default 'common_ownership_20',
  ownership_pct        numeric(5,2), -- must be >= 20 to satisfy the common-ownership exception
  effective_from       date,
  effective_to         date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (profile_id, contractor_id)
);

-- ---------- projects (jobs) ----------
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references public.contractors(id) on delete cascade,
  job_number     text,
  homeowner_name text, -- PII
  site_address   text, -- PII
  roof_type      text,
  scope_summary  text,
  contract_value numeric(12,2),
  status         text not null default 'active',
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (contractor_id, job_number)
);

-- ---------- job_phases ----------
create table public.job_phases (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  phase               phase_type not null,
  status              phase_status not null default 'pending',
  required_photo_count int not null default 1,
  sequence            int,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, phase)
);

-- ---------- documents (contracts, permits, COIs, warranties) ----------
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  doc_type          doc_type not null,
  storage_key       text not null,
  original_filename text,
  sha256_hash       text,
  uploaded_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

-- ---------- evidence (phase photos/videos; integrity via hash + original metadata) ----------
create table public.evidence (
  id                uuid primary key default gen_random_uuid(),
  job_phase_id      uuid not null references public.job_phases(id) on delete cascade,
  type              evidence_type not null default 'photo',
  storage_key       text not null,
  original_filename text,
  mime              text,
  sha256_hash       text,
  captured_at       timestamptz,
  gps_lat           double precision,
  gps_lng           double precision,
  exif              jsonb,
  uploaded_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

-- ---------- permits ----------
create table public.permits (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  permit_no    text,
  jurisdiction text,
  issued_date  date,
  document_id  uuid references public.documents(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- inspections ----------
create table public.inspections (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  type            inspection_type,
  result          inspection_result not null default 'pending',
  inspector_ref   text,
  inspection_date date,
  document_id     uuid references public.documents(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- supervision_reviews (RMO sign-offs = primary CSLB compliance artifact) ----------
create table public.supervision_reviews (
  id                  uuid primary key default gen_random_uuid(),
  job_phase_id        uuid not null references public.job_phases(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id),
  decision            review_decision not null,
  review_notes        text,
  technical_directives text,
  delegated_to        uuid references public.profiles(id),
  reviewed_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- ---------- compliance_records (insurance / license expirations) ----------
create table public.compliance_records (
  id             uuid primary key default gen_random_uuid(),
  contractor_id  uuid not null references public.contractors(id) on delete cascade,
  type           compliance_type not null,
  reference_no   text,
  effective_date date,
  expires_date   date,
  document_id    uuid references public.documents(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- audit_log (append-only) ----------
create table public.audit_log (
  id               bigint generated always as identity primary key,
  actor_profile_id uuid,
  contractor_id    uuid,
  entity           text not null,
  entity_id        text,
  action           text not null,
  data             jsonb,
  ip               text,
  user_agent       text,
  created_at       timestamptz not null default now()
);

-- ---------- indexes ----------
create index on public.memberships (contractor_id);
create index on public.memberships (profile_id);
create index on public.qualifier_assignments (contractor_id);
create index on public.projects (contractor_id);
create index on public.job_phases (project_id);
create index on public.evidence (job_phase_id);
create index on public.documents (project_id);
create index on public.permits (project_id);
create index on public.inspections (project_id);
create index on public.supervision_reviews (job_phase_id);
create index on public.compliance_records (contractor_id);
create index on public.audit_log (contractor_id);

-- ---------- updated_at triggers ----------
create trigger trg_profiles_updated   before update on public.profiles            for each row execute function public.set_updated_at();
create trigger trg_contractors_updated before update on public.contractors        for each row execute function public.set_updated_at();
create trigger trg_memberships_updated before update on public.memberships        for each row execute function public.set_updated_at();
create trigger trg_qualifier_updated   before update on public.qualifier_assignments for each row execute function public.set_updated_at();
create trigger trg_projects_updated    before update on public.projects           for each row execute function public.set_updated_at();
create trigger trg_job_phases_updated  before update on public.job_phases         for each row execute function public.set_updated_at();
create trigger trg_permits_updated     before update on public.permits            for each row execute function public.set_updated_at();
create trigger trg_inspections_updated before update on public.inspections        for each row execute function public.set_updated_at();
create trigger trg_compliance_updated  before update on public.compliance_records for each row execute function public.set_updated_at();
