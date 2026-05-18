# GPU Endpoint Scheduling App

Next.js + Supabase app for reserving GPU-backed model sessions under a hard
100-concurrent-user cap. Users submit flexible or rigid session requests, and a
Supabase Edge Function scheduler confirms feasible slots over a rolling 14-day
horizon.

## Stack

- Next.js App Router on Vercel
- Supabase Auth, Postgres, Realtime, Edge Functions
- Supabase `pg_cron` + `pg_net` for 5-minute scheduler invocation
- `react-big-calendar` for user schedules
- Recharts for aggregate utilization
- Pure TypeScript greedy scheduler with Vitest + fast-check tests

## Environment

Copy `.env.example` to `.env.local` and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SCHEDULER_EDGE_FUNCTION_URL=
SCHEDULER_EDGE_FUNCTION_SECRET=
ADMIN_EMAILS=admin@example.com
CANCELLATION_CUTOFF_HOURS=1
```

The service role key must stay server-only. It is used by API routes and the
Edge Function to bypass RLS for controlled server-side work.

## Local Development

```bash
npm install
supabase start
supabase db reset
npm run dev
```

Open `http://localhost:3000`. Configure Supabase Auth redirect URLs to include:

```text
http://localhost:3000/auth/callback
```

## Scheduler Tests

```bash
npm test
```

The scheduler core lives in `src/lib/scheduler`. It is pure:

```ts
scheduleRequests(pending, confirmed, now, config)
```

Tests cover deterministic placements and randomized workloads. The property
test asserts assigned sessions never exceed the configured capacity.

## Algorithm

V1 uses a greedy capacitated interval scheduler:

1. Load pending requests plus pinned confirmed sessions for the 14-day horizon.
2. Bucket time at 5-minute granularity.
3. Seed load from confirmed sessions.
4. Sort pending requests by least flexibility first, then higher fairness score,
   then earlier creation time.
5. For each request, evaluate feasible candidate starts and choose the placement
   with the most remaining capacity across its occupied buckets.
6. Reject requests that have no feasible candidate or would violate the cap.

This is appropriate for the v1 target of roughly 200 users and 800 requests/day.
The scheduler is behind a small interface so a future CP-SAT or ILP worker can
replace it without changing API/UI contracts.

## Supabase Schema

Migrations live in `supabase/migrations` and create:

- `profiles`
- `requests`
- `sessions`
- `scheduler_runs`
- `notifications`
- `utilization_by_bucket` aggregate-only view
- RLS policies for every table
- Auth trigger to create profile rows
- `scheduler_snapshot` and `apply_scheduler_results` RPCs
- `configure_scheduler_cron` helper

All application timestamps are stored as `timestamptz` in UTC. User-facing
datetime input is converted from the user's IANA timezone at the API boundary.

## Edge Function

Deploy the scheduler:

```bash
supabase functions deploy schedule
```

Set function secrets:

```bash
supabase secrets set \
  NEXT_PUBLIC_SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SCHEDULER_EDGE_FUNCTION_SECRET=...
```

The Edge Function reads pending/confirmed data using the service role, runs the
pure scheduler, then applies writes through `apply_scheduler_results`, which
takes a Postgres advisory transaction lock before mutating data.

## Cron

After deploying the Edge Function, configure `pg_cron` from SQL:

```sql
select public.configure_scheduler_cron(
  'https://<project-ref>.functions.supabase.co/schedule',
  '<SCHEDULER_EDGE_FUNCTION_SECRET>'
);
```

This schedules a `pg_net` POST every 5 minutes. The function can also be invoked
on demand from the admin API route, and rigid request creation attempts a
best-effort on-demand trigger when the Edge Function URL/secret are configured.

## Vercel Deploy

Add these Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
SCHEDULER_EDGE_FUNCTION_URL
SCHEDULER_EDGE_FUNCTION_SECRET
ADMIN_EMAILS
CANCELLATION_CUTOFF_HOURS
```

Then deploy with the normal Vercel Git integration or `vercel deploy`.

## Verification Commands

```bash
npm test
npm run lint
npm run build
```
