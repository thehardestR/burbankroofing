-- 0004_crm.sql — Owner CRM + rep leads access. Written to be safe to re-run.

alter table public.leads add column if not exists service_type text;

-- Reps: see and add only their OWN leads (dialer "My Leads" tab).
drop policy if exists leads_rep_select on public.leads;
create policy leads_rep_select on public.leads for select
  using (rep_profile_id = auth.uid());
drop policy if exists leads_rep_insert on public.leads;
create policy leads_rep_insert on public.leads for insert
  with check (rep_profile_id = auth.uid());

-- Owner: add and remove leads from the CRM.
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (public.is_platform_owner());
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using (public.is_platform_owner());

-- ---------- lead documents ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'lead_doc_type') then
    create type lead_doc_type as enum ('eagleview','permit','contract','measurement','photo','other');
  end if;
end $$;

create table if not exists public.lead_documents (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references public.leads(id) on delete cascade,
  doc_type          lead_doc_type not null default 'other',
  title             text,
  storage_key       text not null,      -- path inside the 'lead-docs' storage bucket
  original_filename text,
  uploaded_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index if not exists lead_documents_lead_idx on public.lead_documents (lead_id);

alter table public.lead_documents enable row level security;
drop policy if exists lead_docs_select on public.lead_documents;
create policy lead_docs_select on public.lead_documents for select
  using (public.is_platform_owner());
drop policy if exists lead_docs_insert on public.lead_documents;
create policy lead_docs_insert on public.lead_documents for insert
  with check (public.is_platform_owner());
drop policy if exists lead_docs_delete on public.lead_documents;
create policy lead_docs_delete on public.lead_documents for delete
  using (public.is_platform_owner());

-- ---------- storage bucket for the files (private) ----------
insert into storage.buckets (id, name, public)
values ('lead-docs', 'lead-docs', false)
on conflict (id) do nothing;

-- Only the owner can read/write files in this bucket (served via signed URLs).
drop policy if exists "lead_docs_storage_all" on storage.objects;
create policy "lead_docs_storage_all" on storage.objects for all
  using (bucket_id = 'lead-docs' and public.is_platform_owner())
  with check (bucket_id = 'lead-docs' and public.is_platform_owner());
