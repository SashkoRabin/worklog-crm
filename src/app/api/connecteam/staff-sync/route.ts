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
function toEpoch(date: string, end = false) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0) / 1000;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    credentials();
    const today = localDate(Date.now() / 1000);
    const startDate = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
    const startTime = toEpoch(startDate);
    const endTime = toEpoch(endDate, true);

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

    const shifts = Array.isArray(shiftData.shifts) ? shiftData.shifts : [];
    const users = Array.isArray(userData.users) ? userData.users : [];
    if (!users.length) throw new Error("Connecteam directory returned no users; refusing to overwrite the current snapshot.");

    const db = createAdminClient();
    const syncedAt = new Date().toISOString();
    const userRows = users.filter((user) => user.userid != null).map((user) => ({
      connecteam_user_id: String(user.userid),
      first_name: user.firstname || "",
      last_name: user.lastname || "",
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
      location: shift.title!.trim(),
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
    });
  } catch (error) {
    console.error("Connecteam staff sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connecteam sync failed." }, { status: 500 });
  }
}
