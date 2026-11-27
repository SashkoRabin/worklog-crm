"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, CalendarClock, Wallet, Settings, RefreshCw, Search, ChevronLeft, ChevronRight, LogOut, Menu, X, Clock3, UserRound, ArrowUpRight } from "lucide-react";

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
type Section = "overview" | "employees" | "shifts" | "payroll" | "settings";

const money = (value: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const monthLabel = (value: string) => new Date(value + "-01T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "shifts", label: "Shift management", icon: CalendarClock },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rateDraft, setRateDraft] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const load = useCallback(async () => {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/overview?month=" + encodeURIComponent(month), { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load admin data.");
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
  const allShifts = useMemo(() => (data?.employees || []).flatMap(person => person.currentShifts.map(shift => ({ ...shift, employee: person.name, employeeId: person.id }))).sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)), [data]);
  const activeEmployees = useMemo(() => (data?.employees || []).filter(person => !person.archived), [data]);
  useEffect(() => { setRateDraft(selected ? String(selected.hourlyRate) : ""); }, [selectedId, selected?.hourlyRate]);

  async function sync() {
    setSyncing(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/connecteam/staff-sync", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connecteam sync failed.");
      setNotice(`Synchronization complete: ${body.users} employees, ${body.shifts} shifts.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connecteam sync failed."); }
    finally { setSyncing(false); }
  }

  async function saveRate() {
    if (!selected) return;
    const value = Number(rateDraft);
    if (!Number.isFinite(value) || value < 0 || value > 100000) { setError("Enter a valid hourly rate."); return; }
    setSavingRate(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/overview", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selected.id, hourlyRate: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save hourly rate.");
      setNotice("Hourly rate saved."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save hourly rate."); }
    finally { setSavingRate(false); }
  }

  function changeMonth(delta: number) {
    const date = new Date(month + "-01T12:00:00"); date.setMonth(date.getMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  }

  function openSection(next: Section) { setSection(next); setMobileNav(false); setSelectedId(""); }

  return (
    <div className="admin-app">
      <aside className={"admin-sidebar " + (mobileNav ? "is-open" : "")}>
        <div className="admin-brand"><span className="admin-brand-mark">YK</span><span><b>WorkLog</b><small>ADMINISTRATION</small></span><button className="admin-mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav">{sections.map(item => { const Icon=item.icon; return <button key={item.id} className={section===item.id?"active":""} onClick={()=>openSection(item.id)}><Icon size={17}/><span>{item.label}</span>{section===item.id&&<i/>}</button>; })}</nav>
        <div className="admin-sidebar-bottom"><div className="admin-user-chip"><span className="admin-user-avatar">A</span><span><b>Administrator</b><small>admin@gmail.com</small></span></div><button className="admin-exit" onClick={()=>router.push("/")}><LogOut size={16}/> Back to employee app</button></div>
      </aside>
      {mobileNav && <button className="admin-mobile-overlay" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
      <main className="admin-main">
        <header className="admin-topbar"><button className="admin-menu-button" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div><span className="admin-breadcrumb">WORKLOG / ADMIN</span><h1>{sections.find(item=>item.id===section)?.label}</h1></div><div className="admin-top-actions"><span className="admin-live-dot">Data overview</span><button onClick={()=>void load()} disabled={pending||syncing} className="admin-icon-button" title="Refresh"><RefreshCw size={16} className={pending?"admin-spin":""}/></button><button onClick={()=>void sync()} disabled={pending||syncing} className="admin-sync-button"><RefreshCw size={15} className={syncing?"admin-spin":""}/>{syncing?"Syncing…":"Sync Connecteam"}</button></div></header>
        <div className="admin-page-content">
          <div className="admin-period"><div><b>{monthLabel(month)}</b><span>Reporting period</span></div><div className="admin-period-controls"><button onClick={()=>changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17}/></button><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button onClick={()=>changeMonth(1)} aria-label="Next month"><ChevronRight size={17}/></button></div></div>
          {notice&&<div className="admin-notice">{notice}</div>}{error&&<div className="admin-error" role="alert">{error}<button onClick={()=>void load()}>Retry</button></div>}
          {!data&&pending?<div className="admin-loading"><RefreshCw className="admin-spin"/>Loading workspace…</div>:null}
          {data&&section==="overview"&&<>
            <section className="admin-kpis">
              <article><span className="kpi-icon purple"><Users size={18}/></span><small>Active employees</small><strong>{data.summary.employees}</strong><em>Team members</em></article>
              <article><span className="kpi-icon blue"><Clock3 size={18}/></span><small>Scheduled hours</small><strong>{number(data.summary.hours)} h</strong><em>{data.summary.shifts} shifts in this period</em></article>
              <article><span className="kpi-icon amber"><CalendarClock size={18}/></span><small>Shifts this month</small><strong>{data.summary.shifts}</strong><em>Imported from Connecteam</em></article>
              <article className="admin-kpi-pay"><span className="kpi-icon green"><Wallet size={18}/></span><small>Estimated payroll</small><strong>{money(data.summary.payroll)}</strong><em>Previous month {money(data.summary.previousPayroll)}</em></article>
            </section>
            <div className="admin-overview-grid"><section className="admin-card"><div className="admin-card-title"><div><h2>Team overview</h2><p>Employees ranked by scheduled hours</p></div><button onClick={()=>openSection("employees")}>View all <ArrowUpRight size={14}/></button></div><div className="admin-ranking">{[...activeEmployees].sort((a,b)=>b.current.hours-a.current.hours).slice(0,7).map((person,index)=><button key={person.id} onClick={()=>{setSelectedId(person.id);setSection("employees");}}><span className="admin-rank">{String(index+1).padStart(2,"0")}</span><span className="admin-rank-name"><b>{person.name}</b><small>{person.current.shifts} shifts</small></span><span className="admin-rank-hours"><b>{number(person.current.hours)} h</b><small>{money(person.current.earnings)}</small></span><span className="admin-progress"><i style={{width:`${Math.min(100,data.summary.hours?person.current.hours/data.summary.hours*100:0)}%`}}/></span></button>)}</div></section>
              <section className="admin-card admin-insight-card"><div className="admin-card-title"><div><h2>Payroll snapshot</h2><p>Estimated wages by current rates</p></div><Wallet size={18}/></div><strong>{money(data.summary.payroll)}</strong><span>Current period estimate</span><div className="admin-insight-divider"/><div><small>Previous period</small><b>{money(data.summary.previousPayroll)}</b></div><button onClick={()=>openSection("payroll")}>Open payroll <ArrowUpRight size={14}/></button></section></div>
            <section className="admin-card"><div className="admin-card-title"><div><h2>Recent shifts</h2><p>Latest scheduled shifts in selected month</p></div><button onClick={()=>openSection("shifts")}>All shifts <ArrowUpRight size={14}/></button></div><ShiftTable shifts={allShifts.slice(-8).reverse()}/></section>
          </>}
          {data&&section==="employees"&&<section className="admin-card"><div className="admin-card-title"><div><h2>Employee directory</h2><p>{employees.length} records · select a person to view details and edit their hourly rate</p></div><label className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employees"/></label></div><div className="admin-employee-layout"><div className="admin-directory">{employees.map(person=><button key={person.id} className={selectedId===person.id?"selected":""} onClick={()=>setSelectedId(person.id)}><span className="admin-avatar">{person.name.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase()}</span><span><b>{person.name}</b><small>{person.archived?"Archived":"Active"} · {person.current.shifts} shifts</small></span><strong>{number(person.current.hours)} h</strong></button>)}</div><div className="admin-employee-detail">{selected?<><div className="admin-profile-heading"><span className="admin-avatar large">{selected.name.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase()}</span><div><h3>{selected.name}</h3><small>Connecteam ID · {selected.id}</small></div></div><div className="admin-profile-metrics"><div><small>Hours</small><b>{number(selected.current.hours)} h</b></div><div><small>Estimated pay</small><b>{money(selected.current.earnings)}</b></div><div><small>Shifts</small><b>{selected.current.shifts}</b></div></div><label className="admin-rate-input">Hourly rate (CZK)<input type="number" min="0" max="100000" value={rateDraft} onChange={e=>setRateDraft(e.target.value)}/></label><button className="admin-primary-action" onClick={()=>void saveRate()} disabled={savingRate}>{savingRate?"Saving…":"Save hourly rate"}</button><h4>Shift history</h4><ShiftTable shifts={selected.currentShifts.map(s=>({...s,employee:selected.name}))}/></>:<div className="admin-select-empty"><UserRound size={28}/><b>Select an employee</b><span>Employee profile, pay rate and shift history will appear here.</span></div>}</div></div></section>}
          {data&&section==="shifts"&&<section className="admin-card"><div className="admin-card-title"><div><h2>Shift management</h2><p>{allShifts.length} shifts · {monthLabel(month)}</p></div><label className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employee"/></label></div><ShiftTable shifts={allShifts.filter(s=>s.employee.toLowerCase().includes(query.toLowerCase()))}/></section>}
          {data&&section==="payroll"&&<><section className="admin-payroll-hero"><div><small>ESTIMATED PAYROLL · {monthLabel(month)}</small><strong>{money(data.summary.payroll)}</strong><span>Based on scheduled shifts and effective hourly rates</span></div><div><small>PREVIOUS MONTH</small><b>{money(data.summary.previousPayroll)}</b></div></section><section className="admin-card"><div className="admin-card-title"><div><h2>Payroll by employee</h2><p>Calculated from scheduled shift hours, not confirmed timesheets</p></div></div><div className="admin-payroll-table"><div className="admin-payroll-row labels"><span>Employee</span><span>Shifts</span><span>Hours</span><span>Rate / h</span><span>Estimated pay</span></div>{activeEmployees.slice().sort((a,b)=>b.current.earnings-a.current.earnings).map(person=><button className="admin-payroll-row" key={person.id} onClick={()=>{setSection("employees");setSelectedId(person.id);}}><b>{person.name}</b><span>{person.current.shifts}</span><span>{number(person.current.hours)} h</span><span>{money(person.hourlyRate)}</span><strong>{money(person.current.earnings)}</strong></button>)}</div></section></>}
          {data&&section==="settings"&&<section className="admin-card admin-settings-card"><div className="admin-card-title"><div><h2>Workspace settings</h2><p>Data sources and administration</p></div></div><div className="admin-setting-row"><span className="admin-setting-icon"><RefreshCw size={18}/></span><div><b>Connecteam synchronization</b><p>Uses the same existing session and synchronization flow as the employee app and Telegram integration. No separate API key.</p><small>Last data refresh: {new Date(data.generatedAt).toLocaleString("en-GB")}</small></div><button className="admin-primary-action" onClick={()=>void sync()} disabled={syncing}>{syncing?"Syncing…":"Sync now"}</button></div><div className="admin-setting-row"><span className="admin-setting-icon"><Wallet size={18}/></span><div><b>Hourly rates</b><p>Rates are configured per employee. Changes are effective-dated and used for payroll estimates.</p></div><button className="admin-secondary-action" onClick={()=>openSection("employees")}>Manage employees</button></div><div className="admin-setting-row"><span className="admin-setting-icon"><CalendarClock size={18}/></span><div><b>Payroll calculation</b><p>Payroll is an estimate based on scheduled shifts. It does not represent verified clock-in or clock-out attendance.</p></div></div></section>}
          {data&&<footer className="admin-footer"><span>Source: {data.source} · Schedule-based estimates only</span><span>Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB")}</span></footer>}
        </div>
      </main>
    </div>
  );
}

function ShiftTable({ shifts }: { shifts: (Shift & { employee?: string })[] }) {
  if (!shifts.length) return <div className="admin-table-empty">No shifts found for this period.</div>;
  return <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Date</th><th>Employee</th><th>Location</th><th>Time</th><th>Hours</th><th>Estimated pay</th></tr></thead><tbody>{shifts.map((shift,index)=><tr key={shift.id+String(index)}><td>{new Date(shift.date+"T12:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</td><td>{shift.employee||"—"}</td><td>{shift.location}</td><td>{shift.start}–{shift.end}</td><td>{number(shift.hours)} h</td><td>{money(shift.earnings)}</td></tr>)}</tbody></table></div>;
}
