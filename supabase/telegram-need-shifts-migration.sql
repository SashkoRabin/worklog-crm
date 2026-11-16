create table if not exists public.telegram_need_shifts (
  telegram_user_id bigint primary key,
  first_name text not null default 'Без имени',
  last_name text,
  username text,
  week_start date not null,
  created_at timestamptz not null default now(),
  request_date date,
  time_from time,
  time_to time,
  location_mode text not null default 'any' check (location_mode in ('any', 'include', 'exclude')),
  locations text[] not null default '{}'
);

alter table public.telegram_need_shifts
  add column if not exists request_date date,
  add column if not exists time_from time,
  add column if not exists time_to time,
  add column if not exists location_mode text not null default 'any',
  add column if not exists locations text[] not null default '{}';

create index if not exists telegram_need_shifts_week_created_idx
  on public.telegram_need_shifts (week_start, created_at);

alter table public.telegram_need_shifts enable row level security;

-- Multiple preferred dates and the whole-week option.
alter table public.telegram_need_shifts
  add column if not exists request_dates date[] not null default '{}',
  add column if not exists whole_week boolean not null default false;

-- Preserve existing single-date requests when upgrading.
update public.telegram_need_shifts
set request_dates = array[request_date]
where request_date is not null and coalesce(cardinality(request_dates), 0) = 0;
