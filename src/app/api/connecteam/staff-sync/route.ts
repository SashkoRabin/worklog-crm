import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/telegram-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SHIFTS_OBJECT_ID = "13957585";
const SHIFTS_COURSE_ID = "11889080";
const USERS_OBJECT_ID = "13957586";
const BASE_URL = "https://app.connecteam.com";

type ConnecteamShift = {
  id: string;
  title?: string;
  startTime: number;
  endTime: number;
  timezone?: string;
  assignedUserIds?: Array<string | number>;
};
type ConnecteamUser = {
  userid: string | number;
  firstname?: string;
  lastname?: string;
  isArchived?: boolean;
};
type ApiResult<T> = { code?: number; data?: T; message?: string };

function repairMojibake(value: string) {
  // Some Connecteam responses arrive as UTF-8 bytes decoded as Latin-1.
  // Repair only strings that show typical mojibake markers and only when
  // the byte round-trip produces valid UTF-8.
  if (!/[ÃÂÐÑâ€]/.test(value)) return value;
  const repaired = Buffer.from(value, "latin1").toString("utf8");
  return repaired.includes("\uFFFD") ? value : repaired;
}

function localDate(epoch: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(epoch * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function localTime(epoch: number, timezone = "Europe/Prague") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(epoch * 1000));
}
function credentials() {
  const cookie = process.env.CONNECTEAM_COOKIE?.trim();
  const csrf = process.env.CONNECTEAM_CSRF_TOKEN?.trim();
  if (!cookie || !csrf) throw new Error("Connecteam session is not configured. Set CONNECTEAM_COOKIE and CONNECTEAM_CSRF_TOKEN.");
  if (/[\r\n]/.test(cookie) || /[\r\n]/.test(csrf)) throw new Error("Invalid Connecteam session configuration.");
  return { cookie, csrf };
}
async function requestConnecteam<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const { cookie, csrf } = credentials();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json, */*",
      "Content-Type": "application/json",
      Cookie: cookie,
      "x-csrf-token": csrf,
      Referer: `${BASE_URL}/index.html`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    throw new Error("Connecteam session expired or was rejected. Refresh CONNECTEAM_COOKIE and CONNECTEAM_CSRF_TOKEN.");
  }
  if (!response.ok) throw new Error(`Connecteam returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Connecteam returned a non-JSON response."); }
  const result = parsed as ApiResult<T>;
  if (result.code && result.code !== 200) throw new Error(result.message || `Connecteam API error ${result.code}`);
  if (!result.data) throw new Error("Connecteam response did not contain data.");
  return result.data as T;
}
function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function pragueMidnightEpoch(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(p => [p.type, p.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = target - represented;
    candidate += delta;
    if (delta === 0) break;
  }
  return Math.floor(candidate / 1000);
}

function extractShifts(payload: unknown): ConnecteamShift[] {
  if (Array.isArray(payload)) return payload as ConnecteamShift[];
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  if (Array.isArray(value.shifts)) return value.shifts as ConnecteamShift[];
  if (value.data && typeof value.data === "object" && Array.isArray((value.data as Record<string, unknown>).shifts)) return (value.data as { shifts: ConnecteamShift[] }).shifts;
  return [];
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    credentials();
    const today = localDate(Date.now() / 1000);
    const startDate = addDays(today, -45);
    const endDate = addDays(today, 90);
    const startTime = pragueMidnightEpoch(startDate);
    const endTime = pragueMidnightEpoch(addDays(endDate, 1)) - 1;

    const [shiftData, userData] = await Promise.all([
      requestConnecteam<{ shifts: ConnecteamShift[] }>(
        "/api/UserDashboard/ShiftScheduler/Shifts/",
        "POST",
        {
          objectId: Number(SHIFTS_OBJECT_ID),
          courseId: Number(SHIFTS_COURSE_ID),
          startDate: new Date(startTime * 1000).toISOString(),
          endDate: new Date(endTime * 1000).toISOString(),
          timezone: "Europe/Prague",
          _spirit: credentials().csrf,
        },
      ),
      requestConnecteam<{ users: ConnecteamUser[] }>(
        `/api/UserDashboard/Directory/Users/?objectId=${USERS_OBJECT_ID}`,
        "GET",
      ),
    ]);

    const shifts = extractShifts(shiftData);
    const users = Array.isArray(userData.users) ? userData.users : [];
    if (!users.length) throw new Error("Connecteam directory returned no users; refusing to overwrite the current snapshot.");
    if (!shifts.length) {
      const payloadKeys = shiftData && typeof shiftData === "object" ? Object.keys(shiftData as object) : [];
      throw new Error("Connecteam returned zero shifts for " + startDate + ".." + endDate + ". Payload keys: " + (payloadKeys.join(", ") || "none") + ". Existing database snapshot was preserved.");
    }

    const db = createAdminClient();
    const syncedAt = new Date().toISOString();
    const userRows = users.filter((user) => user.userid != null).map((user) => ({
      connecteam_user_id: String(user.userid),
      first_name: repairMojibake(user.firstname || ""),
      last_name: repairMojibake(user.lastname || ""),
      is_archived: Boolean(user.isArchived),
      synced_at: syncedAt,
    }));
    for (let i = 0; i < userRows.length; i += 500) {
      const { error } = await db.from("connecteam_staff_users").upsert(userRows.slice(i, i + 500), { onConflict: "connecteam_user_id" });
      if (error) throw error;
    }

    const shiftRows = shifts.filter((shift) =>
      shift.id && Number.isFinite(shift.startTime) && Number.isFinite(shift.endTime) && shift.endTime > shift.startTime && shift.title,
    ).map((shift) => ({
      connecteam_shift_id: String(shift.id),
      work_date: localDate(shift.startTime),
      location: repairMojibake(shift.title!.trim()),
      start_time: localTime(shift.startTime, shift.timezone),
      end_time: localTime(shift.endTime, shift.timezone),
      start_epoch: shift.startTime,
      end_epoch: shift.endTime,
      user_ids: (shift.assignedUserIds || []).map(String),
      synced_at: syncedAt,
    }));

    // Replace only the fetched time window after successful upstream reads.
    const { error: deleteError } = await db.from("connecteam_staff_shifts")
      .delete().gte("start_epoch", startTime).lte("start_epoch", endTime);
    if (deleteError) throw deleteError;
    for (let i = 0; i < shiftRows.length; i += 500) {
      const { error } = await db.from("connecteam_staff_shifts").upsert(shiftRows.slice(i, i + 500), { onConflict: "connecteam_shift_id" });
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true, shifts: shiftRows.length, users: userRows.length, startDate, endDate, syncedAt,
      locations: [...new Set(shiftRows.map(row => row.location))].sort(),
      shiftsWithAssignments: shiftRows.filter(row => row.user_ids.length > 0).length,
    });
  } catch (error) {
    console.error("Connecteam staff sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connecteam sync failed." }, { status: 500 });
  }
}
