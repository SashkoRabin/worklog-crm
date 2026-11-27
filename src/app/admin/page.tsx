"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, Users, CalendarClock, Wallet, Settings, RefreshCw, Search, ChevronLeft, ChevronRight, LogOut, Menu, X, Clock3, UserRound, ArrowUpRight, Sun, Moon } from "lucide-react";

type Shift = { id: string; date: string; location: string; start: string; end: string; hours: number; earnings: number | null };
type Employee = {
  id: string; name: string; archived: boolean; syncedAt: string; hourlyRate: number | null;
  current: { shifts: number; hours: number; earnings: number };
  previous: { shifts: number; hours: number; earnings: number };
  currentShifts: Shift[]; previousShifts: Shift[];
};
type Overview = {
  month: string; previousMonth: string; employees: Employee[];
  summary: { employees: number; shifts: number; hours: number; payroll: number | null; previousPayroll: number | null };
  source: string; generatedAt: string;
};
type Section = "overview" | "employees" | "shifts" | "payroll" | "settings";

const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
const monthLabel = (value: string) => new Date(value + "-01T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Team", icon: Users },
  { id: "shifts", label: "Shifts", icon: CalendarClock },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "settings", label: "Workspace settings", icon: Settings },
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
  const [chartMetric, setChartMetric] = useState<"hours" | "payroll">("hours");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const load = useCallback(async () => {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/overview?month=" + encodeURIComponent(month), { cache: "no-store", credentials: "same-origin" });
      const raw = await response.text();
      let body: Overview & { error?: string; code?: string };
      try { body = raw ? JSON.parse(raw) as Overview & { error?: string; code?: string } : {} as Overview & { error?: string; code?: string }; }
      catch { throw new Error(response.redirected ? "Your session has expired. Sign in again and reopen the admin panel." : `Admin server returned an invalid response (HTTP ${response.status}).`); }
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your session has expired. Sign in again and reopen the admin panel.");
        if (response.status === 403) throw new Error("This account does not have administrator access. Sign in with admin@gmail.com.");
        throw new Error(body.error || `Unable to load admin data (HTTP ${response.status}).`);
      }
      setData(body);
      const rankedEmployees = [...body.employees].sort((a, b) =>
        b.current.hours - a.current.hours ||
        b.current.shifts - a.current.shifts ||
        a.name.localeCompare(b.name)
      );
      setSelectedId((current) => body.employees.some((item: Employee) => item.id === current)
        ? current
        : rankedEmployees[0]?.id || ""
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load admin data.");
      setData(null);
    } finally { setPending(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const saved = window.localStorage.getItem("worklog-admin-theme"); const initial = saved === "dark" ? "dark" : "light"; setTheme(initial); document.documentElement.dataset.theme = initial; }, []);
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem("worklog-admin-theme", next); }
  const employees = useMemo(() => (data?.employees || [])
    .filter((person) => person.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      b.current.hours - a.current.hours ||
      b.current.shifts - a.current.shifts ||
      a.name.localeCompare(b.name)
    ), [data, query]);
  const selected = data?.employees.find((person) => person.id === selectedId) || null;
  const allShifts = useMemo(() => (data?.employees || []).flatMap(person => person.currentShifts.map(shift => ({ ...shift, employee: person.name, employeeId: person.id }))).sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)), [data]);
  const activeEmployees = useMemo(() => (data?.employees || []).filter(person => !person.archived), [data]);
  useEffect(() => { setRateDraft(selected?.hourlyRate == null ? "" : String(selected.hourlyRate)); }, [selectedId, selected?.hourlyRate]);

  async function sync() {
    setSyncing(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/connecteam/staff-sync?month=" + encodeURIComponent(month), { method: "POST", credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connecteam sync failed.");
      setNotice(`Synchronization complete: ${body.users} employees, ${body.shifts} shifts.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connecteam sync failed."); }
    finally { setSyncing(false); }
  }

  async function saveRate() {
    if (!selected) return;
    if (!rateDraft.trim()) { setError("Enter an hourly rate before saving."); return; }
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
        <div className="admin-brand"><Image className="admin-brand-logo" src="/yk-logo.png" alt="Yorkush" width={36} height={36} priority/><span><b>WorkLog</b><small>ADMINISTRATION</small></span><button className="admin-mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav">{sections.map(item => { const Icon=item.icon; return <button key={item.id} className={section===item.id?"active":""} onClick={()=>openSection(item.id)}><Icon size={17}/><span>{item.label}</span>{section===item.id&&<i/>}</button>; })}</nav>
        <div className="admin-sidebar-bottom"><div className="admin-user-chip"><span className="admin-user-avatar">A</span><span><b>Administrator</b><small>admin@gmail.com</small></span></div><button className="admin-exit" onClick={async()=>{await supabase?.auth.signOut();router.replace("/");}}><LogOut size={16}/> Sign out</button></div>
      </aside>
      {mobileNav && <button className="admin-mobile-overlay" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
      <main className="admin-main">
        <header className="admin-topbar"><button className="admin-menu-button" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div><span className="admin-breadcrumb">WORKLOG / ADMIN</span><h1>{sections.find(item=>item.id===section)?.label}</h1></div><div className="admin-top-actions"><span className="admin-live-dot">Data overview</span><button onClick={toggleTheme} className="admin-icon-button admin-theme-toggle" title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>{theme === "light" ? <Moon size={16}/> : <Sun size={16}/>}</button><button onClick={()=>void load()} disabled={pending||syncing} className="admin-icon-button" title="Refresh"><RefreshCw size={16} className={pending?"admin-spin":""}/></button><button onClick={()=>void sync()} disabled={pending||syncing} className="admin-sync-button"><RefreshCw size={15} className={syncing?"admin-spin":""}/>{syncing?"Syncing…":"Sync Connecteam"}</button></div></header>
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
            <TrendChart shifts={allShifts} month={month} metric={chartMetric} onMetricChange={setChartMetric} />
            <AnalyticsGrid shifts={allShifts} employees={activeEmployees} />
            <div className="admin-overview-grid"><section className="admin-card"><div className="admin-card-title"><div><h2>Team overview</h2><p>Employees ranked by scheduled hours</p></div><button onClick={()=>openSection("employees")}>View all <ArrowUpRight size={14}/></button></div><div className="admin-ranking">{[...activeEmployees].sort((a,b)=>b.current.hours-a.current.hours).slice(0,7).map((person,index)=><button key={person.id} onClick={()=>{setSelectedId(person.id);setSection("employees");}}><span className="admin-rank">{String(index+1).padStart(2,"0")}</span><span className="admin-rank-name"><b>{person.name}</b><small>{person.current.shifts} shifts</small></span><span className="admin-rank-hours"><b>{number(person.current.hours)} h</b><small>{money(person.current.earnings)}</small></span><span className="admin-progress"><i style={{width:`${Math.min(100,data.summary.hours?person.current.hours/data.summary.hours*100:0)}%`}}/></span></button>)}</div></section>
              <section className="admin-card admin-insight-card"><div className="admin-card-title"><div><h2>Payroll snapshot</h2><p>Estimated wages by current rates</p></div><Wallet size={18}/></div><strong>{money(data.summary.payroll)}</strong><span>Current period estimate</span><div className="admin-insight-divider"/><div><small>Previous period</small><b>{money(data.summary.previousPayroll)}</b></div><button onClick={()=>openSection("payroll")}>Open payroll <ArrowUpRight size={14}/></button></section></div>
            <section className="admin-card"><div className="admin-card-title"><div><h2>Recent shifts</h2><p>Latest scheduled shifts in selected month</p></div><button onClick={()=>openSection("shifts")}>All shifts <ArrowUpRight size={14}/></button></div><ShiftTable shifts={allShifts.slice(-8).reverse()}/></section>
          </>}
          {data&&section==="employees"&&<section className="admin-card"><div className="admin-card-title"><div><h2>Employee directory</h2><p>{employees.length} records · choose a team member to view shifts and change their hourly rate</p></div><label className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a team member"/></label></div><div className="admin-employee-layout"><div className="admin-directory">{employees.map((person,index)=><button key={person.id} className={selectedId===person.id?"selected":""} onClick={()=>setSelectedId(person.id)}><span className="admin-directory-rank">{String(index+1).padStart(2,"0")}</span><span className="admin-avatar">{person.name.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase()}</span><span className="admin-directory-person"><b>{person.name}</b><small>{person.archived?"Archived":"Active"} · {person.current.shifts} shifts</small><i><span style={{width:(Math.min(100,employees[0]?.current.hours ? person.current.hours/employees[0].current.hours*100 : 0))+"%"}}/></i></span><strong>{number(person.current.hours)} <small>h</small></strong></button>)}</div><div className="admin-employee-detail">{selected?<><div className="admin-profile-heading"><span className="admin-avatar large">{selected.name.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase()}</span><div><h3>{selected.name}</h3><small>Connecteam ID · {selected.id}</small></div></div><div className="admin-profile-metrics"><div><small>Hours</small><b>{number(selected.current.hours)} h</b></div><div><small>Estimated pay</small><b>{money(selected.current.earnings)}</b></div><div><small>Shifts</small><b>{selected.current.shifts}</b></div></div><label className="admin-rate-input">Hourly pay per hour (CZK)<input type="number" min="0" max="100000" value={rateDraft} onChange={e=>setRateDraft(e.target.value)}/></label><button className="admin-primary-action" onClick={()=>void saveRate()} disabled={savingRate}>{savingRate?"Saving…":"Save pay rate"}</button><h4>Shift history</h4><ShiftTable shifts={selected.currentShifts.map(s=>({...s,employee:selected.name}))}/></>:<div className="admin-select-empty"><UserRound size={28}/><b>Select an employee</b><span>Employee profile, pay rate and shift history will appear here.</span></div>}</div></div></section>}
          {data&&section==="shifts"&&<section className="admin-card"><div className="admin-card-title"><div><h2>Shift management</h2><p>{allShifts.length} shifts · {monthLabel(month)}</p></div><label className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employee"/></label></div><ShiftTable shifts={allShifts.filter(s=>s.employee.toLowerCase().includes(query.toLowerCase()))}/></section>}
          {data&&section==="payroll"&&<><section className="admin-payroll-hero"><div><small>ESTIMATED PAYROLL · {monthLabel(month)}</small><strong>{money(data.summary.payroll)}</strong><span>Based on scheduled shifts and effective hourly rates</span></div><div><small>PREVIOUS MONTH</small><b>{money(data.summary.previousPayroll)}</b></div></section><section className="admin-card"><div className="admin-card-title"><div><h2>Payroll by employee</h2><p>Calculated from scheduled shift hours, not confirmed timesheets</p></div></div><div className="admin-payroll-table"><div className="admin-payroll-row labels"><span>Employee</span><span>Shifts</span><span>Hours</span><span>Rate / h</span><span>Estimated pay</span></div>{activeEmployees.slice().sort((a,b)=>b.current.earnings-a.current.earnings).map(person=><button className="admin-payroll-row" key={person.id} onClick={()=>{setSection("employees");setSelectedId(person.id);}}><b>{person.name}</b><span>{person.current.shifts}</span><span>{number(person.current.hours)} h</span><span>{money(person.hourlyRate)}</span><strong>{money(person.current.earnings)}</strong></button>)}</div></section></>}
          {data&&section==="settings"&&<section className="admin-card admin-settings-card"><div className="admin-card-title"><div><h2>Workspace settings</h2><p>Data sources and administration</p></div></div><div className="admin-setting-row"><span className="admin-setting-icon"><RefreshCw size={18}/></span><div><b>Connecteam synchronization</b><p>Uses the same existing session and synchronization flow as the employee app and Telegram integration. No separate API key.</p><small>Last data refresh: {new Date(data.generatedAt).toLocaleString("en-GB")}</small></div><button className="admin-primary-action" onClick={()=>void sync()} disabled={syncing}>{syncing?"Syncing…":"Sync now"}</button></div><div className="admin-setting-row"><span className="admin-setting-icon"><Wallet size={18}/></span><div><b>Employee pay rates</b><p>Rates are configured per employee. Payroll is shown only when a rate is recorded for every shift in the selected period.</p></div><button className="admin-secondary-action" onClick={()=>openSection("employees")}>Manage employees</button></div><div className="admin-setting-row"><span className="admin-setting-icon"><CalendarClock size={18}/></span><div><b>How estimated pay is calculated</b><p>Payroll is an estimate based on scheduled shifts. It does not represent verified clock-in or clock-out attendance.</p></div></div></section>}
          {data&&<footer className="admin-footer"><span>Source: {data.source} · Schedule-based estimates only</span><span>Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB")}</span></footer>}
        </div>
      </main>
    </div>
  );
}


function TrendChart({ shifts, month, metric, onMetricChange }: {
  shifts: (Shift & { employee?: string })[];
  month: string;
  metric: "hours" | "payroll";
  onMetricChange: (value: "hours" | "payroll") => void;
}) {
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const totals = Array.from({ length: daysInMonth }, (_, index) => {
    const date = month + "-" + String(index + 1).padStart(2, "0");
    const dayShifts = shifts.filter((shift) => shift.date === date);
    return { day: index + 1, value: metric === "hours"
      ? dayShifts.reduce((sum, shift) => sum + shift.hours, 0)
      : dayShifts.reduce((sum, shift) => sum + (shift.earnings ?? 0), 0), count: dayShifts.length };
  });
  const max = Math.max(1, ...totals.map((item) => item.value));
  const points = totals.map((item, index) => ({
    x: 30 + (index / Math.max(1, totals.length - 1)) * 640,
    y: 160 - (item.value / max) * 126,
  }));
  const line = points.map((point) => point.x + "," + point.y).join(" ");
  const area = "30,160 " + line + " 670,160";
  const total = totals.reduce((sum, item) => sum + item.value, 0);
  const average = total / daysInMonth;
  const formatValue = (value: number) => metric === "hours" ? number(value) + " h" : money(value);
  return (
    <section className="admin-card admin-chart-card">
      <div className="admin-card-title admin-chart-heading">
        <div><h2>Workload trend</h2><p>Daily team activity · {monthLabel(month)}</p></div>
        <div className="admin-chart-switch">
          <button className={metric === "hours" ? "active" : ""} onClick={() => onMetricChange("hours")}>Hours</button>
          <button className={metric === "payroll" ? "active" : ""} onClick={() => onMetricChange("payroll")}>Payroll</button>
        </div>
      </div>
      <div className="admin-chart-summary">
        <div><small>{metric === "hours" ? "Total scheduled hours" : "Estimated payroll"}</small><strong>{formatValue(total)}</strong></div>
        <span>Daily average <b>{formatValue(average)}</b></span>
      </div>
      {shifts.length ? <div className="admin-chart-plot">
        <svg viewBox="0 0 700 190" role="img" aria-label={metric === "hours" ? "Daily scheduled hours chart" : "Daily estimated payroll chart"} preserveAspectRatio="none">
          {[34, 76, 118, 160].map((y) => <line key={y} x1="30" x2="670" y1={y} y2={y} className="admin-chart-gridline" />)}
          <polygon points={area} className="admin-chart-area" />
          <polyline points={line} className="admin-chart-line" />
          {points.map((point, index) => totals[index].value > 0 ? <circle key={index} cx={point.x} cy={point.y} r="3.5" className="admin-chart-point"><title>{totals[index].day + ": " + formatValue(totals[index].value) + " · " + totals[index].count + " shifts"}</title></circle> : null)}
          <text x="30" y="184" className="admin-chart-axis">1</text>
          <text x="240" y="184" className="admin-chart-axis">{Math.max(1, Math.round(daysInMonth / 3))}</text>
          <text x="455" y="184" className="admin-chart-axis">{Math.max(1, Math.round(daysInMonth * 2 / 3))}</text>
          <text x="670" y="184" textAnchor="end" className="admin-chart-axis">{daysInMonth}</text>
        </svg>
      </div> : <div className="admin-chart-empty">No shift data for this month yet.</div>}
      <div className="admin-chart-foot"><span><i/> {metric === "hours" ? "Scheduled hours" : "Estimated wages"}</span><span>Hover points for daily details</span></div>
    </section>
  );
}


function AnalyticsGrid({ shifts, employees }: {
  shifts: (Shift & { employee?: string; employeeId?: string })[];
  employees: Employee[];
}) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayHours = weekdays.map((label, index) => ({
    label,
    hours: shifts.filter((shift) => {
      const day = (new Date(shift.date + "T12:00:00").getDay() + 6) % 7;
      return day === index;
    }).reduce((sum, shift) => sum + shift.hours, 0),
  }));
  const maxWeekday = Math.max(1, ...weekdayHours.map((item) => item.hours));
  const topEmployees = [...employees].sort((a, b) => b.current.hours - a.current.hours).slice(0, 6);
  const maxEmployee = Math.max(1, ...topEmployees.map((item) => item.current.hours));
  const payrollRows = [...employees]
    .filter((person) => person.current.earnings > 0)
    .sort((a, b) => b.current.earnings - a.current.earnings);
  const payrollTotal = payrollRows.reduce((sum, person) => sum + person.current.earnings, 0);
  const palette = ["#8069e7", "#4e9de8", "#f0a34b", "#40b99a", "#e27c9a", "#8b9bad"];
  let accumulated = 0;
  const slices = payrollRows.slice(0, 5).map((person, index) => {
    const percent = payrollTotal ? person.current.earnings / payrollTotal * 100 : 0;
    const start = accumulated;
    accumulated += percent;
    return { name: person.name, value: person.current.earnings, percent, start, color: palette[index] };
  });
  const rest = Math.max(0, 100 - accumulated);
  if (rest > 0.01) slices.push({ name: "Others", value: Math.max(0, payrollTotal - slices.reduce((sum, item) => sum + item.value, 0)), percent: rest, start: accumulated, color: "#c5c9d4" });
  const polar = (percent: number) => percent * 3.6;
  const arc = (start: number, end: number) => {
    const point = (angle: number) => {
      const rad = (angle - 90) * Math.PI / 180;
      return [100 + 76 * Math.cos(rad), 100 + 76 * Math.sin(rad)];
    };
    const a = point(polar(start));
    const b = point(polar(end));
    const large = end - start > 50 ? 1 : 0;
    return "M " + a[0] + " " + a[1] + " A 76 76 0 " + large + " 1 " + b[0] + " " + b[1];
  };
  return (
    <div className="admin-analytics-grid">
      <section className="admin-card admin-analytics-card">
        <div className="admin-card-title"><div><h2>Activity by weekday</h2><p>Scheduled hours across the week</p></div><span className="admin-chart-tag">Hours</span></div>
        <div className="admin-weekday-chart">
          {weekdayHours.map((item) => <div className="admin-weekday-column" key={item.label}>
            <span className="admin-weekday-value">{number(item.hours)}</span>
            <div className="admin-weekday-track"><i style={{height: (item.hours / maxWeekday * 100) + "%"}} /></div>
            <small>{item.label}</small>
          </div>)}
        </div>
        <div className="admin-chart-caption"><span>Most active day</span><b>{[...weekdayHours].sort((a,b)=>b.hours-a.hours)[0]?.label || "—"}</b></div>
      </section>
      <section className="admin-card admin-analytics-card">
        <div className="admin-card-title"><div><h2>Top employees</h2><p>Team ranking by scheduled hours</p></div><span className="admin-chart-tag">Top 6</span></div>
        <div className="admin-employee-bars">
          {topEmployees.map((person,index)=><div className="admin-employee-bar-row" key={person.id}>
            <span className="admin-employee-bar-rank">{index+1}</span>
            <div className="admin-employee-bar-main"><div><b>{person.name}</b><small>{number(person.current.hours)} h</small></div><span><i style={{width:(person.current.hours/maxEmployee*100)+"%"}} /></span></div>
          </div>)}
          {!topEmployees.length&&<div className="admin-chart-empty">No employee activity yet.</div>}
        </div>
      </section>
      <section className="admin-card admin-analytics-card admin-payroll-distribution">
        <div className="admin-card-title"><div><h2>Payroll distribution</h2><p>Estimated wages by employee</p></div><span className="admin-chart-tag">CZK</span></div>
        {payrollTotal > 0 ? <>
          <div className="admin-donut-wrap">
            <svg viewBox="0 0 200 200" role="img" aria-label="Payroll distribution by employee">
              <circle cx="100" cy="100" r="76" fill="none" stroke="var(--admin-line)" strokeWidth="22"/>
              {slices.map((slice,index)=><path key={slice.name} d={arc(slice.start,slice.start+slice.percent)} fill="none" stroke={slice.color} strokeWidth="22" strokeLinecap="butt"><title>{slice.name}: {money(slice.value)} ({number(slice.percent)}%)</title></path>)}
              <text x="100" y="94" textAnchor="middle" className="admin-donut-total-label">TOTAL PAYROLL</text>
              <text x="100" y="116" textAnchor="middle" className="admin-donut-total">{money(payrollTotal)}</text>
            </svg>
            <div className="admin-donut-legend">{slices.map(slice=><div key={slice.name}><i style={{background:slice.color}}/><span>{slice.name}</span><b>{number(slice.percent)}%</b></div>)}</div>
          </div>
        </> : <div className="admin-chart-empty">Payroll data is not available for this period.</div>}
      </section>
    </div>
  );
}

function ShiftTable({ shifts }: { shifts: (Shift & { employee?: string })[] }) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => {
    const map = new Map<string, (Shift & { employee?: string })[]>();
    for (const shift of shifts) {
      const list = map.get(shift.date) || [];
      list.push(shift);
      map.set(shift.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);
  const allExpanded = groups.length > 0 && groups.every(([date]) => expandedDays.has(date));
  function toggleAll() {
    setExpandedDays(allExpanded ? new Set() : new Set(groups.map(([date]) => date)));
  }
  function toggleDay(date: string) {
    setExpandedDays(current => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }
  if (!shifts.length) return <div className="admin-table-empty">No shifts found for this period.</div>;
  return <div className="admin-table-wrap admin-grouped-shifts">
    <div className="admin-shift-group-toolbar">
      <span>{groups.length} days · {shifts.length} shifts</span>
      <button type="button" onClick={toggleAll}>{allExpanded ? "Collapse all days" : "Expand all days"}</button>
    </div>
    <table className="admin-data-table">
      <thead><tr><th>Date</th><th>Employee</th><th>Location</th><th>Time</th><th>Hours</th><th>Estimated pay</th></tr></thead>
      {groups.map(([date, dayShifts]) => {
        const expanded = expandedDays.has(date);
        const dayHours = dayShifts.reduce((sum, shift) => sum + shift.hours, 0);
        const dayPayroll = dayShifts.every(shift => shift.earnings !== null)
          ? dayShifts.reduce((sum, shift) => sum + (shift.earnings ?? 0), 0)
          : null;
        return <tbody key={date} className="admin-shift-day">
          <tr className="admin-shift-day-heading">
            <td colSpan={6}>
              <button type="button" className="admin-shift-day-toggle" onClick={() => toggleDay(date)} aria-expanded={expanded}>
                <span className={"admin-shift-chevron " + (expanded ? "is-expanded" : "")}>›</span>
                <b>{new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</b>
                <span className="admin-shift-day-count">{dayShifts.length} {dayShifts.length === 1 ? "shift" : "shifts"}</span>
                <span className="admin-shift-day-summary">{number(dayHours)} h</span>
                <strong>{money(dayPayroll)}</strong>
              </button>
            </td>
          </tr>
          {expanded && dayShifts.map((shift, index) => <tr key={shift.id + String(index)} className="admin-shift-detail-row">
            <td>{shift.date}</td><td>{shift.employee || "—"}</td><td>{shift.location}</td><td>{shift.start}–{shift.end}</td><td>{number(shift.hours)} h</td><td>{money(shift.earnings)}</td>
          </tr>)}
        </tbody>;
      })}
    </table>
  </div>;
}
