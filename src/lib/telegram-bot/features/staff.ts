import { createAdminClient, telegramApi } from "@/lib/telegram-server";

import { addDays, escapeHtml, formatDate } from "../utils";

const STAFF_LOCATIONS = ["Karlovy Lázně", "Revoluční", "Národní", "Opletalova", "Kaprova", "Karlák", "Karlova", "Karlín"];
const EMPLOYEES_PER_PAGE = 20;

type StaffShift = {
  connecteam_shift_id?: string;
  work_date: string;
  location: string;
  start_time: string;
  end_time: string;
  start_epoch?: number;
  end_epoch?: number;
  user_ids: string[];
};
type StaffUser = {
  connecteam_user_id: string;
  first_name: string;
  last_name: string;
};

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

export async function showStaffHome(chat: number, messageId?: number) {
  await renderStaff(chat, messageId, "👥 <b>Сотрудники</b>\n\nВыбери нужный раздел:", [
    [{ text: "📍 Расписание по точке", callback_data: "staff:locations" }],
    [{ text: "🏆 Топ сотрудников", callback_data: "staff:leaderboard" }],
    [{ text: "🗓 График сотрудника", callback_data: "staff:employees" }],
    [{ text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
}

export async function showStaffLocations(chat: number, messageId?: number) {
  const rows: { text: string; callback_data: string }[][] = [];
  STAFF_LOCATIONS.forEach((name, i) => { const row = Math.floor(i / 2); rows[row] ||= []; rows[row].push({ text: name, callback_data: `staff:loc:${i}` }); });
  await renderStaff(chat, messageId, "📍 <b>Расписание по точке</b>\n\nВыбери локацию, чтобы посмотреть расписание команды.", [...rows, [{ text: "⬅️ Сотрудники", callback_data: "staff:home" }]]);
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
  const normalizeTarget = normalizeLocation(location);
  const allDateShifts = (data || []) as StaffShift[];
  const shifts = allDateShifts.filter(shift => {
    const actual = normalizeLocation(shift.location || "");
    return actual === normalizeTarget || actual.startsWith(normalizeTarget + " ") || actual.includes(" " + normalizeTarget + " ") || actual.endsWith(" " + normalizeTarget);
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

export async function showStaffEmployees(chat: number, page = 0, messageId?: number) {
  const db = createAdminClient();
  const { data, error } = await db.from("connecteam_staff_users")
    .select("connecteam_user_id,first_name,last_name")
    .eq("is_archived", false)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });
  if (error) throw error;
  const employees = (data || []) as StaffUser[];
  const pageCount = Math.max(1, Math.ceil(employees.length / EMPLOYEES_PER_PAGE));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  const visible = employees.slice(currentPage * EMPLOYEES_PER_PAGE, (currentPage + 1) * EMPLOYEES_PER_PAGE);
  const keyboard: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    keyboard.push(visible.slice(i, i + 2).map(user => ({
      text: `${user.first_name} ${user.last_name}`.trim().slice(0, 60) || `ID ${user.connecteam_user_id}`,
      callback_data: `staff:person:${user.connecteam_user_id}:${currentPage}`,
    })));
  }
  const navigation: { text: string; callback_data: string }[] = [];
  if (currentPage > 0) navigation.push({ text: "⬅️", callback_data: `staff:employees:${currentPage - 1}` });
  navigation.push({ text: `${currentPage + 1}/${pageCount}`, callback_data: "staff:noop" });
  if (currentPage < pageCount - 1) navigation.push({ text: "➡️", callback_data: `staff:employees:${currentPage + 1}` });
  if (navigation.length) keyboard.push(navigation);
  keyboard.push([{ text: "⬅️ Сотрудники", callback_data: "staff:home" }]);
  const description = employees.length
    ? `Выбери сотрудника из списка.\n👥 Всего активных сотрудников: ${employees.length}`
    : "Активные сотрудники не найдены. Проверь синхронизацию Connecteam.";
  await renderStaff(chat, messageId, `🗓 <b>График сотрудника</b>\n\n${description}`, keyboard);
}

export async function showStaffEmployeeWeek(chat: number, userId: string, page = 0, messageId?: number) {
  const db = createAdminClient();
  const { data: user, error: userError } = await db.from("connecteam_staff_users")
    .select("connecteam_user_id,first_name,last_name")
    .eq("connecteam_user_id", userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) {
    await showStaffEmployees(chat, page, messageId);
    return;
  }

  const today = staffToday();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  const sunday = addDays(monday, 6);
  const { data, error } = await db.from("connecteam_staff_shifts")
    .select("connecteam_shift_id,work_date,location,start_time,end_time,start_epoch,end_epoch,user_ids")
    .gte("work_date", monday)
    .lte("work_date", sunday)
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;

  const shifts = ((data || []) as StaffShift[])
    .filter(shift => (shift.user_ids || []).map(String).includes(userId))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time));
  const seen = new Set<string>();
  const uniqueShifts = shifts.filter((shift, index) => {
    const key = shift.connecteam_shift_id || `${shift.work_date}:${shift.start_time}:${shift.end_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const totalHours = uniqueShifts.reduce((sum, shift) => {
    const start = Number(shift.start_epoch), end = Number(shift.end_epoch);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + (end - start) / 3600 : sum;
  }, 0);
  const number = (value: number) => value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fullName = `${user.first_name} ${user.last_name}`.trim() || `ID ${userId}`;
  const lines = [
    `🗓 <b>График сотрудника</b>`,
    `👤 <b>${escapeHtml(fullName)}</b>`,
    `📅 ${formatDate(monday, "ru")} – ${formatDate(sunday, "ru")}`,
    "",
  ];
  if (!uniqueShifts.length) {
    lines.push("На этой неделе смен не запланировано.");
  } else {
    let currentDate = "";
    for (const shift of uniqueShifts) {
      if (shift.work_date !== currentDate) {
        currentDate = shift.work_date;
        lines.push(`\n<b>${escapeHtml(formatDate(currentDate, "ru"))}</b>`);
      }
      lines.push(`• ${escapeHtml(shift.start_time)}–${escapeHtml(shift.end_time)} · ${escapeHtml(shift.location)}`);
    }
  }
  lines.push("", `⏱ <b>Всего часов за неделю: ${number(totalHours)} ч</b>`, "<i>Учитывается полная продолжительность смены от начала до конца.</i>");
  await renderStaff(chat, messageId, lines.join("\n"), [
    [{ text: "⬅️ К списку сотрудников", callback_data: `staff:employees:${page}` }],
    [{ text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
}
