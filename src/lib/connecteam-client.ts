import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/worklog";

export async function isConnecteamConnected() {
  const response = await fetch("/api/connecteam/sync", { credentials: "same-origin" });
  if (!response.ok) return false;
  const data = await response.json();
  if (data.code === "SETUP_REQUIRED") return false;
  return Boolean(data.connected);
}

export async function syncConnecteamCalendar(calendarUrl?: string) {
  const response = await fetch("/api/connecteam/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(calendarUrl ? { calendarUrl } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.code === "SETUP_REQUIRED"
        ? "CONNECTEAM_SETUP_REQUIRED"
        : data.error || "Unable to sync Connecteam.",
    );
  }
  return data as { imported: number };
}

/** Sync calendar when Connecteam is linked; no-op if disconnected or setup missing. */
export async function syncConnecteamIfConnected() {
  try {
    const connected = await isConnecteamConnected();
    if (!connected) return { synced: false as const };
    const result = await syncConnecteamCalendar();
    return { synced: true as const, imported: result.imported };
  } catch {
    return { synced: false as const };
  }
}

export async function loadUserShifts(userId: string) {
  if (!supabase) return [] as Shift[];
  const { data: rows } = await supabase
    .from("shifts")
    // Keep the dashboard payload intentional; this query runs on every initial
    // load and does not need database timestamps or unrelated future columns.
    .select("id,work_date,store,shift_name,shift_type,hours,hourly_rate,notes,source,external_id")
    .eq("user_id", userId)
    .order("work_date", { ascending: false });
  return (rows as Shift[]) || [];
}

export async function dismissConnecteamShift(userId: string, externalId: string) {
  if (!supabase) return;
  await supabase.from("connecteam_dismissed_shifts").upsert(
    { user_id: userId, external_id: externalId },
    { onConflict: "user_id,external_id" },
  );
}
