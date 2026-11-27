-- WorkLog Admin MVP: per-employee hourly rates.
-- Admin API uses the Supabase service role after checking the authenticated email.
create table if not exists public.connecteam_staff_pay_rates (
  connecteam_user_id text primary key references public.connecteam_staff_users(connecteam_user_id) on delete cascade,
  hourly_rate numeric not null default 150 check (hourly_rate >= 0 and hourly_rate <= 100000),
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

 
-- Existing employees receive a persisted default rate if they do not have one.
insert into public.connecteam_staff_pay_rates (connecteam_user_id, hourly_rate)
select connecteam_user_id, 150
from public.connecteam_staff_users
on conflict (connecteam_user_id) do nothing;

-- Seed rate history for employees with no history yet. Defaults apply from the
-- first day of the current month; existing custom rates start from today.
insert into public.connecteam_staff_pay_rate_history (connecteam_user_id, hourly_rate, effective_from)
select
  rates.connecteam_user_id,
  rates.hourly_rate,
  case
    when rates.hourly_rate = 150 then date_trunc('month', current_date)::date
    else current_date
  end
from public.connecteam_staff_pay_rates rates
where not exists (
  select 1
  from public.connecteam_staff_pay_rate_history history
  where history.connecteam_user_id = rates.connecteam_user_id
)
on conflict (connecteam_user_id, effective_from) do nothing;
