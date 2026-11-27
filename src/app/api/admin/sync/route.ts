import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/telegram-server";

export const runtime = "nodejs";
export const maxDuration = 60;
const ADMIN_EMAIL = "admin@gmail.com";
const API_BASE = "https://api.connecteam.com";
const PAGE_SIZE = 500;

type ConnecteamUser = {
  userId?: number | string;
  id?: number | string;
  firstName?: string;
  lastName?: string;
  isArchived?: boolean;
  userStatus?: string;
};
type ConnecteamScheduler = { schedulerId: number | string; name?: string; isArchived?: boolean; timezone?: string };
type ConnecteamShift = {
  id: string | number;
  title?: string;
  startTime: number;
  endTime: number;
  assignedUserIds?: Array<string | number>;
  assignedUserId?: string | number;
  isPublished?: boolean;
  isOpenShift?: boolean;
  locationData?: { gps?: { address?: string } };
};
type ApiEnvelope<T> = { data?: T; paging?: { offset?: number } };

function nextOffset(result: ApiEnvelope<unknown>, current: number, count: number) {
  const next = result.paging?.offset;
  if (typeof next === "number" && next > current) return next;
  return current + count;
}

async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((user.email || "").trim().toLowerCase() !== ADMIN_EMAIL) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function apiKey() {
  const key = process.env.CONNECTEAM_API_KEY;
  if (!key) throw new Error("Connecteam API is not configured. Add CONNECTEAM_API_KEY to Vercel environment variables.");
  return key;
}

async function connecteamGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", "X-API-KEY": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : "";
    throw new Error(`Connecteam API ${response.status}: ${detail || response.statusText}`);
  }
  return payload as T;
}

async function getAllUsers() {
  const users: ConnecteamUser[] = [];
  for (let offset = 0; offset < 100_000; offset += PAGE_SIZE) {
    const result = await connecteamGet<ApiEnvelope<{ users?: ConnecteamUser[] }>>(
      `/users/v1/users?limit=${PAGE_SIZE}&offset=${offset}&userStatus=all`,
    );
    const batch = result.data?.users || [];
    users.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const next = nextOffset(result, offset, batch.length);
    if (next <= offset) throw new Error("Connecteam users pagination did not advance.");
    offset = next - PAGE_SIZE;
  }
  return users;
}

async function getAllShifts(schedulerId: string | number, startTime: number, endTime: number) {
  const shifts: ConnecteamShift[] = [];
  for (let offset = 0; offset < 100_000; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      startTime: String(startTime), endTime: String(endTime),
      limit: String(PAGE_SIZE), offset: String(offset),
    });
    const result = await connecteamGet<ApiEnvelope<{ shifts?: ConnecteamShift[] }>>(
      `/scheduler/v1/schedulers/${encodeURIComponent(String(schedulerId))}/shifts?${params}`,
    );
    const batch = result.data?.shifts || [];
    shifts.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const next = nextOffset(result, offset, batch.length);
    if (next <= offset) throw new Error("Connecteam shifts pagination did not advance.");
    offset = next - PAGE_SIZE;
  }
  return shifts;
}

function localDate(epoch: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(epoch * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localTime(epoch: number, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(epoch * 1000));
}

function monthWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startTime: Math.floor(start.getTime() / 1000),
    endTime: Math.floor(end.getTime() / 1000),
  };
}

export async function POST() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const [users, schedulerResult] = await Promise.all([
      getAllUsers(),
      connecteamGet<ApiEnvelope<{ schedulers?: ConnecteamScheduler[] }>>("/scheduler/v1/schedulers"),
    ]);
    const schedulers = (schedulerResult.data?.schedulers || []).filter((item) => !item.isArchived);
    if (!schedulers.length) throw new Error("No active Connecteam schedules were found.");

    const window = monthWindow();
    const scheduleResults = await Promise.all(schedulers.map(async (scheduler) => {
      const timezone = scheduler.timezone || "Europe/Prague";
      const shifts = await getAllShifts(scheduler.schedulerId, window.startTime, window.endTime);
      return { scheduler, timezone, shifts };
    }));

    const staffRows = users.map((person) => {
      const id = person.userId ?? person.id;
      if (id === undefined || id === null) return null;
      return {
        connecteam_user_id: String(id),
        first_name: person.firstName || "",
        last_name: person.lastName || "",
        is_archived: Boolean(person.isArchived) || person.userStatus === "archived",
        synced_at: new Date().toISOString(),
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));

    const shiftRows = scheduleResults.flatMap(({ scheduler, timezone, shifts }) =>
      shifts.filter((shift) => shift.id !== undefined && shift.startTime && shift.endTime && shift.endTime > shift.startTime)
        .map((shift) => {
          const ids = shift.assignedUserIds?.length
            ? shift.assignedUserIds
            : shift.assignedUserId !== undefined ? [shift.assignedUserId] : [];
          return {
            connecteam_shift_id: `${scheduler.schedulerId}:${shift.id}`,
            work_date: localDate(shift.startTime, timezone),
            location: shift.locationData?.gps?.address || shift.title || scheduler.name || "Connecteam",
            start_time: localTime(shift.startTime, timezone),
            end_time: localTime(shift.endTime, timezone),
            start_epoch: shift.startTime,
            end_epoch: shift.endTime,
            user_ids: ids.map(String),
            synced_at: new Date().toISOString(),
          };
        }),
    ).filter((shift) => shift.work_date >= window.startDate && shift.work_date < window.endDate);

    const db = createAdminClient();
    if (staffRows.length) {
      const result = await db.from("connecteam_staff_users").upsert(staffRows, { onConflict: "connecteam_user_id" });
      if (result.error) throw result.error;
    }

    // Upsert the fresh snapshot first. Only after every batch succeeds do we remove
    // rows that disappeared from Connecteam, so a failed import cannot wipe good data.
    for (let offset = 0; offset < shiftRows.length; offset += 500) {
      const batch = shiftRows.slice(offset, offset + 500);
      const inserted = await db.from("connecteam_staff_shifts").upsert(batch, { onConflict: "connecteam_shift_id" });
      if (inserted.error) throw inserted.error;
    }

    const existing = await db.from("connecteam_staff_shifts")
      .select("connecteam_shift_id")
      .gte("work_date", window.startDate)
      .lt("work_date", window.endDate);
    if (existing.error) throw existing.error;
    const freshIds = new Set(shiftRows.map((shift) => shift.connecteam_shift_id));
    const staleIds = (existing.data || [])
      .map((row) => row.connecteam_shift_id)
      .filter((id) => !freshIds.has(id));
    for (let offset = 0; offset < staleIds.length; offset += 100) {
      const batch = staleIds.slice(offset, offset + 100);
      const removed = await db.from("connecteam_staff_shifts")
        .delete().in("connecteam_shift_id", batch);
      if (removed.error) throw removed.error;
    }

    return NextResponse.json({
      ok: true,
      employeesSynced: staffRows.length,
      shiftsSynced: shiftRows.length,
      schedulesSynced: schedulers.length,
      range: { from: window.startDate, to: window.endDate },
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Connecteam admin sync failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to sync Connecteam data.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
