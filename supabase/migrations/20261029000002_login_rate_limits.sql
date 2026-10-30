begin;

create table public.login_rate_limits (
  key_hash text primary key,
  attempts integer not null check (attempts between 1 and 11),
  expires_at timestamptz not null
);
create index login_rate_limits_expires_at_idx on public.login_rate_limits (expires_at);
alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from public, anon, authenticated;

commit;
