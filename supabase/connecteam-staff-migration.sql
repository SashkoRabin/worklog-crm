create table if not exists public.connecteam_staff_users (
  connecteam_user_id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  is_archived boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists public.connecteam_staff_shifts (
  connecteam_shift_id text primary key,
  work_date date not null,
  location text not null,
  start_time text not null,
  end_time text not null,
  start_epoch bigint not null,
  end_epoch bigint not null,
  user_ids text[] not null default '{}',
  synced_at timestamptz not null default now()
);

create index if not exists connecteam_staff_shifts_date_location_idx
  on public.connecteam_staff_shifts (work_date, location);
create index if not exists connecteam_staff_shifts_start_epoch_idx
  on public.connecteam_staff_shifts (start_epoch);

alter table public.connecteam_staff_users enable row level security;
alter table public.connecteam_staff_shifts enable row level security;
