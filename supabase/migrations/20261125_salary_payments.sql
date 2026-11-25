-- Track salary payments per user and earning month.
-- Each partial or full payout is a separate immutable ledger entry with its actual payment date.

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists salary_payments_user_month_paid_at_idx
  on public.salary_payments (user_id, period_month desc, paid_at desc);

alter table public.salary_payments enable row level security;

drop policy if exists "Users can manage their own salary payments" on public.salary_payments;
create policy "Users can manage their own salary payments"
  on public.salary_payments
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.salary_payments to authenticated;
