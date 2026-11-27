"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, RefreshCw, Search, Users, Wallet, X } from "lucide-react";

type Shift = { id: string; date: string; location: string; start: string; end: string; hours: number; earnings: number };
type Employee = {
  id: string; name: string; archived: boolean; syncedAt: string; hourlyRate: number;
  current: { shifts: number; hours: number; earnings: number };
  previous: { shifts: number; hours: number; earnings: number };
  currentShifts: Shift[]; previousShifts: Shift[];
};
type Overview = {
  month: string; previousMonth: string; employees: Employee[];
  summary: { employees: number; shifts: number; hours: number; payroll: number; previousPayroll: number };
  source: string; generatedAt: string;
};

const money = (value: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const monthLabel = (value: string) => new Date(value + "-01T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function AdminPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rateDraft, setRateDraft] = useState("");
  const [savingRate, setSavingRate] = useState(false);\n  const [syncing, setSyncing] = useState(false);\n  const [syncMessage, setSyncMessage] = useState("");

  const load = useCallback(async () => {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/overview?month=" + encodeURIComponent(month), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || (response.status === 403 ? "This account is not allowed to access the admin panel." : "Unable to load employees."));
      setData(body);
      setSelectedId((current) => body.employees.some((item: Employee) => item.id === current) ? current : "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load admin data.");
      setData(null);
    } finally { setPending(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const employees = useMemo(() => (data?.employees || []).filter((person) => person.name.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const selected = data?.employees.find((person) => person.id === selectedId) || null;

  useEffect(() => { setRateDraft(selected ? String(selected.hourlyRate) : ""); }, [selectedId, selected?.hourlyRate]);

  async function saveRate() {
    if (!selected) return;
    setSavingRate(true); setError("");
    try {
      const response = await fetch("/api/admin/overview", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selected.id, hourlyRate: Number(rateDraft) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save hourly rate.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save hourly rate."); }
    finally { setSavingRate(false); }
  }

  async function syncConnecteam() {
    setSyncing(true); setError(""); setSyncMessage("");
    try {
      const response = await fetch("/api/connecteam/staff-sync", {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connecteam sync failed.");
      setSyncMessage(`Synced ${body.users} employees and ${body.shifts} shifts.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connecteam sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const changeMonth = (delta: number) => {
    const date = new Date(month + "-01T12:00:00");
    date.setMonth(date.getMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/" className="admin-back"><ArrowLeft size={17}/> WorkLog</Link>
        <div className="admin-heading"><span className="admin-eyebrow">WORKLOG MANAGEMENT</span><h1>Admin dashboard</h1><p>Employee shifts and estimated payroll from ConnectTeam</p></div>
        <div className="admin-header-actions"><button className="admin-refresh" onClick={() => void load()} disabled={pending || syncing}><RefreshCw size={16} className={pending ? "admin-spin" : ""}/> Refresh</button><button className="admin-refresh" onClick={() => void syncConnecteam()} disabled={syncing || pending}><RefreshCw size={16} className={syncing ? "admin-spin" : ""}/> {syncing ? "Syncing…" : "Sync Connecteam"}</button></div>
      </header>

      <section className="admin-toolbar">
        <div className="admin-month"><button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><strong>{monthLabel(month)}</strong><button onClick={() => changeMonth(1)} aria-label="Next month">›</button></div>
        <label className="admin-month-input"><CalendarDays size={15}/><input type="month" value={month} onChange={(event) => setMonth(event.target.value)}/></label>
      </section>

      {syncMessage && <div className="admin-sync-success" role="status">{syncMessage}</div>}\n      {error && <div className="admin-error" role="alert"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}

      {data && <>
        <section className="admin-metrics">
          <article className="admin-metric"><span><Users size={17}/></span><small>Active employees</small><strong>{data.summary.employees}</strong></article>
          <article className="admin-metric"><span><Clock3 size={17}/></span><small>Scheduled hours</small><strong>{number(data.summary.hours)} h</strong></article>
          <article className="admin-metric"><span><CalendarDays size={17}/></span><small>Shifts this month</small><strong>{data.summary.shifts}</strong></article>
          <article className="admin-metric admin-metric-primary"><span><Wallet size={17}/></span><small>Estimated payroll</small><strong>{money(data.summary.payroll)}</strong><em>Previous month: {money(data.summary.previousPayroll)}</em></article>
        </section>

        <div className="admin-content">
          <section className="admin-employee-panel">
            <div className="admin-panel-heading"><div><h2>Employees</h2><p>{employees.length} team members</p></div><label className="admin-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee"/></label></div>
            {employees.length ? <div className="admin-employee-list">{employees.map((person) => <button key={person.id} className={"admin-employee-card " + (selectedId === person.id ? "is-selected" : "")} onClick={() => setSelectedId(person.id)}>
              <span className="admin-avatar">{person.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase()}</span>
              <span className="admin-employee-main"><b>{person.name}</b><small>{person.current.shifts} shifts · {number(person.current.hours)} h</small></span>
              <span className="admin-employee-money"><b>{money(person.current.earnings)}</b><small>{money(person.hourlyRate)}/h</small></span>
            </button>)}</div> : <div className="admin-empty"><Users size={25}/><b>No employees found</b><span>Check the search or sync employee data from ConnectTeam.</span></div>}
          </section>

          <section className="admin-detail-panel">
            {selected ? <>
              <div className="admin-detail-head"><div><span className="admin-eyebrow">EMPLOYEE PROFILE</span><h2>{selected.name}</h2><p>ConnectTeam ID · {selected.id}</p></div><button className="admin-clear" onClick={() => setSelectedId("")} aria-label="Close employee"><X size={17}/></button></div>
              <div className="admin-detail-stats"><div><small>This month</small><b>{money(selected.current.earnings)}</b><span>{number(selected.current.hours)} hours · {selected.current.shifts} shifts</span></div><div><small>{monthLabel(data.previousMonth)}</small><b>{money(selected.previous.earnings)}</b><span>{number(selected.previous.hours)} hours · {selected.previous.shifts} shifts</span></div></div>
              <div className="admin-rate-box"><label>Hourly rate (CZK)<input type="number" min="0" max="100000" step="1" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)}/></label><button onClick={() => void saveRate()} disabled={savingRate || !rateDraft || Number(rateDraft) < 0}>{savingRate ? "Saving…" : "Save rate"}</button><small>Rate changes apply to displayed estimates for the selected periods.</small></div>
              <div className="admin-shifts-heading"><div><h3>Shift history</h3><p>{monthLabel(month)}</p></div><span>{selected.currentShifts.length} shifts</span></div>
              {selected.currentShifts.length ? <div className="admin-shift-table"><div className="admin-shift-row admin-shift-labels"><span>Date</span><span>Location & time</span><span>Hours</span><span>Estimated pay</span></div>{selected.currentShifts.map((shift) => <div className="admin-shift-row" key={shift.id}><b>{new Date(shift.date+"T12:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</b><span><b>{shift.location}</b><small>{shift.start} – {shift.end}</small></span><strong>{number(shift.hours)} h</strong><strong>{money(shift.earnings)}</strong></div>)}</div> : <div className="admin-empty admin-empty-small">No shifts recorded for this month.</div>}
              <div className="admin-previous-link"><b>Previous month overview</b><span>{selected.previous.shifts} shifts · {number(selected.previous.hours)} h · {money(selected.previous.earnings)}</span></div>
            </> : <div className="admin-detail-placeholder"><Users size={32}/><b>Select an employee</b><span>Choose a team member to inspect shifts, payroll estimates and monthly history.</span></div>}
          </section>
        </div>
        <footer className="admin-footnote"><span>Data source: {data.source}. Payroll is an estimate based on scheduled shift duration and the hourly rate configured here, not confirmed timesheets.</span><span>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span></footer>
      </>}
    </main>
  );
}
