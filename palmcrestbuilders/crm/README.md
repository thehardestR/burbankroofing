# Palm Crest CRM (owner)

Owner-only web app to manage every lead in one place — from the dialer, the canvasser,
web forms, or entered by hand — and attach documents (EagleView reports, permits, etc.).
Reads the same Supabase project as the dialer.

## What it does

- **All leads in a table** — filter by source, status, rep, and type; free-text search.
- **Add a lead by hand** — name, phone, address, city, email, type (roof, turf, …), notes.
- **Open a lead** — edit status/type/notes, see which rep it came from and call details.
- **Attach files** — upload EagleView reports, permits, contracts, photos to secure
  Supabase Storage; open them via short-lived signed links.
- **Download CSV** — export the current leads for Excel.

## Setup

1. Run [../supervision-crm/supabase/migrations/0004_crm.sql](../supervision-crm/supabase/migrations/0004_crm.sql)
   in the Supabase SQL editor (adds `service_type`, the `lead_documents` table, the
   `lead-docs` storage bucket, and the owner/rep policies). Safe to re-run.
2. `js/config.js` already points at the same project as the dialer.
3. Deploy as its own Netlify site with **Base directory** = `crm` (or drag the `crm` folder in).
4. Sign in with your **owner** account (the `rmo` login). Non-owners get an "owner only" screen.

## Notes

- Access is owner-only via the `is_platform_owner()` policy; documents live in a **private**
  bucket and are only reachable through signed URLs the app generates.
- Reps get their own lightweight "My Leads" view inside the dialer; this CRM is the full
  owner view of everything.
