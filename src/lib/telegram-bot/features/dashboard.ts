import { createAdminClient, telegramApi } from "@/lib/telegram-server";

import { copy, type Account, type Lang, type Shift } from "../config";

import { addDays, datePartsInZone, escapeHtml, formatDate, money } from "../utils";

import { appUrl, menuKeyboard } from "../menu";


export async function showScheduleMenu(chatId: number, lang: Lang) {
  const title = lang === "ru" ? "📅 <b>РАСПИСАНИЕ</b>\n<i>Выбери нужный формат просмотра смен</i>" : lang === "cs" ? "📅 <b>ROZVRH</b>\n<i>Vyber způsob zobrazení směn</i>" : "📅 <b>SCHEDULE</b>\n<i>Choose how to view your shifts</i>";
  const labels = lang === "ru"
    ? ["⏳ Предстоящие смены", "📋 Список смен · за месяц", "🗓 Расписание · на неделю", "🏠 Главное меню"]
    : lang === "cs"
      ? ["⏳ Nadcházející směny", "📋 Směny · tento měsíc", "🗓 Rozvrh · tento týden", "🏠 Hlavní nabídka"]
      : ["⏳ Upcoming shifts", "📋 Shifts · this month", "🗓 Schedule · this week", "🏠 Main menu"];
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: title,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [
      [{ text: labels[0], callback_data: "schedule:upcoming" }],
      [{ text: labels[1], callback_data: "schedule:month" }],
      [{ text: labels[2], callback_data: "schedule:week" }],
      [{ text: labels[3], callback_data: "schedule:close" }],
    ] },
  });
}

export async function showUpcomingShifts(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
  const db = createAdminClient(), zone = timezone || "Europe/Prague";
  const now = new Date();
  const today = datePartsInZone(now, zone);
  const todayString = `${today.year}-${today.month}-${today.day}`;
  const endDate = addDays(todayString, 7);
  const { data, error } = await db.from("shifts")
    .select("id,work_date,store,shift_name,shift_type,hours,hourly_rate,source")
    .eq("user_id", linkedUserId).gte("work_date", todayString).lte("work_date", endDate)
    .order("work_date", { ascending: true });
  if (error) throw error;

  const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const currentMinutes = Number(timeParts.find(part => part.type === "hour")?.value || 0) * 60
    + Number(timeParts.find(part => part.type === "minute")?.value || 0);
  const getStartMinutes = (name: string) => {
    const match = name.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*\d{1,2}:\d{2}/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const shifts = ((data || []) as Shift[]).filter(shift => {
    if (shift.work_date > todayString) return true;
    const start = getStartMinutes(shift.shift_name);
    return start !== null && start > currentMinutes;
  }).sort((a, b) => a.work_date.localeCompare(b.work_date)
    || (getStartMinutes(a.shift_name) ?? Number.MAX_SAFE_INTEGER) - (getStartMinutes(b.shift_name) ?? Number.MAX_SAFE_INTEGER));

  if (!shifts.length) {
    const empty = lang === "ru" ? "⏳ <b>Предстоящих смен нет.</b>\n\nНа ближайшие 7 дней новых смен не запланировано." : lang === "cs" ? "⏳ <b>Žádné nadcházející směny.</b>" : "⏳ <b>No upcoming shifts.</b>";
    await telegramApi("sendMessage", { chat_id: chatId, text: empty, parse_mode: "HTML" });
    return;
  }
  const grouped = new Map<string, Shift[]>();
  for (const shift of shifts) grouped.set(shift.work_date, [...(grouped.get(shift.work_date) || []), shift]);
  const lines = [lang === "ru" ? "⏳ <b>ПРЕДСТОЯЩИЕ СМЕНЫ</b>" : lang === "cs" ? "⏳ <b>NADCHÁZEJÍCÍ SMĚNY</b>" : "⏳ <b>UPCOMING SHIFTS</b>", "━━━━━━━━━━━━━━━━━━", ""];
  for (const [date, items] of grouped) {
    lines.push(`<b>📅 ${formatDate(date, lang)}</b>`);
    for (const shift of items) {
      const time = shift.shift_name.match(/\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/)?.[0] || shift.shift_name;
      lines.push(`• <b>${escapeHtml(shift.store)}</b> · ${escapeHtml(time)}`);
    }
    lines.push("");
  }
  lines.push("━━━━━━━━━━━━━━━━━━");
  await telegramApi("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}
\nexport async function showSchedule(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
  const db = createAdminClient(), t = copy[lang], zone = timezone || "Europe/Prague";
  const today = datePartsInZone(new Date(), zone);
  const todayString = `${today.year}-${today.month}-${today.day}`;
  const weekday = new Date(`${todayString}T12:00:00Z`).getUTCDay();
  const monday = addDays(todayString, weekday === 0 ? -6 : 1 - weekday);
  const sunday = addDays(monday, 6);
  const { data, error } = await db.from("shifts").select("id,work_date,store,shift_name,shift_type,hours,hourly_rate,source").eq("user_id", linkedUserId).gte("work_date", monday).lte("work_date", sunday).order("work_date", { ascending: true });
  if (error) throw error;
  const shifts = (data || []) as Shift[];
  if (!shifts.length) {
    await telegramApi("sendMessage", { chat_id: chatId, text: t.noShifts, parse_mode: "HTML" });
    return;
  }
  const grouped = new Map<string, Shift[]>();
  for (const shift of shifts) grouped.set(shift.work_date, [...(grouped.get(shift.work_date) || []), shift]);
  const from = formatDate(monday, lang), to = formatDate(sunday, lang);
  const lines = [t.weekTitle.replace("{from}", from).replace("{to}", to), ""];
  const tomorrowString = addDays(todayString, 1);
  for (const [date, items] of grouped) {
    const dayMarker = date === todayString
      ? ` · <b>${t.todayLabel}</b>`
      : date === tomorrowString
        ? ` · <b>${t.tomorrowLabel}</b>`
        : "";
    lines.push(`<b>📍 ${formatDate(date, lang)}${dayMarker}</b>`);
    const sortedItems = [...items].sort((a, b) => {
      const getStartMinutes = (name: string) => {
        const match = name.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*\d{1,2}:\d{2}/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
      };
      return getStartMinutes(a.shift_name) - getStartMinutes(b.shift_name);
    });
    for (const shift of sortedItems) {
      const time = shift.shift_name.match(/\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/)?.[0] || shift.shift_name;
      lines.push(`• <b>${escapeHtml(shift.store)}</b> · ${escapeHtml(time)}`);
    }
    lines.push("");
  }
  await telegramApi("sendMessage", { chat_id: chatId, text: lines.join("\n").trim(), parse_mode: "HTML" });
}
export async function showMonthShifts(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
  const db = createAdminClient(), t = copy[lang], zone = timezone || "Europe/Prague";
  const today = datePartsInZone(new Date(), zone);
  const monthStart = `${today.year}-${today.month}-01`;
  const nextMonth = addDays(`${today.year}-${today.month}-01`, 32).slice(0, 7) + "-01";
  const monthEnd = addDays(nextMonth, -1);
  const { data, error } = await db.from("shifts").select("id,work_date,store,shift_name,shift_type,hours,hourly_rate,source").eq("user_id", linkedUserId).gte("work_date", monthStart).lte("work_date", monthEnd).order("work_date", { ascending: true });
  if (error) throw error;
  const shifts = (data || []) as Shift[];
  if (!shifts.length) { await telegramApi("sendMessage", { chat_id: chatId, text: t.monthNoShifts, parse_mode: "HTML" }); return; }
  const startMinutes = (name: string) => { const m = name.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*\d{1,2}:\d{2}/); return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER; };
  shifts.sort((a,b) => a.work_date.localeCompare(b.work_date) || startMinutes(a.shift_name) - startMinutes(b.shift_name));
  const period = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric", timeZone: zone }).format(new Date());
  const totalHours = shifts.reduce((sum,s) => sum + Number(s.hours || 0), 0);
  const totalMoney = shifts.reduce((sum,s) => sum + Number(s.hours || 0) * Number(s.hourly_rate || 0), 0);
  const summary = t.monthSummary.replace("{count}", String(shifts.length)).replace("{hours}", totalHours.toLocaleString(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 })).replace("{money}", money(totalMoney, lang));
  const grouped = new Map<string, Shift[]>();
  for (const shift of shifts) grouped.set(shift.work_date, [...(grouped.get(shift.work_date) || []), shift]);
  const header = t.monthTitle.replace("{period}", period);
  let message = `${header}\n\n${summary}\n\n`;
  for (const [date, items] of grouped) {
    const section = `<b>📅 ${formatDate(date, lang)}</b>\n` + items.map(shift => {
      const time = shift.shift_name.match(/\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/)?.[0] || shift.shift_name;
      return `• <b>${escapeHtml(shift.store)}</b> · ${escapeHtml(time)}`;
    }).join("\n") + "\n\n";
    if (message.length + section.length > 3800) {
      await telegramApi("sendMessage", { chat_id: chatId, text: message.trim(), parse_mode: "HTML" });
      message = `${header} <i>(continued)</i>\n\n${section}`;
    } else message += section;
  }
  if (message.trim()) await telegramApi("sendMessage", { chat_id: chatId, text: message.trim(), parse_mode: "HTML" });
}
export async function showEarnings(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
  const db = createAdminClient(), zone = timezone || "Europe/Prague", t = copy[lang];
  const today = datePartsInZone(new Date(), zone);
  const todayString = `${today.year}-${today.month}-${today.day}`;
  const monthStart = `${today.year}-${today.month}-01`;
  const nextMonth = addDays(`${today.year}-${today.month}-01`, 32).slice(0, 7) + "-01";
  const monthEnd = addDays(nextMonth, -1);
  const { data, error } = await db.from("shifts").select("work_date,hours,hourly_rate").eq("user_id", linkedUserId).gte("work_date", monthStart).lte("work_date", monthEnd);
  if (error) throw error;
  const shifts = (data || []) as Pick<Shift, "work_date" | "hours" | "hourly_rate">[];
  const actual = shifts.filter(s => s.work_date <= todayString);
  const actualHours = actual.reduce((sum, s) => sum + Number(s.hours), 0);
  const actualMoney = actual.reduce((sum, s) => sum + Number(s.hours) * Number(s.hourly_rate), 0);
  const potentialHours = shifts.reduce((sum, s) => sum + Number(s.hours), 0);
  const potentialMoney = shifts.reduce((sum, s) => sum + Number(s.hours) * Number(s.hourly_rate), 0);
  const period = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric", timeZone: zone }).format(new Date());
  const text = [
    t.hoursTitle.replace("{period}", period),
    "",
    `<b>${t.actual}</b>`,
    `⏱ ${actualHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${t.hours} · ${money(actualMoney, lang)}`,
    `<i>${t.actualNote}</i>`,
    "",
    `<b>${t.potential}</b>`,
    `⏱ ${potentialHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${t.hours} · ${money(potentialMoney, lang)}`,
    `<i>${t.potentialNote}</i>`,
  ].join("\n");
  await telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}
export async function showGuide(chatId: number, lang: Lang) {
  const t = copy[lang];
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: `${t.guideTitle}\n\n${t.guide}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t.open, web_app: { url: appUrl() } }], [{ text: t.connecteamButton, web_app: { url: appUrl() } }]] },
  });
}
export async function toggleReminders(chatId: number, userId: number, account: Account) {
  const enabled = !account.reminders_enabled, db = createAdminClient();
  const { error } = await db.from("telegram_accounts").update({ reminders_enabled: enabled }).eq("telegram_user_id", userId);
  if (error) throw error;
  await telegramApi("sendMessage", { chat_id: chatId, text: enabled ? copy[account.language].enabled : copy[account.language].disabled, parse_mode: "HTML", reply_markup: menuKeyboard(account.language, enabled) });
}