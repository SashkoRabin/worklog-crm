import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser, telegramApi } from "@/lib/telegram-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { shiftId?: unknown };
  if (typeof body.shiftId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.shiftId)) {
    return NextResponse.json({ error: "Invalid shift ID." }, { status: 400 });
  }

  const db = createAdminClient();
  try {
    const { data: shift, error: shiftError } = await db.from("shifts")
      .select("id,user_id,work_date,store,shift_name,shift_type,source")
      .eq("id", body.shiftId).eq("user_id", user.id).maybeSingle();
    if (shiftError) throw shiftError;
    if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
    if (shift.shift_type !== "replacement" || shift.source !== "manual") {
      return NextResponse.json({ notified: false, reason: "not_a_new_manual_replacement" });
    }

    const { data: account, error: accountError } = await db.from("telegram_accounts")
      .select("chat_id").eq("linked_user_id", user.id).maybeSingle();
    if (accountError) throw accountError;
    if (!account) return NextResponse.json({ notified: false, reason: "telegram_not_connected" });

    const { data: claim, error: claimError } = await db.from("telegram_shift_notifications")
      .insert({ shift_id: shift.id, user_id: user.id, status: "processing" })
      .select("id").maybeSingle();
    if (claimError?.code === "23505") return NextResponse.json({ notified: false, duplicate: true });
    if (claimError) throw claimError;
    if (!claim) return NextResponse.json({ notified: false }, { status: 500 });

    try {
      await telegramApi("sendMessage", {
        chat_id: account.chat_id,
        text: [
          "🎉 Вы взяли смену!",
          "",
          `📅 Дата: ${shift.work_date}`,
          `🏪 Место: ${shift.store}`,
          `🕒 Время: ${shift.shift_name}`,
        ].join("\n"),
      });
      await db.from("telegram_shift_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", claim.id);
      return NextResponse.json({ notified: true });
    } catch (sendError) {
      await db.from("telegram_shift_notifications")
        .update({ status: "failed", last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "Delivery failed" })
        .eq("id", claim.id);
      throw sendError;
    }
  } catch (error) {
    console.error("Shift-taken Telegram notification failed", error);
    return NextResponse.json({ error: "Unable to send shift notification." }, { status: 500 });
  }
}
