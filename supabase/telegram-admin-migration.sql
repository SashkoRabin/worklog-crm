-- Telegram administrator broadcasts.
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

alter table public.telegram_broadcasts enable row level security;
-- No client policies: these tables are accessed only by trusted server routes.
