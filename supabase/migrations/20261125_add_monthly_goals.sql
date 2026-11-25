-- Persist each user's monthly goal in their profile.
alter table public.profiles
  add column if not exists monthly_goal_type text
    check (monthly_goal_type in ('income', 'hours')),
  add column if not exists monthly_goal_value numeric
    check (monthly_goal_value > 0);

alter table public.profiles
  add constraint profiles_monthly_goal_pair_check
  check ((monthly_goal_type is null and monthly_goal_value is null) or (monthly_goal_type is not null and monthly_goal_value is not null));
