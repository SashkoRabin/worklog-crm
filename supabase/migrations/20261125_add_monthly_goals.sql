-- Persist each user's monthly goal in their profile.
alter table public.profiles
  add column if not exists monthly_goal_type text
    check (monthly_goal_type in ('income', 'hours')),
  add column if not exists monthly_goal_value numeric
    check (monthly_goal_value > 0);
