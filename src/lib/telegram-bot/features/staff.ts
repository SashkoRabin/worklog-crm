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

async function renderStaffChunks(chat: number, messageId: number | undefined, lines: string[], keyboard: { text: string; callback_data: string }[][]) {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > 3800 && current) {
      chunks.push(current);
      current = line;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  if (!chunks.length) chunks.push("Смен не найдено.");
  for (let i = 0; i < chunks.length; i++) {
    await renderStaff(chat, i === 0 ? messageId : undefined, chunks[i], i === chunks.length - 1 ? keyboard : []);
  }
}

export async function showStaffHome(chat: number, messageId?: number) {
  await renderStaff(chat, messageId, "👥 <b>УПРАВЛЕНИЕ ПЕРСОНАЛОМ</b>\n<i>Сотрудники и рабочие смены</i>\n\nВыбери раздел:", [
    [{ text: "📅 Расписание", callback_data: "staff:schedule" }],
    [{ text: "🏆 Топ сотрудников", callback_data: "staff:leaderboard" }],
    [{ text: "🗓 График сотрудника", callback_data: "staff:employees" }],
    [{ text: "🏠 В главное меню", callback_data: "staff:menu" }],
  ]);
}

type ScheduleMode = "upcoming" | "month" | "week";

export async function showStaffScheduleHome(chat: number, messageId?: number) {
  await showStaffLocations(chat, messageId);
}

export async function showStaffScheduleLocations(chat: number, mode: ScheduleMode, messageId?: number) {
  const title = mode === "upcoming" ? "⏳ Предстоящие смены" : mode === "month" ? "📋 Список смен · за месяц" : "🗓 Расписание · на неделю";
  const rows: { text: string; callback_data: string }[][] = [];
  STAFF_LOCATIONS.forEach((name, i) => {
    const row = Math.floor(i / 2);
    rows[row] ||= [];
    rows[row].push({ text: name, callback_data: `staff:shiftloc:${mode}:${i}` });
  });
  await renderStaff(chat, messageId, `📅 <b>${title.toUpperCase()}</b>\n\nВыбери локацию:`, [
    ...rows,
    [{ text: "🌐 Все локации", callback_data: `staff:shiftloc:${mode}:all` }],
    [{ text: "⬅️ К расписанию", callback_data: "staff:schedule" }],
  ]);
}

export async function showStaffScheduleShifts(chat: number, mode: ScheduleMode, locationIndex: number | "all", messageId?: number) {
  const today = staffToday();
  const now = Math.floor(Date.now() / 1000);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = mode === "month" ? monthStart : mode === "week" ? monday : today;
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = mode === "month" ? monthEnd : mode === "week" ? addDays(monday, 6) : addDays(today, 7);
  const location = locationIndex === "all" ? null : STAFF_LOCATIONS[locationIndex];
  if (locationIndex !== "all" && !location) return;

  const db = createAdminClient();
  const { data, error } = await db.from("connecteam_staff_shifts")
    .select("connecteam_shift_id,work_date,location,start_time,end_time,start_epoch,end_epoch,user_ids")
    .gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: true }).order("start_time", { ascending: true });
  if (error) throw error;

  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
  const target = location ? normalize(location) : null;
  let shifts = ((data || []) as StaffShift[]).filter(shift => {
    if (!target) return true;
    const actual = normalize(shift.location || "");
    return actual === target || actual.startsWith(target + " ") || actual.includes(" " + target + " ") || actual.endsWith(" " + target);
  });
  if (mode === "upcoming") {
    shifts = shifts.filter(shift => Number(shift.start_epoch) > now);
  }

  const userIds = [...new Set(shifts.flatMap(shift => (shift.user_ids || []).map(String)))];
  const { data: users, error: usersError } = await db.from("connecteam_staff_users")
    .select("connecteam_user_id,first_name,last_name")
    .in("connecteam_user_id", userIds.length ? userIds : ["__none__"]);
  if (usersError) throw usersError;
  const names = new Map((users || []).map(user => [String(user.connecteam_user_id), `${user.first_name} ${user.last_name}`.trim()]));

  const title = mode === "upcoming" ? "⏳ ПРЕДСТОЯЩИЕ СМЕНЫ" : mode === "month" ? "📋 СПИСОК СМЕН · МЕСЯЦ" : "🗓 РАСПИСАНИЕ · НЕДЕЛЯ";
  const period = mode === "upcoming" ? `${formatDate(today, "ru")} – ${formatDate(to, "ru")}` : mode === "month" ? `${formatDate(from, "ru")} – ${formatDate(to, "ru")}` : `${formatDate(from, "ru")} – ${formatDate(to, "ru")}`;
  const lines = [title, `📍 ${location ? escapeHtml(location) : "Все локации"}`, `📆 ${period}`, "━━━━━━━━━━━━━━━━━━", ""];
  const seen = new Set<string>();
  let count = 0;
  for (const shift of shifts) {
    const key = shift.connecteam_shift_id || `${shift.work_date}:${shift.start_time}:${shift.end_time}:${shift.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const assigned = (shift.user_ids || []).map(String).map(id => names.get(id)).filter((name): name is string => Boolean(name));
    lines.push(`<b>${escapeHtml(formatDate(shift.work_date, "ru"))}</b> · ${escapeHtml(shift.start_time)}–${escapeHtml(shift.end_time)}`);
    lines.push(`📍 ${escapeHtml(shift.location || "Локация не указана")}`);
    lines.push(`👥 ${assigned.length ? assigned.map(escapeHtml).join(", ") : "Сотрудники не назначены"}`, "");
    count++;
  }
  if (!count) lines.push(mode === "upcoming" ? "🎉 Предстоящих смен не найдено." : "Смен за выбранный период не найдено.");
  else lines.push("━━━━━━━━━━━━━━━━━━", `Всего смен: <b>${count}</b>`);

  await renderStaff(chat, messageId, lines.join("\n"), [
    [{ text: "🔄 Выбрать другую локацию", callback_data: `staff:shifts:${mode}` }],
    [{ text: "⬅️ К расписанию", callback_data: "staff:schedule" }, { text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
}

export async function showStaffLocations(chat: number, messageId?: number) {
  const rows: { text: string; callback_data: string }[][] = [];
  STAFF_LOCATIONS.forEach((name, i) => {
    const row = Math.floor(i / 2);
    rows[row] ||= [];
    rows[row].push({ text: name, callback_data: `staff:loc:${i}` });
  });
  await renderStaff(chat, messageId,
    "📅 <b>РАСПИСАНИЕ СОТРУДНИКОВ</b>\n<i>Сначала выбери точку, затем дату</i>\n\n📍 <b>Локация</b>",
    [...rows, [{ text: "🌐 Все локации", callback_data: "staff:all:dates" }], [{ text: "⬅️ Сотрудники", callback_data: "staff:home" }]]);
}

export async function showStaffAllDates(chat: number, messageId?: number) {
  await renderStaff(chat, messageId, "🌐 <b>ВСЕ ЛОКАЦИИ</b>\n\nВыбери дату:", [
    [{ text: "Вчера", callback_data: "staff:all:date:y" }, { text: "Сегодня", callback_data: "staff:all:date:t" }, { text: "Завтра", callback_data: "staff:all:date:n" }],
    [{ text: "⬅️ К локациям", callback_data: "staff:back:loc" }, { text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
}

export async function showStaffAllForDate(chat: number, mode: string, messageId?: number) {
  const today = staffToday(), date = mode === "y" ? addDays(today, -1) : mode === "n" ? addDays(today, 1) : today;
  const db = createAdminClient();
  const { data, error } = await db.from("connecteam_staff_shifts")
    .select("connecteam_shift_id,work_date,location,start_time,end_time,user_ids")
    .eq("work_date", date).order("location", { ascending: true }).order("start_time", { ascending: true });
  if (error) throw error;
  const shifts = (data || []) as StaffShift[];
  const ids = [...new Set(shifts.flatMap(shift => (shift.user_ids || []).map(String)))];
  const { data: users, error: usersError } = await db.from("connecteam_staff_users")
    .select("connecteam_user_id,first_name,last_name")
    .in("connecteam_user_id", ids.length ? ids : ["__none__"]);
  if (usersError) throw usersError;
  const names = new Map((users || []).map(user => [String(user.connecteam_user_id), `${user.first_name} ${user.last_name}`.trim()]));
  const grouped = new Map<string, StaffShift[]>();
  for (const shift of shifts) {
    const location = shift.location || "Локация не указана";
    grouped.set(location, [...(grouped.get(location) || []), shift]);
  }
  const lines = [
    "🌐 <b>РАСПИСАНИЕ · ВСЕ ЛОКАЦИИ</b>",
    `📅 <b>${formatDate(date, "ru")}</b>`,
    "",
  ];
  let total = 0;
  for (const [location, locationShifts] of grouped) {
    if (total > 0) lines.push("");
    lines.push(`📍 <b>${escapeHtml(location)}</b>`);
    const seen = new Set<string>();
    for (const shift of locationShifts) {
      const key = shift.connecteam_shift_id || `${shift.start_time}:${shift.end_time}:${(shift.user_ids || []).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const assigned = (shift.user_ids || []).map(String).map(id => names.get(id)).filter((name): name is string => Boolean(name));
      lines.push(`🕒 <b>${escapeHtml(shift.start_time)} – ${escapeHtml(shift.end_time)}</b>`);
      if (assigned.length) {
        for (const name of assigned) lines.push(`   👤 ${escapeHtml(name)}`);
      } else {
        lines.push("   👥 <i>Сотрудники не назначены</i>");
      }
      lines.push("");
      total++;
    }
  }
  if (!shifts.length) lines.push("Смен на эту дату не найдено.");
  else lines.push(`📊 <b>Всего смен: ${total}</b>`);
  await renderStaffChunks(chat, messageId, lines, [
    [{ text: "🔄 Другая дата", callback_data: "staff:all:dates" }],
    [{ text: "⬅️ К локациям", callback_data: "staff:back:loc" }, { text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
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
  const normalizeLocation = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
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
  await renderStaffChunks(chat, messageId, lines, keyboard);
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
  await renderStaff(chat, messageId, `🗓 <b>ГРАФИК СОТРУДНИКА</b>\n<i>Рабочая неделя и месячная статистика</i>\n\n${description}`, keyboard);
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
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data, error }, { data: monthData, error: monthError }] = await Promise.all([
    db.from("connecteam_staff_shifts")
      .select("connecteam_shift_id,work_date,location,start_time,end_time,start_epoch,end_epoch,user_ids")
      .gte("work_date", monday)
      .lte("work_date", sunday)
      .order("work_date", { ascending: true })
      .order("start_time", { ascending: true }),
    db.from("connecteam_staff_shifts")
      .select("connecteam_shift_id,start_epoch,end_epoch,user_ids")
      .gte("work_date", monthStart)
      .lte("work_date", today),
  ]);
  if (error) throw error;
  if (monthError) throw monthError;

  const shifts = ((data || []) as StaffShift[])
    .filter(shift => (shift.user_ids || []).map(String).includes(userId))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time));
  const seen = new Set<string>();
  const uniqueShifts = shifts.filter(shift => {
    const key = shift.connecteam_shift_id || `${shift.work_date}:${shift.start_time}:${shift.end_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const monthShifts = ((monthData || []) as StaffShift[])
    .filter(shift => (shift.user_ids || []).map(String).includes(userId));
  const seenMonthShifts = new Set<string>();
  const totalMonthHours = monthShifts.reduce((sum, shift) => {
    const key = shift.connecteam_shift_id || `${shift.start_epoch}:${shift.end_epoch}`;
    if (seenMonthShifts.has(key)) return sum;
    seenMonthShifts.add(key);
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
  lines.push("", "━━━━━━━━━━━━━━━━━━", `⏱ <b>Всего часов за месяц: ${number(totalMonthHours)} ч</b>`);
  await renderStaff(chat, messageId, lines.join("\n"), [
    [{ text: "⬅️ К списку сотрудников", callback_data: `staff:employees:${page}` }],
    [{ text: "🏠 В меню", callback_data: "staff:menu" }],
  ]);
}
