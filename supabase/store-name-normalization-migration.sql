-- Run once in Supabase SQL Editor for existing worklog data.
-- This joins manual "Karlak" shifts with Connecteam's canonical "Karlák" store.
update public.shifts
set store = 'Karlák'
where store = 'Karlak';
