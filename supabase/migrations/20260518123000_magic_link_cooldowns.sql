create table if not exists auth_magic_link_cooldowns (
  email_hash text primary key,
  last_requested_at timestamptz,
  next_request_at timestamptz not null default now(),
  rate_limited_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_magic_link_cooldowns_next_request_at_idx
  on auth_magic_link_cooldowns (next_request_at);

alter table auth_magic_link_cooldowns enable row level security;

-- Magic-link request throttling is enforced only through service-role API routes.
-- RLS blocks direct anon/authenticated access by default.
create or replace function public.reserve_magic_link_request(
  p_email_hash text,
  p_cooldown_seconds int
)
returns table (
  allowed boolean,
  retry_after_seconds int,
  retry_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_retry_at timestamptz;
  reserved_until timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_email_hash));

  select greatest(next_request_at, coalesce(rate_limited_until, '-infinity'::timestamptz))
    into existing_retry_at
    from public.auth_magic_link_cooldowns
    where email_hash = p_email_hash
    for update;

  if existing_retry_at is not null and existing_retry_at > now() then
    return query
      select
        false,
        greatest(1, ceil(extract(epoch from existing_retry_at - now()))::int),
        existing_retry_at;
    return;
  end if;

  reserved_until := now() + make_interval(secs => p_cooldown_seconds);

  insert into public.auth_magic_link_cooldowns (
    email_hash,
    last_requested_at,
    next_request_at,
    rate_limited_until,
    last_error,
    updated_at
  )
  values (
    p_email_hash,
    now(),
    reserved_until,
    null,
    null,
    now()
  )
  on conflict (email_hash) do update
    set last_requested_at = excluded.last_requested_at,
        next_request_at = excluded.next_request_at,
        rate_limited_until = null,
        last_error = null,
        updated_at = excluded.updated_at;

  return query select true, p_cooldown_seconds, reserved_until;
end;
$$;

revoke all on function public.reserve_magic_link_request(text, int) from public;
grant execute on function public.reserve_magic_link_request(text, int) to service_role;
