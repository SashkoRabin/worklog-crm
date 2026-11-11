import { createAdminClient, telegramApi } from "@/lib/telegram-server";

import { addDays, escapeHtml, formatDate } from "../utils";

const STAFF_LOCATIONS = ["Karlovy Lázně", "Revoluční", "Národní", "Opletalova", "Kaprova", "Karlák", "Karlova", "Karlín"];
type StaffShift = { work_date: string; location: string; start_time: string; end_time: string; user_ids: string[] };
function staffToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function staffNav(index?: number, backTo: "loc" | "dates" = "loc") {
  return [{ text: "⬅️ Назад", callback_data: backTo === "loc" ? "staff:back:loc" : `staff:back:dates:${index}` }, { text: "🏠 В меню", callback_data: "staff:menu" }];
}
async function renderStaff(chat: number, messageId: number | undefined, text: string, keyboard: { text: string; callback_data: string }[][]) {
  const payload = { chat_id: chat, text, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } };
  if (messageId) {
    try {
      await telegramApi("editMessageText", { ...payload, message_id: messageId });
      return;
    } catch (error) {
      console.warn("Could not edit staff flow message, sending replacement", error);
    }
  }
  await telegramApi("sendMessage", payload);
}
export async function showStaffLocations(chat: number, messageId?: number) {
  const rows: { text: string; callback_data: string }[][] = [];
  STAFF_LOCATIONS.forEach((name, i) => { const row = Math.floor(i / 2); rows[row] ||= []; rows[row].push({ text: name, callback_data: `staff:loc:${i}` }); });
  await renderStaff(chat, messageId, "👥 <b>Сотрудники</b>\n\n📍 Выбери локацию, чтобы посмотреть расписание команды.", [...rows, [{ text: "🏠 В меню", callback_data: "staff:menu" }]]);
}
export async function showStaffDates(chat: number, index: number, messageId?: number) {
  const location = STAFF_LOCATIONS[index]; if (!location) return;
  await renderStaff(chat, messageId, `📍 <b>${escapeHtml(location)}</b>\n\nНа какую дату показать смены?`, [
    [{ text: "Вчера", callback_data: `staff:date:${index}:y` }, { text: "Сегодня", callback_data: `staff:date:${index}:t` }, { text: "Завтра", callback_data: `staff:date:${index}:n` }],
    staffNav(index, "loc"),
  ]);
}
export async function showStaffForDate(chat: number, index: number, mode: string, messageId?: number) {
  const location = STAFF_LOCATIONS[index]; if (!location) return;
  const today = staffToday(), date = mode === "y" ? addDays(today, -1) : mode === "n" ? addDays(today, 1) : today;
  const db = createAdminClient();
  const { data, error } = await db.from("connecteam_staff_shifts")
    .select("work_date,location,start_time,end_time,user_ids")
    .eq("work_date", date)
    .order("start_time", { ascending: true });
  if (error) throw error;
  const normalizeLocation = (value: string) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
  const targetLocation = normalizeLocation(location);
  const allDateShifts = (data || []) as StaffShift[];
  const shifts = allDateShifts.filter(shift => {
    const actual = normalizeLocation(shift.location || "");
    return actual === targetLocation || actual.startsWith(targetLocation + " ") || actual.includes(" " + targetLocation + " ") || actual.endsWith(" " + targetLocation);
  });
  const ids = [...new Set(shifts.flatMap(shift => (shift.user_ids || []).map(String)))];
  const { data: users, error: usersError } = await db.from("connecteam_staff_users").select("connecteam_user_id,first_name,last_name").in("connecteam_user_id", ids.length ? ids : ["__none__"]);
  if (usersError) throw usersError;
  const names = new Map((users || []).map(user => [String(user.connecteam_user_id), `${user.first_name} ${user.last_name}`.trim()]));
  const lines = [`📍 <b>${escapeHtml(location)}</b>`, `📅 ${formatDate(date, "ru")}`, ""];
  const seen = new Set<string>();
  for (const shift of shifts) for (const id of shift.user_ids || []) {
    const key = `${id}:${shift.start_time}:${shift.end_time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = names.get(String(id));
    if (name) lines.push(`👤 <b>${escapeHtml(name)}</b>\n🕒 ${escapeHtml(shift.start_time)} – ${escapeHtml(shift.end_time)}`, "");
  }
  if (!shifts.length) {
    const availableLocations = [...new Set(allDateShifts.map(shift => shift.location).filter(Boolean))];
    lines.push("На эту дату смен не найдено.");
    if (availableLocations.length) lines.push("", "<i>Локации в синхронизации:</i>", ...availableLocations.slice(0, 8).map(value => "• " + escapeHtml(value)));
    else lines.push("", "<i>В базе нет смен за эту дату. Проверь синхронизацию Connecteam.</i>");
  } else {
    lines.push(`👥 Всего сотрудников: <b>${ids.length}</b>`);
  }
  const keyboard = [[{ text: "🔄 Другая дата", callback_data: `staff:back:dates:${index}` }], staffNav(index, "loc")];
  await renderStaff(chat, messageId, lines.join("\n"), keyboard);
}