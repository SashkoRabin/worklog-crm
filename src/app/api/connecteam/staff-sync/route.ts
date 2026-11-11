import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/telegram-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ApiEnvelope<T> = { data?: T; paging?: { offset?: number; total?: number } };
type ApiShift = { id: string | number; title?: string; startTime: number; endTime: number; timezone?: string; assignedUserIds?: Array<string | number>; locationData?: { gps?: { address?: string } } };
type ApiUser = { userId: string | number; firstName?: string; lastName?: string; isArchived?: boolean };

async function connecteam<T>(path: string): Promise<T> {
  const key = process.env.CONNECTEAM_API_KEY;
  if (!key) throw new Error("CONNECTEAM_API_KEY is not configured");
  const response = await fetch(`https://api.connecteam.com${path}`, { headers: { "X-API-KEY": key, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Connecteam API returned ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body as T;
}
function localDate(epoch: number, timezone = "Europe/Prague") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(epoch * 1000));
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}
function clock(epoch: number, timezone = "Europe/Prague") {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(epoch * 1000));
}
async function getAll<T>(path: (limit: number, offset: number) => string, key: string): Promise<T[]> {
  const all: T[] = []; let offset = 0; const limit = 500;
  for (let page = 0; page < 30; page++) {
    const response = await connecteam<ApiEnvelope<Record<string, T[]>>>(path(limit, offset));
    const rows = response.data?.[key] || [];
    all.push(...rows);
    if (rows.length < limit) break;
    const next = response.paging?.offset;
    offset = typeof next === "number" && next > offset ? next : offset + rows.length;
  }
  return all;
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const schedulerId = process.env.CONNECTEAM_SCHEDULER_ID;
    if (!schedulerId) throw new Error("CONNECTEAM_SCHEDULER_ID is not configured");
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - 45 * 86400, endTime = now + 90 * 86400;
    const [shifts, users] = await Promise.all([
      getAll<ApiShift>((limit, offset) => `/scheduler/v1/schedulers/${encodeURIComponent(schedulerId)}/shifts?startTime=${startTime}&endTime=${endTime}&limit=${limit}&offset=${offset}`, "shifts"),
      getAll<ApiUser>((limit, offset) => `/users/v1/users?limit=${limit}&offset=${offset}&userStatus=all`, "users"),
    ]);
    const db = createAdminClient();
    const userRows = users.filter(u => u.userId != null).map(u => ({ connecteam_user_id: String(u.userId), first_name: u.firstName || "", last_name: u.lastName || "", is_archived: Boolean(u.isArchived), synced_at: new Date().toISOString() }));
    for (let i = 0; i < userRows.length; i += 500) {
      const result = await db.from("connecteam_staff_users").upsert(userRows.slice(i, i + 500), { onConflict: "connecteam_user_id" });
      if (result.error) throw result.error;
    }
    const shiftRows = shifts.filter(s => s.id != null && s.startTime && s.endTime && s.endTime > s.startTime).map(s => {
      const timezone = s.timezone || "Europe/Prague";
      const address = s.locationData?.gps?.address || "";
      const location = (s.title || address).trim();
      return { connecteam_shift_id: String(s.id), work_date: localDate(s.startTime, "Europe/Prague"), location, start_time: clock(s.startTime, timezone), end_time: clock(s.endTime, timezone), start_epoch: s.startTime, end_epoch: s.endTime, user_ids: (s.assignedUserIds || []).map(String), synced_at: new Date().toISOString() };
    }).filter(s => s.location);
    const { error: deleteError } = await db.from("connecteam_staff_shifts").delete().gte("start_epoch", startTime).lte("start_epoch", endTime);
    if (deleteError) throw deleteError;
    for (let i = 0; i < shiftRows.length; i += 500) {
      const result = await db.from("connecteam_staff_shifts").upsert(shiftRows.slice(i, i + 500), { onConflict: "connecteam_shift_id" });
      if (result.error) throw result.error;
    }
    return NextResponse.json({ ok: true, shifts: shiftRows.length, users: userRows.length, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Connecteam staff sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
