-- Run once in Supabase SQL Editor for existing WorkLog databases.
-- Makes the dashboard timeline query use an ordered per-user index.
create index if not exists shifts_user_work_date_desc
  on public.shifts (user_id, work_date desc);
