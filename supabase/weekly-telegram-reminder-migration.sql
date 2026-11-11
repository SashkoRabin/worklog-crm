-- Weekly Friday Telegram reminder deduplication.
-- Apply in Supabase SQL Editor.

create table if not exists public.telegram_weekly_reminders (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.telegram_accounts(telegram_user_id) on delete cascade,
  local_week date not null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (telegram_user_id, local_week)
);

create index if not exists telegram_weekly_reminders_status_idx
  on public.telegram_weekly_reminders(status, updated_at);
