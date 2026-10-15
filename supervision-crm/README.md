# RMO Supervision CRM

A multi-tenant CRM that lets an **RMO / qualifier** supervise roofing jobs across
multiple C-39 contractors and produce audit-ready evidence of **CSLB "direct
supervision or control"** (BPC §7068.1).

Compliance design and build plan: [../CRM-SUPERVISOR-PLAN.md](../CRM-SUPERVISOR-PLAN.md)

## How companies are separated

Each company is **one row** in the `contractors` table (a "tenant") — **not** a
folder or a separate deployment. Isolation is enforced by **Postgres Row-Level
Security**:

- A company's users see **only their own** jobs, photos, and homeowners.
- The **RMO** sees **only the contractors they are a member of** (all three).
- Company A physically cannot query Company B's data, even via a hacked client.

Adding a company later = insert one `contractors` row + invite its users. No code
changes, no new folders.

## What's built so far

| Layer | Status |
| --- | --- |
| DB schema (`supabase/migrations/0001_init.sql`) | ✅ |
| Row-Level Security / tenant isolation (`0002_rls.sql`) | ✅ |
| Storage buckets + policies | ⬜ next |
| Frontend app | ⬜ pending toolchain choice (see below) |

## Prerequisites

- A free **Supabase** project (Postgres + Auth + Storage): https://supabase.com
- **Node.js LTS** — required only for the frontend build. Not currently installed
  on this machine; install from https://nodejs.org or `winget install OpenJS.NodeJS.LTS`.

## Setup (database)

1. Create a Supabase project; note the **Project URL** and **anon key**
   (Project Settings → API).
2. Apply the migrations in order using the Supabase SQL editor (paste each file)
   or the Supabase CLI:
   ```
   supabase link --project-ref <your-ref>
   supabase db push
   ```
3. Create two **private** Storage buckets: `evidence` and `documents`.
4. Copy `.env.example` to `.env` and fill in the values.

## Security notes

- The **anon key** is safe in the browser; RLS does the protecting.
- The **service_role key** bypasses RLS — keep it server-side only (serverless
  functions). Never commit `.env`.
- `supervision_reviews` (RMO sign-offs) and `audit_log` are **append-only** by
  policy: they can be inserted but not edited or deleted, preserving the
  compliance record.

## Frontend — decision pending

Node/npm are not installed yet, so the frontend stack is the open choice:

- **Option A (recommended): Vite + React + TypeScript** — proper app for growing
  workflows (uploads, dashboards, exports, PWA). Requires installing Node.
- **Option B: build-free static (HTML + vanilla JS + Supabase via CDN)** — zero
  install, matches the existing static-site workflow, but harder to scale.

Pick one and the app shell (auth, contractor switcher, project list, phase
workflow) gets scaffolded next.
