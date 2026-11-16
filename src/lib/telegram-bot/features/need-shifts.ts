import { createAdminClient, telegramApi } from "@/lib/telegram-server";
import { escapeHtml } from "../utils";
import type { TelegramUser } from "../config";

const TIME_ZONE = "Europe/Prague";

function currentWeekStart() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
}

type WaitingUser = {
  telegram_user_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  created_at: string;
};

function profileLink(user: WaitingUser) {
  return user.username
    ? `https://t.me/${encodeURIComponent(user.username)}`
    : `tg://user?id=${user.telegram_user_id}`;
}

function formatUser(user: WaitingUser, index?: number) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Без имени";
  const label = index === undefined ? name : `${index + 1}. ${name}`;
  const username = user.username ? ` · @${escapeHtml(user.username)}` : "";
  return `<a href="${profileLink(user)}">${escapeHtml(label)}</a>${username}`;
}

async function getWaitingUsers(): Promise<WaitingUser[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("telegram_need_shifts")
    .select("telegram_user_id,first_name,last_name,username,created_at")
    .eq("week_start", currentWeekStart())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as WaitingUser[];
}

export async function toggleNeedShifts(chatId: number, from?: TelegramUser, inline = false) {
  if (!from) return;
  const db = createAdminClient();
  const weekStart = currentWeekStart();
  const { data: existing, error: lookupError } = await db.from("telegram_need_shifts")
    .select("telegram_user_id")
    .eq("telegram_user_id", from.id)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await db.from("telegram_need_shifts")
      .delete().eq("telegram_user_id", from.id).eq("week_start", weekStart);
    if (error) throw error;
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "✅ Заявка отменена. Ты удалён из списка ожидающих смену.",
      reply_markup: inline ? undefined : undefined,
    });
    return;
  }

  const { error } = await db.from("telegram_need_shifts").upsert({
    telegram_user_id: from.id,
    first_name: from.first_name || "Без имени",
    last_name: from.last_name || null,
    username: from.username || null,
    week_start: weekStart,
    created_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
  if (error) throw error;

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "🆘 <b>Ты добавлен в список ожидающих смену!</b>\n\nКогда появятся дополнительные смены, менеджер сможет найти твой профиль прямо из списка.\n\nНажми кнопку «Нужны смены» ещё раз, чтобы отменить заявку.",
    parse_mode: "HTML",
  });
}

function buildWaitingMessage(users: WaitingUser[]) {
  const week = currentWeekStart();
  const lines = [
    "🆘 <b>СОТРУДНИКИ, КОТОРЫМ НУЖНЫ СМЕНЫ</b>",
    `📅 Неделя с ${week}`,
    "",
  ];
  if (!users.length) lines.push("Пока никто не ожидает дополнительные смены.");
  else {
    users.forEach((user, index) => lines.push(formatUser(user, index)));
    lines.push("", `👥 Всего сотрудников: <b>${users.length}</b>`);
  }
  return lines.join("\n");
}

export async function showWaitingShifts(chatId: number, messageId?: number) {
  const text = buildWaitingMessage(await getWaitingUsers());
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [
      [{ text: "🔄 Обновить", callback_data: "staff:waiting" }],
      [{ text: "⬅️ Сотрудники", callback_data: "staff:home" }],
    ] },
  };
  if (messageId) {
    try {
      await telegramApi("editMessageText", { ...payload, message_id: messageId });
      return;
    } catch (error) {
      console.warn("Could not edit waiting shifts list", error);
    }
  }
  await telegramApi("sendMessage", payload);
}

export async function answerNeedShiftsInlineQuery(query: { id: string; from: TelegramUser; query: string }) {
  const normalized = query.query.trim().toLocaleLowerCase();
  const supported = ["смены", "смен", "shifts", "shift", "замены", "замена", "cover", "replacement"];
  if (normalized && !supported.some(term => normalized.includes(term))) {
    await telegramApi("answerInlineQuery", { inline_query_id: query.id, results: [], cache_time: 0, is_personal: true });
    return;
  }
  const users = await getWaitingUsers();
  const text = buildWaitingMessage(users);
  await telegramApi("answerInlineQuery", {
    inline_query_id: query.id,
    results: [{
      type: "article",
      id: `waiting-${currentWeekStart()}`,
      title: users.length ? `🆘 Ждут смену: ${users.length}` : "🆘 Пока никто не ждёт смену",
      description: "Список сотрудников, которым нужны дополнительные смены",
      input_message_content: { message_text: text, parse_mode: "HTML" },
      reply_markup: { inline_keyboard: [[{ text: "🔄 Обновить список", callback_data: "needshifts:refresh" }]] },
    }],
    cache_time: 0,
    is_personal: true,
  });
}

export async function refreshNeedShiftsInline(inlineMessageId?: string, chatId?: number, messageId?: number) {
  const text = buildWaitingMessage(await getWaitingUsers());
  if (inlineMessageId) {
    await telegramApi("editMessageText", {
      inline_message_id: inlineMessageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔄 Обновить список", callback_data: "needshifts:refresh" }]] },
    });
    return;
  }
  if (chatId !== undefined && messageId !== undefined) {
    await telegramApi("editMessageText", {
      chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔄 Обновить список", callback_data: "needshifts:refresh" }]] },
    });
  }
}
