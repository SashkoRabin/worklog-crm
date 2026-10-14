import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
  };
};

function secretsMatch(received: string | null, expected: string) {
  if (!received) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Telegram ${method} request failed.`);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Telegram webhook is not configured." }, { status: 503 });
  }
  if (!secretsMatch(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text?.startsWith("/start")) return NextResponse.json({ ok: true });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured." }, { status: 503 });

  try {
    await telegramApi("sendMessage", {
      chat_id: message.chat.id,
      text: "Открой WorkLog, чтобы посмотреть календарь, добавить смену или синхронизировать Connecteam.",
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть WorkLog", web_app: { url: appUrl } }]],
      },
    });
  } catch (error) {
    console.error("Telegram /start reply failed", error);
    return NextResponse.json({ error: "Unable to reply to Telegram." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
