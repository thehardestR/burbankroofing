-- 0014_membership_titles.sql
-- Free-text job title (e.g., Marketing, CEO) shown next to the permission role in the CRM.
alter table public.memberships add column if not exists title text;
