-- WorkLog Admin MVP: per-employee hourly rates.
-- Admin API uses the Supabase service role after checking the authenticated email.
create table if not exists public.connecteam_staff_pay_rates (
  connecteam_user_id text primary key references public.connecteam_staff_users(connecteam_user_id) on delete cascade,
  hourly_rate numeric not null default 0 check (hourly_rate >= 0 and hourly_rate <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.connecteam_staff_pay_rates enable row level security;
-- Intentionally no client policies: access is only through the server-side admin API.
