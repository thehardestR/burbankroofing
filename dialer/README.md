# Roofing Dialer

A simple, installable iPad web app for a telemarketer. You (the owner) upload a call
list; reps log in and the campaign is already loaded. Reps dial through a paired
iPhone, time each call, and mark each contact **Good Lead** (sent to your inbox) or
**Not Interested**. Multiple reps can share a campaign without ever calling the same
person.

Part of the lead ecosystem described in [../DIALER-PLAN.md](../DIALER-PLAN.md). It writes
to the same Supabase project as `supervision-crm`.

## One-time setup

1. **Database** — in your Supabase project's SQL editor, run these migrations **in order**
   (skip the first two only if this project already has them):
   [0001_init.sql](../supervision-crm/supabase/migrations/0001_init.sql) →
   [0002_rls.sql](../supervision-crm/supabase/migrations/0002_rls.sql) →
   [0003_dialer.sql](../supervision-crm/supabase/migrations/0003_dialer.sql).
2. **Create your owner login** — Supabase → Authentication → Users → **Add user** (your
   email + password). A fresh database has no owner yet, so run this once in the SQL editor
   (replace the email and company name) to make yourself the RMO/owner:
   ```sql
   -- ensure your profile exists
   insert into public.profiles (id, email)
   select id, email from auth.users where email = 'you@example.com'
   on conflict (id) do nothing;

   -- create your company and make you its owner (RMO)
   with c as (
     insert into public.contractors (legal_name, classification)
     values ('Your Company', 'C-39')
     returning id
   )
   insert into public.memberships (profile_id, contractor_id, role, status)
   select (select id from auth.users where email = 'you@example.com'), c.id, 'rmo', 'active'
   from c;
   ```
3. **Config** — put your Project URL + anon key in [js/config.js](js/config.js)
   (Supabase → Project Settings → API). The anon key is safe in the browser; Row-Level
   Security protects the data.
4. **Deploy** — create a new Netlify site from this repo with **Base directory** = `dialer`.
5. **Create rep logins** — Supabase → Authentication → Users → add each telemarketer
   (email + password). Ask each rep to open the app and sign in once so their profile is
   created; after that they show up in your **Assign reps** list.

> The owner is whoever holds an active `rmo` membership. Everyone else who logs in is
> treated as a rep. That's why step 2 is required on a brand-new project.

## iPad: install + calling

- Open the site in **Safari → Share → Add to Home Screen**. It launches full-screen.
- The iPad has no cellular radio, so calls go through a **paired iPhone**:
  - iPad + iPhone signed into the **same Apple ID**.
  - iPhone → **Settings → Phone → Calls on Other Devices →** enable the iPad.
  - **Wi-Fi Calling ON**; both devices on the same Wi-Fi and near each other.
- Tapping **Call** opens `tel:` → the iPhone dials → the timer starts. (FaceTime audio is
  a fallback. If you never pair a phone, the Call button still starts the timer while the
  rep dials elsewhere.)

## Owner: run a campaign

1. Log in with your owner account.
2. **Upload a campaign** → name it → choose the CSV/Excel file → match the columns
   (Name / Address / Phone / City / Email) → **Upload**. Rows without a phone number are
   skipped.
3. **Assign reps** to the campaign.
4. Watch **Campaign progress** (worked / total, good, no).

## Telemarketer runbook

1. Open the app icon and **log in** (first time only). Keep your iPhone nearby, unlocked,
   on the same Wi-Fi.
2. Your assigned campaign loads automatically and shows the first contact
   (**Name, Address, Phone**).
3. Tap **Call** and confirm *"Call with iPhone."* The **timer** runs while you talk.
4. Tap **End**, then type **Notes**.
5. Choose an outcome:
   - **Yes — Good Lead** → sent to the owner.
   - **No — Not Interested** → hidden from your list (kept for reporting).
   - **No Answer** / **Bad Number** for those cases.
6. The next contact loads automatically. You'll never get someone another rep is already
   calling.

## Notes & limits

- **Online-first.** Pulling a new contact needs a connection (that's how two reps avoid
  colliding). If saving an outcome fails, the app keeps the contact so you can retry.
- **Compliance.** Outbound calling is subject to **TCPA/DNC** rules — scrub against
  Do-Not-Call lists, honor opt-outs, and call only within legal hours.
- **Icon.** iOS uses a page snapshot for the home-screen icon unless you add a PNG
  `apple-touch-icon`. Optional polish; the app works without it.
