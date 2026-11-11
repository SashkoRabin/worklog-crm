import { handleTelegramWebhook } from "@/lib/telegram-bot/webhook-handler";

export const runtime = "nodejs";
export const POST = handleTelegramWebhook;
