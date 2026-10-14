-- Run this after the original schema.sql when adding Connecteam calendar sync
-- to an existing WorkLog project.
alter table public.shifts
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'connecteam')),
  add column if not exists external_id text;

create unique index if not exists shifts_connecteam_external_id
  on public.shifts (user_id, source, external_id)
  where external_id is not null;

create table if not exists public.connecteam_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_url_encrypted text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connecteam_connections enable row level security;
drop policy if exists "Own encrypted Connecteam connection" on public.connecteam_connections;
create policy "Own encrypted Connecteam connection" on public.connecteam_connections
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- The value stored in this table is AES-GCM encrypted before insertion. The
-- browser never receives the cleartext calendar link.
