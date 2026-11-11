# Telegram bot architecture

The Telegram bot is an isolated application layer inside the Next.js repository. Its only HTTP entry point is `src/app/api/telegram/webhook/route.ts`.

## Boundaries

- `src/app/api/telegram/webhook/route.ts`: transport adapter only. It exposes the webhook route and delegates the update.
- `src/lib/telegram-bot/webhook-handler.ts`: validates Telegram's webhook secret and routes incoming updates.
- `src/lib/telegram-bot/config.ts`: bot copy, roles, Telegram update/account types and language resolution.
- `src/lib/telegram-bot/menu.ts`: reply keyboard and main-menu delivery.
- `src/lib/telegram-bot/utils.ts`: pure formatting/date/escaping helpers.
- `src/lib/telegram-bot/features/`: feature-specific bot workflows.
  - `staff.ts`: staff hub, location schedule, employee selector and weekly employee schedule.\n  - `staff-leaderboard.ts`: monthly employee hours leaderboard.
  - `dashboard.ts`: personal schedule, monthly shifts, earnings, guide and reminders.

## Rules for future changes

1. Put Telegram-specific behavior under `src/lib/telegram-bot`. Keep API route files thin.
2. Put each new bot capability in its own feature module. The webhook handler should only dispatch commands/callbacks, not contain database queries or message formatting for a feature.
3. Do not import Telegram modules into website pages or website components.
4. Share only neutral server infrastructure (for example `createAdminClient`) between the bot and the website. Do not put UI/business workflow in shared modules.
5. Keep bot database access inside its feature module. If a workflow becomes shared with the website, extract a neutral domain service into `src/lib/<domain>` and let both sides call it.
6. Keep Telegram callback payloads short and version them if a workflow needs persistent multi-step state.
7. When adding a feature, update this document and verify the webhook route, existing bot commands, and website build independently.

## Data ownership

The bot uses Supabase tables for Telegram accounts, links, broadcasts, shifts and the Connecteam staff snapshot. The website remains the owner of its own pages and client interactions. Shared database infrastructure does not make the bot UI part of the website.
