import { NextResponse } from "next/server";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";

export const runtime = "nodejs";

type Account = {
  telegram_user_id: number;
  chat_id: number;
  timezone: string;
};

function getLocalFridayKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (values.weekday !== "Fri" || values.hour !== "18") return null;
  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("telegram_accounts")
    .select("telegram_user_id,chat_id,timezone")
    .not("linked_user_id", "is", null);

  if (error) {
    console.error("Weekly Telegram reminder: failed to load accounts", error);
    return NextResponse.json({ error: "Unable to load Telegram accounts." }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date();

  for (const account of (data || []) as Account[]) {
    const timezone = account.timezone || "Europe/Prague";
    let localWeek: string | null;
    try {
      localWeek = getLocalFridayKey(now, timezone);
    } catch {
      skipped++;
      continue;
    }
    if (!localWeek) {
      skipped++;
      continue;
    }

    const { data: existing, error: lookupError } = await db
      .from("telegram_weekly_reminders")
      .select("id,status,attempts,updated_at")
      .eq("telegram_user_id", account.telegram_user_id)
      .eq("local_week", localWeek)
      .maybeSingle();

    if (lookupError) {
      failed++;
      console.error("Weekly Telegram reminder: claim lookup failed", lookupError);
      continue;
    }

    let reminderId: string | null = null;
    if (!existing) {
      const { data: created, error: createError } = await db
        .from("telegram_weekly_reminders")
        .insert({ telegram_user_id: account.telegram_user_id, local_week: localWeek, status: "processing", attempts: 1 })
        .select("id")
        .maybeSingle();

      if (createError?.code === "23505") {
        skipped++;
        continue;
      }
      if (createError || !created) {
        failed++;
        console.error("Weekly Telegram reminder: claim creation failed", createError);
        continue;
      }
      reminderId = created.id;
    } else {
      const staleProcessing = existing.status === "processing"
        && Date.now() - new Date(existing.updated_at).getTime() > 10 * 60_000;
      if (existing.status !== "failed" && !staleProcessing) {
        skipped++;
        continue;
      }

      let retry = db.from("telegram_weekly_reminders")
        .update({ status: "processing", attempts: Number(existing.attempts) + 1, last_error: null, updated_at: now.toISOString() })
        .eq("id", existing.id);

      retry = staleProcessing
        ? retry.eq("status", "processing").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString())
        : retry.eq("status", "failed");

      const { data: claimed, error: claimError } = await retry.select("id").maybeSingle();
      if (claimError) {
        failed++;
        console.error("Weekly Telegram reminder: retry claim failed", claimError);
        continue;
      }
      reminderId = claimed?.id || null;
      if (!reminderId) {
        skipped++;
        continue;
      }
    }

    try {
      await telegramApi("sendMessage", {
        chat_id: account.chat_id,
        text: "Не забудьте попросить смены на следующую неделю!",
      });
      await db.from("telegram_weekly_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", reminderId);
      sent++;
    } catch (sendError) {
      await db.from("telegram_weekly_reminders")
        .update({
          status: "failed",
          last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "Delivery failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminderId);
      failed++;
      console.error("Weekly Telegram reminder: delivery failed", sendError);
    }
  }

  return NextResponse.json({ checked: data?.length || 0, sent, skipped, failed });
}
