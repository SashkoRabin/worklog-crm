# Worklog CRM

Календарь смен, дохода и аналитики для работы в магазинах. Построен на Next.js, TypeScript и Supabase.

## Запуск

1. Скопируйте `.env.example` в `.env.local` и укажите URL и anon key проекта Supabase.
2. В Supabase откройте SQL Editor и выполните [`supabase/schema.sql`](./supabase/schema.sql).
3. В Authentication → Providers включите Email. В URL Configuration добавьте адрес Vercel-приложения.
4. Для личной синхронизации Connecteam добавьте серверную переменную `CONNECTEAM_ENCRYPTION_KEY` (случайные 32 байта в base64). В существующем проекте выполните [`supabase/connecteam-migration.sql`](./supabase/connecteam-migration.sql). Никогда не добавляйте это значение в переменные с префиксом `NEXT_PUBLIC_`.
5. Запустите `npm install`, затем `npm run dev`.

Без переменных окружения интерфейс открывается в режиме предпросмотра, но вход и сохранение в базу выключены.

## Деплой

На Vercel импортируйте репозиторий и добавьте `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` и `CONNECTEAM_ENCRYPTION_KEY` в Environment Variables.

## Connecteam

В WorkLog откройте «Настройки → Connecteam», вставьте личную Calendar Sync link из Connecteam и нажмите «Подключить и синхронизировать». WorkLog получает только плановые смены с сегодняшнего дня до конца текущего месяца. Они не участвуют в суммах часов и дохода — их заменяют вручную введённые фактические часы. Ссылка календаря зашифрована перед сохранением в Supabase и читается только серверным маршрутом.
