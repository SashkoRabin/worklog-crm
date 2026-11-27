-- WorkLog Admin MVP: per-employee hourly rates.
-- Admin API uses the Supabase service role after checking the authenticated email.
create table if not exists public.connecteam_staff_pay_rates (
  connecteam_user_id text primary key references public.connecteam_staff_users(connecteam_user_id) on delete cascade,
  hourly_rate numeric not null default 0 check (hourly_rate >= 0 and hourly_rate <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.connecteam_staff_pay_rates enable row level security;
-- Intentionally no client policies: access is only through the server-side admin API.

-- Effective-dated rate history keeps prior payroll estimates stable.
create table if not exists public.connecteam_staff_pay_rate_history (
  id uuid primary key default gen_random_uuid(),
  connecteam_user_id text not null references public.connecteam_staff_users(connecteam_user_id) on delete cascade,
  hourly_rate numeric not null check (hourly_rate >= 0 and hourly_rate <= 100000),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (connecteam_user_id, effective_from)
);
create index if not exists connecteam_staff_pay_rate_history_lookup_idx
  on public.connecteam_staff_pay_rate_history (connecteam_user_id, effective_from desc);
alter table public.connecteam_staff_pay_rate_history enable row level security;
