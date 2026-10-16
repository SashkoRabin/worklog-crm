import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const runtime = "nodejs";

class SetupError extends Error {}

type CalendarEvent = {
  uid: string;
  title: string;
  location: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
};

function encryptionKey() {
  const encoded = process.env.CONNECTEAM_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Connecteam encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CONNECTEAM_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Saved Connecteam connection is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

function validateCalendarUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("Paste a valid Connecteam calendar link.");
  const url = new URL(value.trim());
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || hostname === "localhost" || hostname.endsWith(".local") || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(hostname)) {
    throw new Error("The calendar link must use HTTPS.");
  }
  return url.toString();
}

function unescapeIcs(value = "") {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = match;
  const timestamp = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  // A floating ICS time has no offset. We preserve its wall-clock components;
  // duration and work date stay correct regardless of the deployment timezone.
  return new Date(utc ? timestamp : timestamp);
}

function valueFor(lines: string[], name: string) {
  const line = lines.find((item) => item.toUpperCase().startsWith(`${name}:`) || item.toUpperCase().startsWith(`${name};`));
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

function parseCalendar(ics: string) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let block: string[] | null = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") block = [];
    else if (line === "END:VEVENT" && block) {
      const startsAt = parseIcsDate(valueFor(block, "DTSTART"));
      const endsAt = parseIcsDate(valueFor(block, "DTEND"));
      if (startsAt && endsAt && endsAt > startsAt) {
        events.push({
          uid: valueFor(block, "UID") || `${startsAt.toISOString()}-${valueFor(block, "SUMMARY")}`,
          title: unescapeIcs(valueFor(block, "SUMMARY")) || "Connecteam shift",
          location: unescapeIcs(valueFor(block, "LOCATION")) || "Connecteam",
          description: unescapeIcs(valueFor(block, "DESCRIPTION")),
          startsAt,
          endsAt,
        });
      }
      block = null;
    } else if (block) block.push(line);
  }
  return events;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeLabel(date: Date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function storeName(title: string) {
  return title.replace(/^cashier\s*[-–—:]\s*/i, "").trim() || "Connecteam";
}

async function userAndClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !process.env.CONNECTEAM_ENCRYPTION_KEY) {
    throw new SetupError("Connecteam sync is not configured on this deployment.");
  }
  const cookieStore = await cookies();
  const auth = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Route handlers may run in a context where set is read-only; proxy still refreshes the session.
        }
      },
    },
  });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  return { user, database: auth };
}

function shiftFromEvent(
  userId: string,
  event: CalendarEvent,
  hourlyRate: number,
) {
  return {
    user_id: userId,
    work_date: dateKey(event.startsAt),
    store: storeName(event.title),
    shift_name: `${timeLabel(event.startsAt)}–${timeLabel(event.endsAt)}`,
    shift_type: "assigned" as const,
    hours: Math.round(((event.endsAt.getTime() - event.startsAt.getTime()) / 3_600_000) * 100) / 100,
    hourly_rate: hourlyRate,
    source: "connecteam" as const,
    external_id: event.uid,
    notes: event.description || null,
  };
}

export async function GET() {
  try {
    const context = await userAndClients();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data, error } = await context.database.from("connecteam_connections").select("last_synced_at").eq("user_id", context.user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: Boolean(data), lastSyncedAt: data?.last_synced_at ?? null });
  } catch (error) {
    return NextResponse.json({ code: error instanceof SetupError ? "SETUP_REQUIRED" : undefined, error: error instanceof Error ? error.message : "Unable to check Connecteam connection." }, { status: error instanceof SetupError ? 503 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await userAndClients();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    let { data: connection, error } = await context.database.from("connecteam_connections").select("calendar_url_encrypted").eq("user_id", context.user.id).maybeSingle();
    if (error) throw error;
    const suppliedCalendarUrl = body.calendarUrl ? validateCalendarUrl(body.calendarUrl) : null;
    if (suppliedCalendarUrl) {
      const saved = await context.database.from("connecteam_connections").upsert({ user_id: context.user.id, calendar_url_encrypted: encrypt(suppliedCalendarUrl), updated_at: new Date().toISOString() });
      if (saved.error) throw saved.error;
    }
    if (!connection && !suppliedCalendarUrl) throw new Error("Connect a Connecteam calendar before syncing.");
    const calendarUrl = suppliedCalendarUrl || decrypt(connection!.calendar_url_encrypted);
    const response = await fetch(calendarUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000), headers: { Accept: "text/calendar, text/plain;q=0.9" } });
    if (!response.ok) throw new Error("Connecteam calendar could not be downloaded. Check the link and try again.");
    const contentType = response.headers.get("content-type") || "";
    const ics = await response.text();
    if ((!contentType.includes("calendar") && !ics.includes("BEGIN:VCALENDAR")) || ics.length > 2_000_000) throw new Error("The link did not return a valid calendar.");
    // The personal ICS feed is the source of truth. Import every event it
    // contains so the calendar retains the whole available shift history.
    const calendarItems = parseCalendar(ics);
    const feedUids = new Set(calendarItems.map((event) => event.uid));
    const [{ data: manualShifts, error: manualShiftsError }, { data: dismissedRows, error: dismissedError }, { data: profile, error: profileError }] =
      await Promise.all([
        context.database
          .from("shifts")
          .select("work_date")
          .eq("user_id", context.user.id)
          .eq("source", "manual"),
        context.database
          .from("connecteam_dismissed_shifts")
          .select("external_id")
          .eq("user_id", context.user.id),
        context.database
          .from("profiles")
          .select("hourly_rate")
          .eq("id", context.user.id)
          .maybeSingle(),
      ]);
    if (manualShiftsError) throw manualShiftsError;
    if (dismissedError) throw dismissedError;
    if (profileError) throw profileError;
    const manualDates = new Set((manualShifts || []).map((shift) => shift.work_date));
    const dismissedUids = new Set((dismissedRows || []).map((row) => row.external_id));
    const items = calendarItems.filter(
      (event) =>
        !manualDates.has(dateKey(event.startsAt)) && !dismissedUids.has(event.uid),
    );
    const hourlyRate = Number(profile?.hourly_rate ?? 0);
    if (items.length) {
      const imported = items.map((event) => shiftFromEvent(context.user.id, event, hourlyRate));
      const upserted = await context.database
        .from("shifts")
        .upsert(imported, { onConflict: "user_id,source,external_id" });
      if (upserted.error) throw upserted.error;
    }
    const { data: storedConnecteam, error: storedError } = await context.database
      .from("shifts")
      .select("id, external_id")
      .eq("user_id", context.user.id)
      .eq("source", "connecteam");
    if (storedError) throw storedError;
    const staleIds = (storedConnecteam || [])
      .filter((shift) => shift.external_id && !feedUids.has(shift.external_id))
      .map((shift) => shift.id);
    if (staleIds.length) {
      const removed = await context.database.from("shifts").delete().in("id", staleIds);
      if (removed.error) throw removed.error;
    }
    const updated = await context.database.from("connecteam_connections").update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", context.user.id);
    if (updated.error) throw updated.error;
    return NextResponse.json({ imported: items.length });
  } catch (error) {
    return NextResponse.json({ code: error instanceof SetupError ? "SETUP_REQUIRED" : undefined, error: error instanceof Error ? error.message : "Unable to sync Connecteam." }, { status: error instanceof SetupError ? 503 : 400 });
  }
}

export async function DELETE() {
  try {
    const context = await userAndClients();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const result = await context.database.from("connecteam_connections").delete().eq("user_id", context.user.id);
    if (result.error) throw result.error;
    const imported = await context.database.from("shifts").delete().eq("user_id", context.user.id).eq("source", "connecteam");
    if (imported.error) throw imported.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ code: error instanceof SetupError ? "SETUP_REQUIRED" : undefined, error: error instanceof Error ? error.message : "Unable to disconnect Connecteam." }, { status: error instanceof SetupError ? 503 : 400 });
  }
}
