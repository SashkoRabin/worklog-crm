# Worklog CRM

Календарь смен, дохода и аналитики для работы в магазинах. Построен на Next.js, TypeScript и Supabase.

## Запуск

1. Скопируйте `.env.example` в `.env.local` и укажите URL и anon key проекта Supabase.
2. В Supabase откройте SQL Editor и выполните [`supabase/schema.sql`](./supabase/schema.sql).
3. В Authentication → Providers включите Email. В URL Configuration добавьте адрес Vercel-приложения.
4. Для личной синхронизации Connecteam добавьте серверную переменную `CONNECTEAM_ENCRYPTION_KEY` (случайные 32 байта в base64). В существующем проекте выполните [`supabase/connecteam-migration.sql`](./supabase/connecteam-migration.sql), а для скрытия удалённых смен Connecteam — [`supabase/connecteam-dismissed-migration.sql`](./supabase/connecteam-dismissed-migration.sql). Для ускорения уже созданной базы примените [`supabase/performance-migration.sql`](./supabase/performance-migration.sql), а для объединения старых смен Karlak с Karlák — [`supabase/store-name-normalization-migration.sql`](./supabase/store-name-normalization-migration.sql). Чтобы включить имя пользователя, примените [`supabase/profile-name-migration.sql`](./supabase/profile-name-migration.sql). Никогда не добавляйте это значение в переменные с префиксом `NEXT_PUBLIC_`.
5. Запустите `npm install`, затем `npm run dev`.

Без переменных окружения интерфейс открывается в режиме предпросмотра, но вход и сохранение в базу выключены.

## Деплой

На Vercel импортируйте репозиторий и добавьте `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` и `CONNECTEAM_ENCRYPTION_KEY` в Environment Variables.

## Telegram Assistant

Для Telegram onboarding и напоминаний добавьте в Vercel Environment Variables:

- `TELEGRAM_BOT_TOKEN` — токен от BotFather.
- `TELEGRAM_BOT_USERNAME` — username бота без символа @.
- `TELEGRAM_WEBHOOK_SECRET` — случайный секрет webhook.
- `SUPABASE_SERVICE_ROLE_KEY` — service role key Supabase (только серверная переменная).
- `CRON_SECRET` — случайный секрет для защищённого cron endpoint.
- `NEXT_PUBLIC_APP_URL` — публичный HTTPS URL WorkLog.

Примените `supabase/telegram-migration.sql` в Supabase SQL Editor. После деплоя зарегистрируйте webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://worklog-crm.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

В BotFather настройте домен Mini App для `worklog-crm.vercel.app`. Пользователь запускает бота командой `/start`, выбирает язык (English / Русский / Čeština), получает ссылку на сайт и интерактивное руководство. В разделе Telegram на сайте пользователь создаёт одноразовую ссылку привязки аккаунта. После привязки напоминания включены по умолчанию.

Для отправки напоминаний используется Supabase Cron, а не Vercel Cron: так минутное расписание работает независимо от тарифа Vercel. Включите расширения `pg_cron`, `pg_net` и `vault` в Supabase (если `vault` ещё не включён), добавьте `CRON_SECRET` в Vercel и выполните `supabase/telegram-cron.sql` в SQL Editor, заменив placeholder на тот же секрет. URL и секрет сохраняются в Supabase Vault. Cron вызывает `/api/telegram/reminders` каждую минуту с заголовком `Authorization: Bearer <CRON_SECRET>`. См. [Supabase Cron](https://supabase.com/docs/guides/cron) и [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net). Напоминание рассчитывается по локальному часовому поясу Telegram-профиля (по умолчанию `Europe/Prague`) и времени в названии смены формата `10:00–18:00`. Настройка по умолчанию — за 120 минут. Поддерживаются также 60 и 30 минут.

Не публикуйте `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` и webhook secret в клиентском коде или переменных с префиксом `NEXT_PUBLIC_`.

## Connecteam

В WorkLog откройте «Настройки → Connecteam», вставьте личную Calendar Sync link из Connecteam и нажмите «Подключить и синхронизировать». WorkLog получает только плановые смены с сегодняшнего дня до конца текущего месяца. Они не участвуют в суммах часов и дохода — их заменяют вручную введённые фактические часы. Ссылка календаря зашифрована перед сохранением в Supabase и читается только серверным маршрутом.
