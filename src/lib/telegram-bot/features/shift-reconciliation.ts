import { createDecipheriv } from "crypto";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";
import { escapeHtml, formatDate } from "../utils";
import type { Lang, Shift } from "../config";

type CalendarEvent = { uid: string; title: string; location: string; description: string; startsAt: Date; endsAt: Date };
type WorkLogShift = Pick<Shift, "id" | "work_date" | "store" | "shift_name" | "source"> & { notes?: string | null };

function todayInPrague() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return { year: parts.year, month: parts.month, date: `${parts.year}-${parts.month}-${parts.day}` };
}

function decryptCalendarUrl(value: string) {
  const keyValue = process.env.CONNECTEAM_ENCRYPTION_KEY;
  if (!keyValue) throw new Error("Connecteam encryption is not configured.");
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32) throw new Error("Connecteam encryption key is invalid.");
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Saved Connecteam calendar link is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

function unescapeIcs(value = "") {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseIcsDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = match;
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
}
function propertyValue(lines: string[], name: string) {
  const line = lines.find(item => item.toUpperCase().startsWith(`${name}:`) || item.toUpperCase().startsWith(`${name};`));
  return line ? line.slice(line.indexOf(":") + 1) : "";
}
function parseCalendar(ics: string): CalendarEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let block: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") block = [];
    else if (line === "END:VEVENT" && block) {
      const startsAt = parseIcsDate(propertyValue(block, "DTSTART"));
      const endsAt = parseIcsDate(propertyValue(block, "DTEND"));
      if (startsAt && endsAt && endsAt > startsAt) events.push({
        uid: propertyValue(block, "UID") || `${startsAt.toISOString()}-${propertyValue(block, "SUMMARY")}`,
        title: unescapeIcs(propertyValue(block, "SUMMARY")) || "Connecteam",
        location: unescapeIcs(propertyValue(block, "LOCATION")),
        description: unescapeIcs(propertyValue(block, "DESCRIPTION")),
        startsAt, endsAt,
      });
      block = null;
    } else if (block) block.push(line);
  }
  return events;
}
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function timeKey(date: Date) { return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`; }
function eventStore(event: CalendarEvent) {
  const title = event.title.replace(/^cashier\s*[-–—:]\s*/i, "").trim();
  return (event.location || title || "Connecteam").trim();
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}
function workLogRange(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return [`${match[1].padStart(2, "0")}:${match[2]}`, `${match[3].padStart(2, "0")}:${match[4]}`] as const;
}
function shiftKey(date: string, store: string, start: string, end: string) {
  return [date, normalize(store), start, end].join("|");
}

export async function reconcileCurrentMonth(chatId: number, userId: string, lang: Lang) {
  const db = createAdminClient();
  const { year, month } = todayInPrague();
  const from = `${year}-${month}-01`;
  const nextMonth = new Date(Date.UTC(Number(year), Number(month), 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(Number(nextMonth.slice(0, 4)), Number(nextMonth.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);

  const [{ data: connection, error: connectionError }, { data: workLogRows, error: shiftsError }] = await Promise.all([
    db.from("connecteam_connections").select("calendar_url_encrypted").eq("user_id", userId).maybeSingle(),
    db.from("shifts").select("id,work_date,store,shift_name,source,notes").eq("user_id", userId).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: true }),
  ]);
  if (connectionError) throw connectionError;
  if (shiftsError) throw shiftsError;
  if (!connection?.calendar_url_encrypted) {
    await telegramApi("sendMessage", { chat_id: chatId, text: "🔗 Сначала подключи календарь Connecteam в WorkLog → Настройки → Connecteam." });
    return;
  }

  const calendarUrl = decryptCalendarUrl(connection.calendar_url_encrypted);
  const response = await fetch(calendarUrl, {
    cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Connecteam calendar returned HTTP ${response.status}`);
  const ics = await response.text();
  if (ics.length > 2_000_000 || !ics.includes("BEGIN:VCALENDAR")) throw new Error("Connecteam returned an invalid calendar.");
  const events = parseCalendar(ics).filter(event => dateKey(event.startsAt) >= from && dateKey(event.startsAt) <= to);
  const workLog = ((workLogRows || []) as WorkLogShift[]).filter(shift => shift.source !== "connecteam" || true);

  const workLogBuckets = new Map<string, WorkLogShift[]>();
  for (const shift of workLog) {
    const range = workLogRange(shift.shift_name);
    if (!range) continue;
    const key = shiftKey(shift.work_date, shift.store, range[0], range[1]);
    workLogBuckets.set(key, [...(workLogBuckets.get(key) || []), shift]);
  }
  const connecteamBuckets = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = shiftKey(dateKey(event.startsAt), eventStore(event), timeKey(event.startsAt), timeKey(event.endsAt));
    connecteamBuckets.set(key, [...(connecteamBuckets.get(key) || []), event]);
  }

  const onlyWorkLog: WorkLogShift[] = [];
  const onlyConnecteam: CalendarEvent[] = [];
  const keys = new Set([...workLogBuckets.keys(), ...connecteamBuckets.keys()]);
  for (const key of keys) {
    const workItems = [...(workLogBuckets.get(key) || [])];
    const connectItems = [...(connecteamBuckets.get(key) || [])];
    const matched = Math.min(workItems.length, connectItems.length);
    onlyWorkLog.push(...workItems.slice(matched));
    onlyConnecteam.push(...connectItems.slice(matched));
  }

  const monthLabel = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric", timeZone: "Europe/Prague" }).format(new Date());
  const lines = [`🔎 <b>СВЕРКА СМЕН · ${escapeHtml(monthLabel)}</b>`, "", `WorkLog: ${workLog.length} смен · Connecteam: ${events.length} смен`, ""];
  if (!onlyWorkLog.length && !onlyConnecteam.length) {
    lines.push("✅ <b>Расписания совпадают.</b>", "Лишних и недостающих смен не найдено.");
  } else {
    lines.push(`⚠️ <b>Найдено расхождений: ${onlyWorkLog.length + onlyConnecteam.length}</b>`, "");
    if (onlyWorkLog.length) {
      lines.push("❌ <b>Есть в WorkLog, но отсутствуют в Connecteam:</b>");
      for (const shift of onlyWorkLog) {
        const range = workLogRange(shift.shift_name);
        const time = range ? `${range[0]}–${range[1]}` : shift.shift_name;
        lines.push(`• ${escapeHtml(formatDate(shift.work_date, lang))} · <b>${escapeHtml(shift.store)}</b> · ${escapeHtml(time)}`);
        if (shift.notes?.trim()) lines.push(`  📝 ${escapeHtml(shift.notes.trim())}`);
      }
      lines.push("");
    }
    if (onlyConnecteam.length) {
      lines.push("⚠️ <b>Есть в Connecteam, но отсутствуют в WorkLog:</b>");
      for (const event of onlyConnecteam) {
        lines.push(`• ${escapeHtml(formatDate(dateKey(event.startsAt), lang))} · <b>${escapeHtml(eventStore(event))}</b> · ${timeKey(event.startsAt)}–${timeKey(event.endsAt)}`);
        if (event.description.trim()) lines.push(`  📝 ${escapeHtml(event.description.trim())}`);
      }
    }
  }

  let chunk = "";
  for (const line of lines) {
    const next = chunk ? `${chunk}\n${line}` : line;
    if (next.length > 3800 && chunk) {
      await telegramApi("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML" });
      chunk = line;
    } else chunk = next;
  }
  if (chunk) await telegramApi("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML" });
}
