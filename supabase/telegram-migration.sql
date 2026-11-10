-- Telegram onboarding, account linking and reminders.
-- Apply in Supabase SQL Editor before enabling the Telegram integration.

create table if not exists public.telegram_accounts (
  telegram_user_id bigint primary key,
  chat_id bigint not null,
  linked_user_id uuid unique references auth.users(id) on delete set null,
  language text not null default 'en' check (language in ('en','ru','cs')),
  reminders_enabled boolean not null default true,
  reminder_minutes integer not null default 120 check (reminder_minutes in (30,60,120)),
  timezone text not null default 'Europe/Prague',
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists telegram_accounts_linked_user_idx
  on public.telegram_accounts(linked_user_id) where linked_user_id is not null;

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists telegram_link_tokens_expiry_idx
  on public.telegram_link_tokens(expires_at) where used_at is null;

create table if not exists public.telegram_reminders (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (shift_id, scheduled_for)
);
create index if not exists telegram_reminders_user_idx on public.telegram_reminders(user_id,created_at desc);

alter table public.telegram_accounts enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.telegram_reminders enable row level security;
-- No client policies: all access goes through trusted server routes using service role.
