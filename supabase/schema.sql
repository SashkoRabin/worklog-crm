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
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
create policy "Own profile" on public.profiles for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Own shifts" on public.shifts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile();
