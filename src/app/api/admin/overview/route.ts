import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/telegram-server";

export const runtime = "nodejs";
const ADMIN_EMAIL = "admin@gmail.com";

async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((user.email || "").trim().toLowerCase() !== ADMIN_EMAIL) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month.");
  const [year, index] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, index - 1, 1));
  const end = new Date(Date.UTC(year, index, 1));
  const previousStart = new Date(Date.UTC(year, index - 2, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    previousStart: previousStart.toISOString().slice(0, 10),
    previousMonth: new Date(Date.UTC(year, index - 2, 1)).toISOString().slice(0, 7),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const month = new URL(request.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const bounds = monthBounds(month);
    const db = createAdminClient();
    const [staffResult, shiftsResult, ratesResult] = await Promise.all([
      db.from("connecteam_staff_users").select("connecteam_user_id,first_name,last_name,is_archived,synced_at").order("first_name"),
      db.from("connecteam_staff_shifts").select("connecteam_shift_id,work_date,location,start_time,end_time,start_epoch,end_epoch,user_ids").gte("work_date", bounds.previousStart).lt("work_date", bounds.end).order("start_epoch"),
      db.from("connecteam_staff_pay_rates").select("connecteam_user_id,hourly_rate,updated_at"),
    ]);
    if (staffResult.error) throw staffResult.error;
    if (shiftsResult.error) throw shiftsResult.error;
    if (ratesResult.error) throw ratesResult.error;

    const rates = new Map((ratesResult.data || []).map((item) => [item.connecteam_user_id, Number(item.hourly_rate)]));
    const employees = (staffResult.data || []).map((person) => {
      const assigned = (shiftsResult.data || []).filter((shift) => (shift.user_ids || []).includes(person.connecteam_user_id));
      const decorate = (shift: typeof assigned[number]) => {
        const hours = Math.max(0, (Number(shift.end_epoch) - Number(shift.start_epoch)) / 3600);
        return {
          id: shift.connecteam_shift_id,
          date: shift.work_date,
          location: shift.location,
          start: shift.start_time,
          end: shift.end_time,
          hours: Math.round(hours * 100) / 100,
          earnings: Math.round(hours * (rates.get(person.connecteam_user_id) || 0) * 100) / 100,
        };
      };
      const currentShifts = assigned.filter((shift) => shift.work_date >= bounds.start && shift.work_date < bounds.end).map(decorate);
      const previousShifts = assigned.filter((shift) => shift.work_date >= bounds.previousStart && shift.work_date < bounds.start).map(decorate);
      const sum = (items: ReturnType<typeof decorate>[]) => ({
        shifts: items.length,
        hours: Math.round(items.reduce((total, item) => total + item.hours, 0) * 100) / 100,
        earnings: Math.round(items.reduce((total, item) => total + item.earnings, 0) * 100) / 100,
      });
      return {
        id: person.connecteam_user_id,
        name: [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "Unnamed employee",
        archived: person.is_archived,
        syncedAt: person.synced_at,
        hourlyRate: rates.get(person.connecteam_user_id) || 0,
        current: sum(currentShifts),
        previous: sum(previousShifts),
        currentShifts,
        previousShifts,
      };
    }).filter((person) => !person.archived || person.current.shifts > 0 || person.previous.shifts > 0);
    const active = employees.filter((person) => !person.archived);
    return NextResponse.json({
      month,
      previousMonth: bounds.previousMonth,
      employees,
      summary: {
        employees: active.length,
        shifts: active.reduce((n, person) => n + person.current.shifts, 0),
        hours: Math.round(active.reduce((n, person) => n + person.current.hours, 0) * 100) / 100,
        payroll: Math.round(active.reduce((n, person) => n + person.current.earnings, 0) * 100) / 100,
        previousPayroll: Math.round(active.reduce((n, person) => n + person.previous.earnings, 0) * 100) / 100,
      },
      source: "ConnectTeam scheduled shifts",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin overview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load admin overview." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
    const hourlyRate = Number(body.hourlyRate);
    if (!employeeId || !Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 100000) {
      return NextResponse.json({ error: "Enter a valid employee and hourly rate." }, { status: 400 });
    }
    const db = createAdminClient();
    const result = await db.from("connecteam_staff_pay_rates").upsert({
      connecteam_user_id: employeeId,
      hourly_rate: hourlyRate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "connecteam_user_id" });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin rate update failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save rate." }, { status: 500 });
  }
}
