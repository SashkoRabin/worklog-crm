import { createAdminClient, telegramApi } from "@/lib/telegram-server";
import { datePartsInZone, escapeHtml } from "../utils";

type StaffShift = {
  connecteam_shift_id: string;
  start_epoch: number;
  end_epoch: number;
  user_ids: string[];
};
type StaffUser = {
  connecteam_user_id: string;
  first_name: string;
  last_name: string;
  is_archived: boolean;
};

export async function showStaffLeaderboard(chatId: number, messageId?: number) {
  const timezone = "Europe/Prague";
  const now = new Date();
  const today = datePartsInZone(now, timezone);
  const todayString = `${today.year}-${today.month}-${today.day}`;
  const monthStart = `${today.year}-${today.month}-01`;
  const db = createAdminClient();

  const [{ data: shifts, error: shiftsError }, { data: users, error: usersError }] = await Promise.all([
    db.from("connecteam_staff_shifts")
      .select("connecteam_shift_id,start_epoch,end_epoch,user_ids")
      .gte("work_date", monthStart).lte("work_date", todayString),
    db.from("connecteam_staff_users")
      .select("connecteam_user_id,first_name,last_name,is_archived")
      .eq("is_archived", false),
  ]);
  if (shiftsError) throw shiftsError;
  if (usersError) throw usersError;

  const names = new Map<string, string>();
  for (const user of (users || []) as StaffUser[]) {
    const name = `${user.first_name} ${user.last_name}`.trim();
    if (name) names.set(String(user.connecteam_user_id), name);
  }

  const totals = new Map<string, number>();
  const seenAssignments = new Set<string>();
  for (const shift of (shifts || []) as StaffShift[]) {
    const start = Number(shift.start_epoch);
    const end = Number(shift.end_epoch);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const durationHours = (end - start) / 3600;
    for (const rawId of shift.user_ids || []) {
      const userId = String(rawId);
      const assignmentKey = `${shift.connecteam_shift_id}:${userId}`;
      if (seenAssignments.has(assignmentKey) || !names.has(userId)) continue;
      seenAssignments.add(assignmentKey);
      totals.set(userId, (totals.get(userId) || 0) + durationHours);
    }
  }

  const ranking = [...totals.entries()]
    .map(([id, hours]) => ({ name: names.get(id)!, hours }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "ru"))
    .slice(0, 10);

  const period = `1–${Number(today.day)} ${new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: timezone }).format(now)}`;
  const number = (value: number) => value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const lines = [
    "🏆 <b>Топ-10 сотрудников по часам</b>",
    `📅 Период: ${period}`,
    "<i>Учитывается полная продолжительность каждой смены: от начала до конца.</i>",
    "",
  ];
  if (!ranking.length) {
    lines.push("За этот период пока нет смен с назначенными сотрудниками.");
  } else {
    ranking.forEach((item, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] || `${index + 1}.`;
      lines.push(`${medal} <b>${escapeHtml(item.name)}</b> · <b>${number(item.hours)} ч</b>`);
    });
    lines.push("", `👥 В рейтинге: ${ranking.length}`);
  }

  const payload = {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⬅️ Сотрудники", callback_data: "staff:home" }]] },
  };
  if (messageId) {
    try {
      await telegramApi("editMessageText", { ...payload, message_id: messageId });
      return;
    } catch (error) {
      console.warn("Could not edit staff leaderboard message, sending replacement", error);
    }
  }
  await telegramApi("sendMessage", payload);
}
