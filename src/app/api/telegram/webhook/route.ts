"use strict";
import { timingSafeEqual, createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";

export const runtime = "nodejs";
type Lang = "en" | "ru" | "cs";
type Update = {
  message?: { chat: { id: number; type?: string }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number } } };
};
type Account = { language: Lang; reminders_enabled: boolean; timezone?: string; linked_user_id: string | null };
type Shift = { id: string; work_date: string; store: string; shift_name: string; shift_type: "worked" | "replacement" | "assigned"; hours: number; hourly_rate: number; source: string };

const copy = {
  en: {
    choose: "Welcome to WorkLog! Choose your language.",
    welcome: "👋 <b>Welcome to WorkLog</b>\n\nYour personal workspace for shifts, working hours and earnings. Use the menu below to open your dashboard, check your weekly schedule or review your income.",
    open: "🌐 Open WorkLog", guideMenu: "📚 Guide", schedule: "📅 Schedule", monthShifts: "🗂 All shifts", earnings: "💰 Hours & earnings",
    remindersOn: "🔕 Turn reminders off", remindersOff: "🔔 Turn reminders on", enabled: "🔔 <b>Reminders enabled</b>\n\nI’ll notify you before each upcoming shift.", disabled: "🔕 <b>Reminders disabled</b>\n\nYou can turn them back on anytime from this menu.",
    linked: "✅ <b>Telegram connected!</b>\n\nYour WorkLog account is linked. Shift reminders are enabled by default.",
    badLink: "⚠️ This link is invalid, expired or already used. Generate a new one in WorkLog → Telegram.",
    guideTitle: "📚 <b>WorkLog quick guide</b>",
    guide: "🗓 <b>Shifts & calendar</b>\nOpen the calendar to add or edit a shift. Select the date, workplace, shift type, actual hours and hourly rate. Planned shifts are shown separately from completed work.\n\n🔗 <b>Connecteam</b>\nIn WorkLog, open <b>Settings → Connecteam</b>. Paste your personal Calendar Sync link and select <b>Connect & sync</b>. Imported shifts appear in your schedule as planned shifts.\n\n💸 <b>Hours & earnings</b>\nCompleted hours multiplied by the saved hourly rate form your earned income. Upcoming shifts contribute to your potential hours and income.\n\n🔔 <b>Notifications</b>\nUse the Reminders button in this menu to turn shift notifications on or off. The notification time is configured in WorkLog → Telegram.",
    noShifts: "📅 <b>You have no shifts scheduled this week.</b>\n\nEnjoy your free time!", monthNoShifts: "🗂 <b>No shifts this month.</b>\n\nYour monthly schedule is currently empty.", monthTitle: "🗂 <b>All shifts · {period}</b>", monthSummary: "📊 {count} shifts · {hours} h · {money}",
    weekTitle: "📅 <b>Your schedule · {from} – {to}</b>", todayLabel: "TODAY", tomorrowLabel: "TOMORROW",
    hoursTitle: "💰 <b>Your hours & earnings</b>\n<i>{period}</i>",
    actual: "✅ Completed", potential: "📈 Potential (including planned)", hours: "h", currency: "CZK",
    menuHint: "Use the menu below to continue.",
    guideButton: "📚 Open guide", connecteamButton: "🔗 Connect Connecteam",
    actualNote: "Based on shifts dated up to today.", potentialNote: "Includes all shifts scheduled for this month.",
  },
  ru: {
    choose: "Добро пожаловать в WorkLog! Выбери язык.",
    welcome: "👋 <b>Добро пожаловать в WorkLog</b>\n\nТвой персональный помощник для учёта смен, рабочего времени и заработка. Используй меню ниже, чтобы открыть приложение, посмотреть расписание или проверить доход.",
    open: "🌐 Открыть WorkLog", guideMenu: "📚 Руководство", schedule: "📅 Расписание", monthShifts: "🗂 Список смен", earnings: "💰 Часы и заработок",
    remindersOn: "🔕 Выключить напоминания", remindersOff: "🔔 Включить напоминания", enabled: "🔔 <b>Напоминания включены</b>\n\nБуду присылать уведомления перед предстоящими сменами.", disabled: "🔕 <b>Напоминания выключены</b>\n\nВ любой момент можешь включить их обратно через меню.",
    linked: "✅ <b>Telegram подключён!</b>\n\nАккаунт WorkLog успешно привязан. Напоминания о сменах включены по умолчанию.",
    badLink: "⚠️ Ссылка недействительна, устарела или уже использована. Создай новую в WorkLog → Telegram.",
    guideTitle: "📚 <b>Краткое руководство WorkLog</b>",
    guide: "🗓 <b>Смены и календарь</b>\nОткрой календарь, чтобы добавить или изменить смену. Выбери дату, рабочее место, тип смены, фактические часы и ставку. Запланированные смены отображаются отдельно от уже отработанных.\n\n🔗 <b>Подключение Connecteam</b>\nВ WorkLog открой <b>Настройки → Connecteam</b>. Вставь личную ссылку Calendar Sync и нажми <b>Подключить и синхронизировать</b>. Импортированные смены появятся в расписании как запланированные.\n\n💸 <b>Часы и заработок</b>\nФактический заработок рассчитывается по отработанным часам и ставке, сохранённой в смене. Будущие смены учитываются в потенциальных часах и заработке.\n\n🔔 <b>Уведомления</b>\nВключай и выключай уведомления кнопкой «Напоминания» в меню. Время уведомления настраивается на сайте в разделе WorkLog → Telegram.",
    noShifts: "📅 <b>У вас нет смен на этой неделе.</b>\n\nОтличная возможность отдохнуть и восстановить силы! 🌿", monthNoShifts: "🗂 <b>В этом месяце смен пока нет.</b>\n\nРасписание за месяц пустое.", monthTitle: "🗂 <b>Все смены · {period}</b>", monthSummary: "📊 Всего: {count} смен · {hours} ч · {money}",
    weekTitle: "📅 <b>Ваше расписание · {from} – {to}</b>", todayLabel: "СЕГОДНЯ", tomorrowLabel: "ЗАВТРА",
    hoursTitle: "💰 <b>Часы и заработок</b>\n<i>{period}</i>",
    actual: "✅ Фактически", potential: "📈 Потенциально (с учётом плановых смен)", hours: "ч", currency: "CZK",
    menuHint: "Используйте меню ниже для быстрого доступа.",
    guideButton: "📚 Открыть руководство", connecteamButton: "🔗 Подключить Connecteam",
    actualNote: "Смены по сегодняшний день включительно.", potentialNote: "Включает все смены, запланированные на этот месяц.",
  },
  cs: {
    choose: "Vítej ve WorkLogu! Vyber si jazyk.",
    welcome: "👋 <b>Vítej ve WorkLogu</b>\n\nTvůj osobní prostor pro směny, pracovní dobu a výdělek. Pomocí nabídky níže otevři aplikaci, zobraz rozvrh nebo zkontroluj příjem.",
    open: "🌐 Otevřít WorkLog", guideMenu: "📚 Návod", schedule: "📅 Rozvrh", monthShifts: "🗂 Všechny směny", earnings: "💰 Hodiny a výdělek",
    remindersOn: "🔕 Vypnout připomenutí", remindersOff: "🔔 Zapnout připomenutí", enabled: "🔔 <b>Připomenutí zapnuta</b>\n\nUpozorním tě před každou nadcházející směnou.", disabled: "🔕 <b>Připomenutí vypnuta</b>\n\nKdykoli je můžeš znovu zapnout v nabídce.",
    linked: "✅ <b>Telegram je propojen!</b>\n\nTvůj účet WorkLog je propojen. Připomenutí směn jsou ve výchozím nastavení zapnutá.",
    badLink: "⚠️ Odkaz je neplatný, vypršel nebo už byl použit. Vytvoř nový ve WorkLog → Telegram.",
    guideTitle: "📚 <b>Rychlý návod WorkLog</b>",
    guide: "🗓 <b>Směny a kalendář</b>\nOtevři kalendář pro přidání nebo úpravu směny. Vyber datum, pracoviště, typ směny, skutečné hodiny a sazbu. Plánované směny jsou oddělené od dokončené práce.\n\n🔗 <b>Connecteam</b>\nVe WorkLog otevři <b>Nastavení → Connecteam</b>. Vlož osobní odkaz Calendar Sync a klikni na <b>Připojit a synchronizovat</b>. Importované směny se zobrazí jako plánované.\n\n💸 <b>Hodiny a výdělek</b>\nSkutečný výdělek se počítá z odpracovaných hodin a sazby uložené u směny. Budoucí směny se započítávají do potenciálních hodin a výdělku.\n\n🔔 <b>Upozornění</b>\nUpozornění zapneš nebo vypneš tlačítkem v nabídce. Čas upozornění nastavíš na webu v WorkLog → Telegram.",
    noShifts: "📅 <b>Tento týden nemáte žádné směny.</b>\n\nUžij si volný čas!", monthNoShifts: "🗂 <b>Tento měsíc nemáš žádné směny.</b>\n\nMěsíční rozvrh je zatím prázdný.", monthTitle: "🗂 <b>Všechny směny · {period}</b>", monthSummary: "📊 Celkem: {count} směn · {hours} h · {money}",
    weekTitle: "📅 <b>Tvůj rozvrh · {from} – {to}</b>", todayLabel: "DNES", tomorrowLabel: "ZÍTRA",
    hoursTitle: "💰 <b>Tvé hodiny a výdělek</b>\n<i>{period}</i>",
    actual: "✅ Skutečnost", potential: "📈 Potenciál (včetně plánovaných)", hours: "h", currency: "CZK",
    menuHint: "Pokračuj pomocí nabídky níže.",
    guideButton: "📚 Otevřít návod", connecteamButton: "🔗 Připojit Connecteam",
    actualNote: "Směny do dnešního dne včetně.", potentialNote: "Zahrnuje všechny směny naplánované na tento měsíc.",
  },
} as const;

function matchSecret(a: string | null, b: string) {
  if (!a) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function appUrl() { return process.env.NEXT_PUBLIC_APP_URL || "https://worklog-crm.vercel.app"; }
function menuKeyboard(lang: Lang, enabled: boolean) {
  const t = copy[lang];
  return {
    keyboard: [
      [{ text: t.open, web_app: { url: appUrl() } }],
      [{ text: t.guideMenu }, { text: t.schedule }],
      [{ text: t.monthShifts }, { text: t.earnings }],
      [{ text: enabled ? t.remindersOn : t.remindersOff }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: lang === "ru" ? "Выберите действие…" : lang === "cs" ? "Vyber akci…" : "Choose an action…",
  };
}
async function sendMenu(chatId: number, lang: Lang, enabled: boolean, welcome = false) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: welcome ? copy[lang].welcome : copy[lang].menuHint,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(lang, enabled),
  });
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
function datePartsInZone(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return value.toISOString().slice(0, 10);
}
function formatDate(date: string, lang: Lang) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function money(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}
async function showSchedule(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
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
async function showMonthShifts(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
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
async function showEarnings(chatId: number, linkedUserId: string, lang: Lang, timezone: string) {
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
async function showGuide(chatId: number, lang: Lang) {
  const t = copy[lang];
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: `${t.guideTitle}\n\n${t.guide}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t.open, web_app: { url: appUrl() } }], [{ text: t.connecteamButton, web_app: { url: appUrl() } }]] },
  });
}
async function toggleReminders(chatId: number, userId: number, account: Account) {
  const enabled = !account.reminders_enabled, db = createAdminClient();
  const { error } = await db.from("telegram_accounts").update({ reminders_enabled: enabled }).eq("telegram_user_id", userId);
  if (error) throw error;
  await telegramApi("sendMessage", { chat_id: chatId, text: enabled ? copy[account.language].enabled : copy[account.language].disabled, parse_mode: "HTML", reply_markup: menuKeyboard(account.language, enabled) });
}
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Telegram webhook is not configured." }, { status: 503 });
  if (!matchSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const update = await request.json() as Update, db = createAdminClient(), msg = update.message;
    if (msg?.from && msg.chat.type !== "group" && msg.chat.type !== "supergroup") {
      const id = msg.from.id, chat = msg.chat.id;
      await db.from("telegram_accounts").upsert({ telegram_user_id: id, chat_id: chat }, { onConflict: "telegram_user_id", ignoreDuplicates: true });
      const { data: account, error } = await db.from("telegram_accounts").select("language,reminders_enabled,timezone,linked_user_id").eq("telegram_user_id", id).single();
      if (error) throw error;
      const lang = (account.language in copy ? account.language : "en") as Lang, t = copy[lang];
      const payload = msg.text?.match(/^\/start(?:\s+(.+))?/i)?.[1];
      if (payload?.startsWith("link_")) {
        const hash = createHash("sha256").update(payload.slice(5)).digest("hex");
        const { data: link } = await db.from("telegram_link_tokens").select("id,user_id").eq("token_hash", hash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!link) await telegramApi("sendMessage", { chat_id: chat, text: t.badLink });
        else {
          const { data: claimed, error: claimError } = await db.from("telegram_link_tokens").update({ used_at: new Date().toISOString() }).eq("id", link.id).is("used_at", null).select("id").maybeSingle();
          if (claimError) throw claimError;
          if (!claimed) await telegramApi("sendMessage", { chat_id: chat, text: t.badLink });
          else {
            const { error: linkError } = await db.from("telegram_accounts").update({ linked_user_id: link.user_id, linked_at: new Date().toISOString(), reminders_enabled: true, reminder_minutes: 120 }).eq("telegram_user_id", id);
            if (linkError) throw linkError;
            await telegramApi("sendMessage", { chat_id: chat, text: t.linked, parse_mode: "HTML" });
            await sendMenu(chat, lang, true, true);
          }
        }
      } else if (msg.text?.startsWith("/start")) {
        await telegramApi("sendMessage", { chat_id: chat, text: copy.en.choose, reply_markup: { inline_keyboard: [[{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇨🇿 Čeština", callback_data: "lang:cs" }]] } });
      } else if (msg.text?.startsWith("/menu") || msg.text?.startsWith("/help")) {
        await sendMenu(chat, lang, account.reminders_enabled, true);
      } else if (msg.text === t.open) {
        await telegramApi("sendMessage", { chat_id: chat, text: t.menuHint, reply_markup: menuKeyboard(lang, account.reminders_enabled) });
      } else if (msg.text === t.guideMenu) {
        await showGuide(chat, lang);
      } else if (msg.text === t.schedule) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showSchedule(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === t.monthShifts) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showMonthShifts(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === t.earnings) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showEarnings(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === t.remindersOn || msg.text === t.remindersOff) {
        await toggleReminders(chat, id, account);
      }
    }
    if (update.callback_query) {
      const q = update.callback_query, chat = q.message?.chat.id;
      if (chat === undefined) return NextResponse.json({ ok: true });
      const { data: account, error } = await db.from("telegram_accounts").select("language,reminders_enabled,timezone").eq("telegram_user_id", q.from.id).single();
      if (error) throw error;
      const lang = (account.language in copy ? account.language : "en") as Lang;
      if (q.data?.startsWith("lang:")) {
        const value = q.data.slice(5) as Lang;
        if (value in copy) {
          const { error: languageError } = await db.from("telegram_accounts").update({ language: value }).eq("telegram_user_id", q.from.id);
          if (languageError) throw languageError;
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
          await sendMenu(chat, value, account.reminders_enabled, true);
        }
      } else if (q.data === "language:choose") {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
        await telegramApi("sendMessage", { chat_id: chat, text: copy.en.choose, reply_markup: { inline_keyboard: [[{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇨🇿 Čeština", callback_data: "lang:cs" }]] } });
      } else if (q.data?.startsWith("guide:")) {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
        await showGuide(chat, lang);
      } else {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ error: "Unable to process Telegram update." }, { status: 500 });
  }
}
