create table if not exists public.telegram_need_shifts (
  telegram_user_id bigint primary key,
  first_name text not null default 'Без имени',
  last_name text,
  username text,
  week_start date not null,
  created_at timestamptz not null default now()
);

create index if not exists telegram_need_shifts_week_created_idx
  on public.telegram_need_shifts (week_start, created_at);

alter table public.telegram_need_shifts enable row level security;
