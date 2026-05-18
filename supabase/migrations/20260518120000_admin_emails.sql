create table if not exists admin_emails (
  email text primary key,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_emails_lower_email_idx
  on admin_emails (lower(email));

alter table admin_emails enable row level security;

-- Reads/writes go exclusively through the service-role admin client,
-- so no policies for anon/authenticated are needed. RLS is enabled
-- as a safety net to block anon/authenticated traffic by default.
