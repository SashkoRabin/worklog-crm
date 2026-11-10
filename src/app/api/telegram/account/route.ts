import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/telegram-server";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("telegram_accounts")
      .select("language,reminders_enabled,reminder_minutes,timezone,linked_at")
      .eq("linked_user_id", user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: Boolean(data), account: data ? {
      language: data.language, remindersEnabled: data.reminders_enabled,
      reminderMinutes: data.reminder_minutes, timezone: data.timezone, linkedAt: data.linked_at,
    } : null });
  } catch (error) {
    console.error("Telegram settings GET failed", error);
    return NextResponse.json({ error: "Unable to load Telegram settings." }, { status: 500 });
  }
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "TELEGRAM_BOT_USERNAME is not configured." }, { status: 503 });
  try {
    const token = randomBytes(32).toString("base64url");
    const db = createAdminClient();
    const { error } = await db.from("telegram_link_tokens").insert({
      user_id: user.id, token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ url: `https://t.me/${username}?start=link_${token}`, expiresInSeconds: 900 });
  } catch (error) {
    console.error("Telegram link creation failed", error);
    return NextResponse.json({ error: "Unable to create Telegram connection link." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { remindersEnabled?: unknown; reminderMinutes?: unknown };
  const patch: Record<string, boolean | number> = {};
  if (typeof body.remindersEnabled === "boolean") patch.reminders_enabled = body.remindersEnabled;
  if (body.reminderMinutes !== undefined) {
    const minutes = Number(body.reminderMinutes);
    if (![30, 60, 120].includes(minutes)) return NextResponse.json({ error: "Reminder time must be 30, 60 or 120 minutes." }, { status: 400 });
    patch.reminder_minutes = minutes;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No valid settings supplied." }, { status: 400 });
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("telegram_accounts").update(patch)
      .eq("linked_user_id", user.id).select("reminders_enabled,reminder_minutes").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Telegram is not connected." }, { status: 409 });
    return NextResponse.json({ remindersEnabled: data.reminders_enabled, reminderMinutes: data.reminder_minutes });
  } catch (error) {
    console.error("Telegram settings PATCH failed", error);
    return NextResponse.json({ error: "Unable to update Telegram settings." }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = createAdminClient();
    const { error } = await db.from("telegram_accounts")
      .update({ linked_user_id: null, linked_at: null, reminders_enabled: false })
      .eq("linked_user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("Telegram disconnect failed", error);
    return NextResponse.json({ error: "Unable to disconnect Telegram." }, { status: 500 });
  }
}
