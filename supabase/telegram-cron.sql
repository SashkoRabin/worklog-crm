-- Schedule Telegram shift reminders with Supabase Cron.
-- Before running:
-- 1. Enable pg_cron and pg_net in Supabase Database -> Extensions.
-- 2. Add the same CRON_SECRET value to Vercel Environment Variables.
-- 3. Replace the two placeholder values below with your deployed endpoint and CRON_SECRET.
-- Store secrets in Supabase Vault; do not commit real secrets to Git.

select vault.create_secret(
  'https://worklog-crm.vercel.app/api/telegram/reminders',
  'worklog_telegram_reminder_url',
  'WorkLog Telegram reminder endpoint'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_CRON_SECRET_AS_VERCEL',
  'worklog_telegram_cron_secret',
  'Authorization secret for WorkLog Telegram reminder endpoint'
);

select cron.schedule(
  'worklog-telegram-shift-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'worklog_telegram_reminder_url'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worklog_telegram_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Inspect scheduled jobs:
-- select jobid, jobname, schedule, command from cron.job;
--
-- Unschedule when needed:
-- select cron.unschedule('worklog-telegram-shift-reminders');
