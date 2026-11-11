-- Telegram administrator broadcasts and shift-taken notifications.
-- Apply in Supabase SQL Editor before deploying the related application code.

create table if not exists public.telegram_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 4000),
  created_by bigint not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial', 'failed', 'cancelled')),
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists telegram_broadcasts_created_idx
  on public.telegram_broadcasts(created_at desc);

create table if not exists public.telegram_shift_notifications (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.telegram_broadcasts enable row level security;
alter table public.telegram_shift_notifications enable row level security;
-- No client policies: these tables are accessed only by trusted server routes.
