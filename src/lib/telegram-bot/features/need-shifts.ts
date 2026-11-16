import { createAdminClient, telegramApi } from "@/lib/telegram-server";
import { escapeHtml, addDays } from "../utils";
import type { TelegramUser, Lang } from "../config";
import { menuKeyboard } from "../menu";

const TIME_ZONE = "Europe/Prague";
const LOCATIONS = ["Karlovy Lázně", "Revoluční", "Národní", "Opletalova", "Kaprova", "Karlák", "Karlova", "Karlín"];
const TIMES = [
  { id: "any", label: "Без ограничений", from: null, to: null },
  { id: "morning", label: "Утро · 08:00–14:00", from: "08:00", to: "14:00" },
  { id: "day", label: "День · 12:00–18:00", from: "12:00", to: "18:00" },
  { id: "evening", label: "Вечер · 16:00–23:00", from: "16:00", to: "23:00" },
];

function todayInPrague() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function currentWeekStart() {
  const today = todayInPrague();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
}

type WaitingUser = {
  telegram_user_id: number; first_name: string; last_name: string | null; username: string | null;
  created_at: string; request_date?: string | null; request_dates?: string[] | null; whole_week?: boolean | null; time_from?: string | null; time_to?: string | null;
  location_mode?: "any" | "include" | "exclude" | null; locations?: string[] | null;
};
function profileLink(user: WaitingUser) {
  return user.username ? `https://t.me/${encodeURIComponent(user.username)}` : `tg://user?id=${user.telegram_user_id}`;
}
function formatUser(user: WaitingUser, index?: number) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Без имени";
  const label = index === undefined ? name : `${index + 1}. ${name}`;
  const username = user.username ? ` · @${escapeHtml(user.username)}` : "";
  const dates = user.whole_week ? "Вся неделя" : (user.request_dates?.length ? user.request_dates.map(dateLabel).join(", ") : user.request_date ? dateLabel(user.request_date) : "Любая дата");
  const time = user.time_from && user.time_to ? `${user.time_from}–${user.time_to}` : "Любое время";
  const locations = user.location_mode === "include"
    ? `Точки: ${(user.locations || []).map(escapeHtml).join(", ") || "не выбраны"}`
    : user.location_mode === "exclude"
      ? `Кроме точек: ${(user.locations || []).map(escapeHtml).join(", ") || "нет"}`
      : "Все точки";
  return `<a href="${profileLink(user)}">${escapeHtml(label)}</a>${username}\n   📅 ${escapeHtml(dates)} · 🕒 ${escapeHtml(time)}\n   📍 ${locations}`;
}
export async function hasNeedShifts(userId: number): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.from("telegram_need_shifts").select("telegram_user_id").eq("telegram_user_id", userId).eq("week_start", currentWeekStart()).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function getWaitingUsers(): Promise<WaitingUser[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("telegram_need_shifts")
    .select("telegram_user_id,first_name,last_name,username,created_at,request_date,request_dates,whole_week,time_from,time_to,location_mode,locations")
    .eq("week_start", currentWeekStart()).order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as WaitingUser[];
}
async function getRequest(userId: number) {
  const db = createAdminClient();
  const { data, error } = await db.from("telegram_need_shifts").select("*")
    .eq("telegram_user_id", userId).eq("week_start", currentWeekStart()).maybeSingle();
  if (error) throw error;
  return data;
}
async function renderWizard(chatId: number, messageId: number | undefined, userId: number, step: string) {
  const request = await getRequest(userId);
  if (!request) return;
  const date = request.request_date as string | null;
  const dates = (request.request_dates || (date ? [date] : [])) as string[];
  const wholeWeek = Boolean(request.whole_week);
  const timeFrom = request.time_from as string | null, timeTo = request.time_to as string | null;
  const mode = (request.location_mode || "any") as "any" | "include" | "exclude";
  const selected = (request.locations || []) as string[];
  let title = "🛠 <b>ПОЖЕЛАНИЯ ПО СМЕНАМ</b>\n\n";
  let rows: { text: string; callback_data: string }[][] = [];
  if (step === "date") {
    title += "Выбери одну или несколько дат. Повторное нажатие снимает выбор:";
    const today = todayInPrague();
    for (let i = 0; i < 14; i += 2) {
      rows.push([0, 1].map(offset => {
        const d = addDays(today, i + offset);
        return { text: `${dates.includes(d) && !wholeWeek ? "✅ " : ""}${dateLabel(d)}`, callback_data: `needshifts:date:${d}` };
      }));
    }
    rows.push([{ text: wholeWeek ? "✅ Вся неделя" : "📅 Вся неделя", callback_data: "needshifts:week" }]);
    rows.push([{ text: "Любая дата", callback_data: "needshifts:date:any" }]);
    rows.push([{ text: "Готово", callback_data: "needshifts:dates:done" }]);
  } else if (step === "time") {
    title += "В какое время удобно?";
    rows = TIMES.map(t => [{ text: (timeFrom === t.from && timeTo === t.to) ? `✓ ${t.label}` : t.label, callback_data: `needshifts:time:${t.id}` }]);
  } else if (step === "mode") {
    title += "Как выбрать точки?";
    rows = [
      [{ text: mode === "any" ? "✓ Все точки" : "Все точки", callback_data: "needshifts:mode:any" }],
      [{ text: mode === "include" ? "✓ Только выбранные точки" : "Только выбранные точки", callback_data: "needshifts:mode:include" }],
      [{ text: mode === "exclude" ? "✓ Все, кроме выбранных" : "Все, кроме выбранных", callback_data: "needshifts:mode:exclude" }],
    ];
  } else if (step === "locations") {
    title += mode === "include" ? "Выбери точки, где хочешь взять смену:" : "Выбери точки, которые нужно исключить:";
    for (let i = 0; i < LOCATIONS.length; i += 2) {
      rows.push(LOCATIONS.slice(i, i + 2).map((name, j) => {
        const selectedNow = selected.includes(name);
        return { text: `${selectedNow ? "✅" : "▫️"} ${name}`, callback_data: `needshifts:loc:${i + j}` };
      }));
    }
    rows.push([{ text: "Готово", callback_data: "needshifts:step:summary" }]);
  } else {
    const dateText = wholeWeek ? "Вся неделя" : dates.length ? dates.map(dateLabel).join(", ") : "Любая дата";
    const timeText = timeFrom && timeTo ? `${timeFrom}–${timeTo}` : "Любое время";
    const locationText = mode === "any" ? "Все точки" : `${mode === "include" ? "Только" : "Кроме"}: ${selected.join(", ") || "не выбраны"}`;
    title += `Проверь пожелания:\n📅 ${escapeHtml(dateText)}\n🕒 ${escapeHtml(timeText)}\n📍 ${escapeHtml(locationText)}`;
    rows = [
      [{ text: "📅 Изменить дату", callback_data: "needshifts:step:date" }],
      [{ text: "🕒 Изменить время", callback_data: "needshifts:step:time" }],
      [{ text: "📍 Изменить точки", callback_data: "needshifts:step:mode" }],
      [{ text: "✅ Сохранить пожелания", callback_data: "needshifts:save" }],
    ];
  }
  rows.push([{ text: "Отмена", callback_data: "needshifts:step:summary" }]);
  const payload = { chat_id: chatId, text: title, parse_mode: "HTML", reply_markup: { inline_keyboard: rows } };
  if (messageId) {
    try { await telegramApi("editMessageText", { ...payload, message_id: messageId }); return; }
    catch (error) { console.warn("Could not edit Need shifts preferences", error); }
  }
  await telegramApi("sendMessage", payload);
}
export async function toggleNeedShifts(chatId: number, from: TelegramUser | undefined, lang: Lang, remindersEnabled: boolean) {
  if (!from) return;
  const db = createAdminClient(), weekStart = currentWeekStart();
  const { data: existing, error: lookupError } = await db.from("telegram_need_shifts").select("telegram_user_id")
    .eq("telegram_user_id", from.id).eq("week_start", weekStart).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const { error } = await db.from("telegram_need_shifts").delete().eq("telegram_user_id", from.id).eq("week_start", weekStart);
    if (error) throw error;
    await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Заявка отменена. Ты удалён из списка ожидающих смену.", reply_markup: menuKeyboard(lang, remindersEnabled, false) });
    return;
  }
  const { error } = await db.from("telegram_need_shifts").upsert({
    telegram_user_id: from.id, first_name: from.first_name || "Без имени", last_name: from.last_name || null,
    username: from.username || null, week_start: weekStart, created_at: new Date().toISOString(),
    request_date: null, request_dates: [], whole_week: false, time_from: null, time_to: null, location_mode: "any", locations: [],
  }, { onConflict: "telegram_user_id" });
  if (error) throw error;
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "🆘 <b>Ты добавлен в список ожидающих смену!</b>\n\nПо умолчанию подходят любые дата, время и точка. Можешь указать пожелания:",
    parse_mode: "HTML", reply_markup: menuKeyboard(lang, remindersEnabled, true),
  });
  await telegramApi("sendMessage", { chat_id: chatId, text: "Укажи предпочтения по дополнительным сменам:", reply_markup: { inline_keyboard: [[{ text: "⚙️ Указать пожелания", callback_data: "needshifts:step:date" }]] } });
}
function buildWaitingMessage(users: WaitingUser[]) {
  const lines = ["🆘 <b>СОТРУДНИКИ, КОТОРЫМ НУЖНЫ СМЕНЫ</b>", `📅 Неделя с ${currentWeekStart()}`, ""];
  if (!users.length) lines.push("Пока никто не ожидает дополнительные смены.");
  else { users.forEach((user, index) => lines.push(formatUser(user, index), "")); lines.push(`👥 Всего сотрудников: <b>${users.length}</b>`); }
  return lines.join("\n").slice(0, 3900);
}
export async function showWaitingShifts(chatId: number, messageId?: number) {
  const text = buildWaitingMessage(await getWaitingUsers());
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Сотрудники", callback_data: "staff:home" }]] } };
  if (messageId) { try { await telegramApi("editMessageText", { ...payload, message_id: messageId }); return; } catch (error) { console.warn("Could not edit waiting shifts list", error); } }
  await telegramApi("sendMessage", payload);
}
export async function answerNeedShiftsInlineQuery(query: { id: string; from: TelegramUser; query: string }) {
  const normalized = query.query.trim().toLocaleLowerCase();
  const supported = ["смены", "смен", "shifts", "shift", "замены", "замена"];
  if (normalized && !supported.some(term => term.includes(normalized) || normalized.includes(term))) {
    await telegramApi("answerInlineQuery", { inline_query_id: query.id, results: [], cache_time: 0, is_personal: true });
    return;
  }
  try {
    const users = await getWaitingUsers(), message = buildWaitingMessage(users);
    await telegramApi("answerInlineQuery", {
      inline_query_id: query.id, cache_time: 0, is_personal: true,
      results: [{ type: "article", id: `need-shifts-${currentWeekStart()}`,
        title: users.length ? `🆘 Ждут смену: ${users.length}` : "🆘 Пока никто не ждёт смену",
        description: "Актуальный список сотрудников с пожеланиями по сменам",
        input_message_content: { message_text: message, parse_mode: "HTML" } }],
    });
  } catch (error) {
    console.error("Need shifts inline query failed", error);
    await telegramApi("answerInlineQuery", {
      inline_query_id: query.id, cache_time: 0, is_personal: true,
      results: [{ type: "article", id: "need-shifts-setup-error",
        title: "⚠️ Список смен временно недоступен",
        description: "Проверь миграцию telegram_need_shifts в Supabase",
        input_message_content: { message_text: "⚠️ Список ожидающих смену временно недоступен. Проверь, что миграция supabase/telegram-need-shifts-migration.sql выполнена в Supabase." } }],
    });
  }
}
export async function handleNeedShiftsCallback(chatId: number, messageId: number | undefined, userId: number, data: string) {
  const db = createAdminClient(), request = await getRequest(userId);
  if (!request) return;
  const [, action, value] = data.split(":");
  if (action === "step") {
    await renderWizard(chatId, messageId, userId, value || "summary");
    return;
  }
  if (action === "date") {
    const date = value === "any" ? null : value;
    const { error } = await db.from("telegram_need_shifts").update({ request_date: date }).eq("telegram_user_id", userId).eq("week_start", currentWeekStart());
    if (error) throw error;
    await renderWizard(chatId, messageId, userId, "time");
  } else if (action === "time") {
    const time = TIMES.find(item => item.id === value);
    if (!time) return;
    const { error } = await db.from("telegram_need_shifts").update({ time_from: time.from, time_to: time.to }).eq("telegram_user_id", userId).eq("week_start", currentWeekStart());
    if (error) throw error;
    await renderWizard(chatId, messageId, userId, "mode");
  } else if (action === "mode") {
    const mode = value as "any" | "include" | "exclude";
    if (!["any", "include", "exclude"].includes(mode)) return;
    const { error } = await db.from("telegram_need_shifts").update({ location_mode: mode, locations: [] }).eq("telegram_user_id", userId).eq("week_start", currentWeekStart());
    if (error) throw error;
    await renderWizard(chatId, messageId, userId, mode === "any" ? "summary" : "locations");
  } else if (action === "loc") {
    const location = LOCATIONS[Number(value)];
    if (!location) return;
    const selected = (request.locations || []) as string[];
    const locations = selected.includes(location) ? selected.filter(item => item !== location) : [...selected, location];
    const { error } = await db.from("telegram_need_shifts").update({ locations }).eq("telegram_user_id", userId).eq("week_start", currentWeekStart());
    if (error) throw error;
    await renderWizard(chatId, messageId, userId, "locations");
  } else if (action === "save") {
    await telegramApi("editMessageText", { chat_id: chatId, message_id: messageId, text: "✅ <b>Пожелания сохранены.</b> Менеджер увидит их в списке ожидающих смену.", parse_mode: "HTML" });
  }
}
