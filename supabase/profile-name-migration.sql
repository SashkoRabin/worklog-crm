-- Run once in Supabase SQL Editor for an existing WorkLog database.
alter table public.profiles
  add column if not exists display_name text check (char_length(display_name) <= 80);
