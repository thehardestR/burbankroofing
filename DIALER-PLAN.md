# Telemarketer Dialer + Lead Ecosystem — Build Plan

Version-controlled execution plan. Working notes also live in the assistant's session memory.

## Goal

You (the owner) upload a call **campaign** (CSV/Excel) centrally. Telemarketers **log in on an
iPad and the campaign is already loaded** — nothing is imported on the device. Multiple reps can
work the same list at once, and **contact claiming** guarantees two people never call the same
person. A "good" call becomes a **lead** in your inbox; "No" marks the contact *not-interested*
(kept for reporting/DNC). This grows into an owner dashboard (leads + PM job progress), a canvasser
app, and lead→job conversion into the existing supervision CRM. One shared **Supabase** backend
(same project as `supervision-crm`), free tier.

## Confirmed decisions

- **Scope:** full ecosystem, built in phases. Phase 1 (dialer) first.
- **Lead store:** Supabase (same project as `supervision-crm`).
- **Campaigns:** owner uploads centrally → `campaigns` + `call_list` rows. Reps get them preloaded.
- **Rep login:** per-rep Supabase Auth account (email + password). Reps are lead-gen staff, not
  contractor members; leads are "pre-tenant" until routed to a contractor.
- **Multi-rep:** atomic contact **claiming** via a Postgres function (`FOR UPDATE SKIP LOCKED`);
  stale claims (>15 min) are reclaimable.
- **"No" button:** soft delete → `not_interested`, hidden from the rep, retained for reporting/DNC.
- **iPad calling:** paired iPhone (Wi-Fi/Continuity). Call = `tel:` + start timer; End = stop.
- **Import:** CSV + XLSX (PapaParse + SheetJS) at upload time (owner side).
- **Dialer tech:** build-free static PWA (HTML + vanilla JS + `supabase-js` via CDN). No Node build.

## Existing architecture reused

- Supabase Postgres + Auth + RLS. Helpers `is_contractor_member`, `has_contractor_role`,
  `shares_contractor`; roles enum `user_role` (rmo, contractor_admin, project_manager, field_crew,
  auditor); `set_updated_at()` trigger. Migrations in `supervision-crm/supabase/migrations/`.
- React/Vite dashboard app in `supervision-crm/src` (Phase 2 extends it).
- Netlify serverless pattern in `netlify/functions/admin-upload.js` (password-gated) — reused only
  if agent auto-provisioning is added later.

## Phases

### Phase 0 — Backend (`supervision-crm/supabase/migrations/0003_dialer.sql`)

- Enums: `lead_source`, `lead_status`, `call_status`.
- Tables: `campaigns`, `campaign_assignments`, `call_list`, `leads`.
- Helpers: `is_platform_owner()` (any active rmo membership = the owner), `is_assigned_agent(campaign)`.
- RPCs (security definer): `claim_next_contact(campaign)`, `disposition_contact(contact, outcome, notes, seconds)`,
  `release_contact(contact)`.
- RLS: owner full access; reps see/claim only their assigned campaigns; `leads` inserted by the
  disposition RPC. Extra `profiles` select policy so the owner can list agents to assign.

### Phase 1 — Dialer PWA (`dialer/`) — immediate deliverable

- `index.html` (login / owner / rep screens), `css/dialer.css`, `js/config.js`, `js/app.js`
  (auth + role routing + profile upsert + service-worker registration), `js/owner.js` (parse +
  column-map + bulk insert + assign reps), `js/rep.js` (claim → call/timer → disposition loop).
- `manifest.webmanifest`, `sw.js`, `icon.svg` — installable full-screen PWA.
- `netlify.toml` — deploy as a **separate** Netlify site (base directory `dialer`).
- `README.md` — device setup + telemarketer runbook.

### Phase 2 — Owner dashboard (extends `supervision-crm` React app)

- `pages/Campaigns.tsx` (live progress, create/assign, pause/resume) and `pages/Leads.tsx`
  (unified inbox, filters, CSV export); routes + nav + Dashboard summary widgets; new `types.ts`.

### Phase 3 — Canvasser app

- Reuse the dialer PWA as a doorstep capture form (`source='canvasser'`, optional GPS), offline-first.

### Phase 4 — Lead→Job conversion + enrichment

- Dashboard "Convert to job" creates a `projects` row for a PM (sets `converted_project_id`).
- Optional address→owner enrichment (ATTOM/Estated/Regrid) fills `leads.enrichment`.

## Setup / deploy

1. **Database:** in the new Supabase project's SQL editor, run the migrations **in order**:
   `0001_init.sql` → `0002_rls.sql` → `0003_dialer.sql` (all under
   `supervision-crm/supabase/migrations/`).
2. **Owner:** add your own user under Authentication → Users, then run the owner-bootstrap
   snippet in `dialer/README.md` (creates your profile + company + `rmo` membership) so the
   app recognizes you as the owner.
3. **Config:** copy your Project URL + anon key into `dialer/js/config.js`.
4. **Reps:** invite each telemarketer in Supabase Auth (Authentication → Users). Have them open the
   dialer and log in once so their profile is created.
5. **Deploy:** create a new Netlify site with **base directory** `dialer`. Add the dialer URL to the
   iPad home screen (Safari → Share → Add to Home Screen).
6. **Run a campaign:** log in as the owner → Upload Campaign → map columns → assign reps.

## Compliance (telemarketing)

Outbound calling is subject to **TCPA/DNC**: scrub numbers against Do-Not-Call, honor opt-outs
(`dnc` disposition), enforce calling hours, and retain disposition records. Add a calling-hours
guard + DNC handling before scaling volume.

## Verification

- **Backend:** two concurrent `claim_next_contact` calls return **different** contacts;
  `disposition_contact('good')` creates a `leads` row; a rep cannot read another campaign.
- **Dialer:** owner uploads a sample CSV *and* XLSX and assigns a rep; the rep logs in and the list
  is preloaded; Call dials via the paired iPhone with a running timer; Yes creates a lead (with
  duration + notes); No removes it from the queue; a second rep gets a different contact.
