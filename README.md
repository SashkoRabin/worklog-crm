# Worklog CRM

Календарь смен, дохода и аналитики для работы в магазинах. Построен на Next.js, TypeScript и Supabase.

## Запуск

1. Скопируйте `.env.example` в `.env.local` и укажите URL и anon key проекта Supabase.
2. В Supabase откройте SQL Editor и выполните [`supabase/schema.sql`](./supabase/schema.sql).
3. В Authentication → Providers включите Email. В URL Configuration добавьте адрес Vercel-приложения.
4. Запустите `npm install`, затем `npm run dev`.

Без переменных окружения интерфейс открывается в режиме предпросмотра, но вход и сохранение в базу выключены.

## Деплой

На Vercel импортируйте репозиторий и добавьте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` в Environment Variables. Другие настройки не требуются.
