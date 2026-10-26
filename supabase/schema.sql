-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hourly_rate numeric not null default 150 check (hourly_rate >= 0),
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  store text not null,
  shift_name text not null,
  shift_type text not null check (shift_type in ('worked', 'replacement', 'assigned')),
  hours numeric not null check (hours >= 0),
  hourly_rate numeric not null check (hourly_rate >= 0),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'connecteam')),
  external_id text,
  created_at timestamptz not null default now()
);

create unique index shifts_connecteam_external_id
  on public.shifts (user_id, source, external_id)
  where external_id is not null;

-- Covers the dashboard's most frequent request: one user's timeline, newest
-- first. It also avoids a sort as the worklog grows.
create index shifts_user_work_date_desc
  on public.shifts (user_id, work_date desc);

-- The value is AES-GCM encrypted before insertion. RLS limits each encrypted
-- connection record to its owner; the cleartext link never reaches the browser.
create table public.connecteam_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_url_encrypted text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connecteam_dismissed_shifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, external_id)
);

alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.connecteam_connections enable row level security;
alter table public.connecteam_dismissed_shifts enable row level security;
create policy "Own encrypted Connecteam connection" on public.connecteam_connections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own dismissed Connecteam shifts" on public.connecteam_dismissed_shifts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own profile" on public.profiles for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Own shifts" on public.shifts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile();
