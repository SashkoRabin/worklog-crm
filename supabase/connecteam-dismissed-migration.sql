-- Run after connecteam-migration.sql when upgrading an existing WorkLog project.
create table if not exists public.connecteam_dismissed_shifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, external_id)
);

alter table public.connecteam_dismissed_shifts enable row level security;
drop policy if exists "Own dismissed Connecteam shifts" on public.connecteam_dismissed_shifts;
create policy "Own dismissed Connecteam shifts" on public.connecteam_dismissed_shifts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
