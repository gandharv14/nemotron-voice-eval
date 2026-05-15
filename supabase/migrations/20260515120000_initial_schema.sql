create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists btree_gist;

create type request_status as enum ('pending','confirmed','rejected','canceled','completed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  tz text not null default 'UTC',
  fairness_score int not null default 0,
  created_at timestamptz not null default now()
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  duration_min int not null check (duration_min >= 5 and duration_min <= 480 and duration_min % 5 = 0),
  window_start timestamptz not null,
  window_end timestamptz not null,
  rigid boolean not null default false,
  status request_status not null default 'pending',
  reject_reason text,
  created_at timestamptz not null default now(),
  check (window_end > window_start),
  check (window_end - window_start >= make_interval(mins => duration_min))
);

create index requests_user_status_idx on requests (user_id, status, window_start);
create index requests_pending_window_idx on requests (window_start, window_end) where status = 'pending';

create table sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  slot tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  confirmed_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index sessions_user_start_idx on sessions (user_id, start_at);
create index sessions_slot_gist_idx on sessions using gist (slot);

create table scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  requests_seen int,
  placed int,
  rejected int,
  peak_utilization int
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table requests enable row level security;
alter table sessions enable row level security;
alter table scheduler_runs enable row level security;
alter table notifications enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own_timezone" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "requests_select_own" on requests
  for select using (auth.uid() = user_id);

create policy "requests_insert_own" on requests
  for insert with check (auth.uid() = user_id);

create policy "requests_update_own_pending" on requests
  for update using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

create policy "sessions_select_own" on sessions
  for select using (auth.uid() = user_id);

create policy "scheduler_runs_select_authenticated" on scheduler_runs
  for select to authenticated using (true);

create policy "notifications_select_own" on notifications
  for select using (auth.uid() = user_id);

create policy "notifications_update_own_delivery" on notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, tz)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'tz', 'UTC')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace view public.utilization_by_bucket
with (security_barrier = true)
as
with buckets as (
  select generate_series(
    date_trunc('minute', now()),
    date_trunc('minute', now()) + interval '7 days',
    interval '5 minutes'
  ) as bucket_start
)
select
  buckets.bucket_start,
  count(sessions.id)::int as count
from buckets
left join public.sessions
  on sessions.start_at < buckets.bucket_start + interval '5 minutes'
 and sessions.end_at > buckets.bucket_start
group by buckets.bucket_start
order by buckets.bucket_start;

grant select on public.utilization_by_bucket to anon, authenticated;

create or replace function public.scheduler_snapshot(
  horizon_start timestamptz default now(),
  horizon_end timestamptz default now() + interval '14 days'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', requests.id,
          'userId', requests.user_id,
          'durationMin', requests.duration_min,
          'windowStart', requests.window_start,
          'windowEnd', requests.window_end,
          'rigid', requests.rigid,
          'createdAt', requests.created_at,
          'fairnessScore', profiles.fairness_score
        )
        order by requests.created_at
      )
      from requests
      join profiles on profiles.id = requests.user_id
      where requests.status = 'pending'
        and requests.window_end > horizon_start
        and requests.window_start < horizon_end
    ), '[]'::jsonb),
    'confirmed',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sessions.id,
          'requestId', sessions.request_id,
          'userId', sessions.user_id,
          'startAt', sessions.start_at,
          'endAt', sessions.end_at
        )
        order by sessions.start_at
      )
      from sessions
      where sessions.end_at > horizon_start
        and sessions.start_at < horizon_end
    ), '[]'::jsonb)
  );
$$;

create or replace function public.apply_scheduler_results(
  p_started_at timestamptz,
  p_assignments jsonb,
  p_rejections jsonb,
  p_metrics jsonb
)
returns public.scheduler_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.scheduler_runs;
begin
  perform pg_advisory_xact_lock(902100100);

  with assignment_rows as (
    select *
    from jsonb_to_recordset(coalesce(p_assignments, '[]'::jsonb))
      as row(request_id uuid, start_at timestamptz, end_at timestamptz)
  ),
  inserted as (
    insert into sessions (request_id, user_id, start_at, end_at)
    select row.request_id, requests.user_id, row.start_at, row.end_at
    from assignment_rows row
    join requests on requests.id = row.request_id
    where requests.status = 'pending'
    on conflict (request_id) do nothing
    returning request_id, user_id, start_at, end_at
  ),
  updated_requests as (
    update requests
    set status = 'confirmed',
        reject_reason = null
    where id in (select request_id from inserted)
    returning id, user_id, duration_min
  ),
  fairness as (
    select user_id, sum(duration_min)::int as served_min
    from updated_requests
    group by user_id
  ),
  profile_updates as (
    update profiles
    set fairness_score = profiles.fairness_score - fairness.served_min
    from fairness
    where profiles.id = fairness.user_id
    returning profiles.id
  )
  insert into notifications (user_id, kind, payload)
  select inserted.user_id, 'session_confirmed',
    jsonb_build_object(
      'requestId', inserted.request_id,
      'startAt', inserted.start_at,
      'endAt', inserted.end_at
    )
  from inserted;

  with rejection_rows as (
    select *
    from jsonb_to_recordset(coalesce(p_rejections, '[]'::jsonb))
      as row(request_id uuid, reason text)
  ),
  updated_rejections as (
    update requests
    set status = 'rejected',
        reject_reason = rejection_rows.reason
    from rejection_rows
    where requests.id = rejection_rows.request_id
      and requests.status = 'pending'
    returning requests.id, requests.user_id, requests.duration_min, requests.reject_reason
  ),
  fairness as (
    select user_id, sum(duration_min)::int as rejected_min
    from updated_rejections
    group by user_id
  ),
  profile_updates as (
    update profiles
    set fairness_score = profiles.fairness_score + fairness.rejected_min
    from fairness
    where profiles.id = fairness.user_id
    returning profiles.id
  )
  insert into notifications (user_id, kind, payload)
  select updated_rejections.user_id, 'request_rejected',
    jsonb_build_object(
      'requestId', updated_rejections.id,
      'reason', updated_rejections.reject_reason
    )
  from updated_rejections;

  insert into scheduler_runs (
    started_at,
    ended_at,
    requests_seen,
    placed,
    rejected,
    peak_utilization
  )
  values (
    p_started_at,
    now(),
    coalesce((p_metrics ->> 'requestsSeen')::int, 0),
    coalesce((p_metrics ->> 'placed')::int, 0),
    coalesce((p_metrics ->> 'rejected')::int, 0),
    coalesce((p_metrics ->> 'peakUtilization')::int, 0)
  )
  returning * into run_row;

  return run_row;
end;
$$;

create or replace function public.configure_scheduler_cron(
  edge_function_url text,
  scheduler_secret text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform cron.unschedule('gpu_scheduler_every_5_min');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'gpu_scheduler_every_5_min',
    '*/5 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-scheduler-secret', %L
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $job$,
      edge_function_url,
      scheduler_secret
    )
  );
end;
$$;

grant execute on function public.scheduler_snapshot(timestamptz, timestamptz) to service_role;
grant execute on function public.apply_scheduler_results(timestamptz, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.configure_scheduler_cron(text, text) to service_role;

create or replace function public.increment_fairness_score(
  p_user_id uuid,
  p_delta int
)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set fairness_score = fairness_score + p_delta
  where id = p_user_id;
$$;

grant execute on function public.increment_fairness_score(uuid, int) to service_role;
