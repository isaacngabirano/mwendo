# Mwendo Management — POS & Stock System

An offline-first, mobile-friendly Point of Sale and stock management web app
for Mwendo Foods Distributers, built with Next.js + Dexie (IndexedDB) for
local/offline storage, with optional Supabase sync so multiple devices share
live data.

## Running locally (no setup required)

```
npm install
npm run dev
```

Open http://localhost:3000. Without any further setup, the app runs in
**local-only mode**: all data lives in your browser's IndexedDB, and demo
accounts are seeded automatically:

- Owner:   owner@mwendofoods.ug   / owner123
- Cashier: cashier@mwendofoods.ug / cashier123

This mode never talks to the internet and is good for trying the app out,
but each device/browser has its own separate data.

## Turning on multi-device sync (Supabase)

1. Create a free project at https://supabase.com
2. Open the SQL Editor in your Supabase project, paste in the entire
   contents of `supabase/schema.sql`, and click Run.
3. Go to Settings → API in Supabase and copy the "Project URL" and
   "anon public" key.
4. Copy `.env.local.example` to `.env.local` and fill in those two values.
5. In Supabase, go to Authentication → Users → Add User to create your
   first real login.
6. In the SQL Editor, run:
   ```sql
   update profiles set role = 'Owner'
   where id = (select id from auth.users where email = 'the-email-you-used');
   ```
7. Restart `npm run dev` and log in with that email/password.

From this point on:
- Every sale, purchase, product edit, etc. is saved locally first (so the
  till keeps working offline), then synced to Supabase automatically once
  back online.
- Stock changes from sales/purchases go through Postgres functions
  (`record_sale` / `record_purchase` in `supabase/schema.sql`) that update
  stock atomically — safe even if two devices sell the same product at the
  same moment.
- Any other logged-in device sees the change within a second or two via
  Supabase Realtime.
- New logins are added via the Supabase dashboard (Authentication → Users),
  not inside the app — this is intentional: a browser app should never be
  able to create its own logins, for security reasons.

## Importing your real shop data

See `scripts/convert-workbooks.mjs` — it reads the client's original Excel
workbooks and produces clean CSVs (`products.csv`, `suppliers.csv`,
`customers.csv`, plus historical sales/purchases for reference) that match
what Settings → Import Data expects:

```
node scripts/convert-workbooks.mjs "<FULL_REPORT>.xlsx" "<PHASE1>.xlsx" ./converted
```

Then upload each CSV from Settings → Import Data inside the app.

## Deploying

The frontend is a normal Next.js app — Vercel's free tier is the simplest
host (it needs to run a server, not just serve static files, since the app
uses Next.js's app router). Push this repo to GitHub, import it into
Vercel, and add the two `NEXT_PUBLIC_SUPABASE_*` environment variables in
the Vercel project settings (same values as your `.env.local`).
