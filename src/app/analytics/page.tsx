"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { format, isSameMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  Clock3, Globe2, MapPin, Moon, RefreshCw, Settings2, Sun,
  TrendingUp, WalletCards, BriefcaseBusiness, ChevronDown,
} from "lucide-react";
import { loadUserShifts, syncConnecteamIfConnected } from "@/lib/connecteam-client";
import { copy, isWorkedShift, Lang, locales, money, Shift } from "@/lib/worklog";
import { supabase } from "@/lib/supabase";
import { MobileNav } from "@/components/mobile-nav";
import { getStoreDisplayName } from "@/lib/stores";

type Period = 6 | 12;
type ChartMode = "actual" | "potential";
type Theme = "light" | "dark";

const messages = {
  en: {
    subtitle: "YOUR WORK, IN FOCUS", title: "Your work at a glance",
    description: "Understand your workload, earnings and where your time goes.",
    thisMonth: "This month", hours: "Hours worked", earnings: "Earned",
    shifts: "Shifts completed", average: "Avg. shift", vsLast: "vs previous month",
    trend: "Your progress", trendHint: "Actual and potential hours over time",
    actualLabel: "Actual", potentialLabel: "Potential", last6: "Last 6 months", last12: "Last 12 months",
    locations: "Where you work", locationsHint: "Hours by store this month",
    weekdays: "Your work rhythm", weekdaysHint: "Hours by day of the week",
    topLocation: "Top location", noData: "No data for this period yet",
    noShifts: "Your completed shifts will appear here once you have work history.",
    loading: "Building your analytics…", error: "We couldn't load your analytics",
    retry: "Try again", settings: "Settings", calendar: "Calendar", analytics: "Analytics",
    language: "Language", theme: "Theme", dark: "Dark mode", light: "Light mode",
    close: "Close", hoursShort: "h", month: "Month", total: "Total",
    compared: "compared with last month", steady: "No change from last month",
    bestDay: "Busiest day", avgWeek: "Avg. hours / week", incomePerHour: "Average hourly earnings",
    currentPeriod: "Current month", previousPeriod: "Previous month",
  },
  ru: {
    subtitle: "ТВОЯ РАБОТА В ЦИФРАХ", title: "Вся картина твоей работы",
    description: "Следи за нагрузкой, заработком и распределением рабочего времени.",
    thisMonth: "Этот месяц", hours: "Отработано часов", earnings: "Заработано",
    shifts: "Отработано смен", average: "Средняя смена", vsLast: "к прошлому месяцу",
    trend: "Твоя динамика", trendHint: "Фактические и потенциальные часы",
    actualLabel: "Фактически", potentialLabel: "Потенциально", last6: "Последние 6 месяцев", last12: "Последние 12 месяцев",
    locations: "Где ты работаешь", locationsHint: "Часы по магазинам за этот месяц",
    weekdays: "Твой рабочий ритм", weekdaysHint: "Часы по дням недели",
    topLocation: "Главная точка", noData: "За этот период пока нет данных",
    noShifts: "Здесь появятся отработанные смены, когда накопится история.",
    loading: "Собираем аналитику…", error: "Не удалось загрузить аналитику",
    retry: "Повторить", settings: "Настройки", calendar: "Календарь", analytics: "Аналитика",
    language: "Язык", theme: "Тема", dark: "Тёмная тема", light: "Светлая тема",
    close: "Закрыть", hoursShort: "ч", month: "Месяц", total: "Всего",
    compared: "по сравнению с прошлым месяцем", steady: "Без изменений к прошлому месяцу",
    bestDay: "Самый загруженный день", avgWeek: "В среднем часов в неделю", incomePerHour: "Средний заработок в час",
    currentPeriod: "Текущий месяц", previousPeriod: "Прошлый месяц",
  },
  cs: {
    subtitle: "VAŠE PRÁCE V ČÍSLECH", title: "Přehled vaší práce",
    description: "Sledujte pracovní vytížení, výdělky a rozložení pracovní doby.",
    thisMonth: "Tento měsíc", hours: "Odpracované hodiny", earnings: "Vyděláno",
    shifts: "Dokončené směny", average: "Průměrná směna", vsLast: "oproti minulému měsíci",
    trend: "Váš vývoj", trendHint: "Skutečné a potenciální hodiny v čase",
    actualLabel: "Skutečnost", potentialLabel: "Potenciál", last6: "Posledních 6 měsíců", last12: "Posledních 12 měsíců",
    locations: "Kde pracujete", locationsHint: "Hodiny podle prodejny tento měsíc",
    weekdays: "Váš pracovní rytmus", weekdaysHint: "Hodiny podle dne v týdnu",
    topLocation: "Hlavní prodejna", noData: "Pro toto období zatím nejsou žádná data",
    noShifts: "Zde se zobrazí odpracované směny, jakmile budete mít historii.",
    loading: "Připravujeme analytiku…", error: "Analytiku se nepodařilo načíst",
    retry: "Zkusit znovu", settings: "Nastavení", calendar: "Kalendář", analytics: "Analytika",
    language: "Jazyk", theme: "Vzhled", dark: "Tmavý režim", light: "Světlý režim",
    close: "Zavřít", hoursShort: "h", month: "Měsíc", total: "Celkem",
    compared: "ve srovnání s minulým měsícem", steady: "Beze změny oproti minulému měsíci",
    bestDay: "Nejvytíženější den", avgWeek: "Průměr hodin týdně", incomePerHour: "Průměrný hodinový výdělek",
    currentPeriod: "Tento měsíc", previousPeriod: "Minulý měsíc",
  },
} as const;

const readThemeCookie = (): Theme | null => {
  if (typeof document === "undefined") return null;
  return (document.cookie.match(/(?:^|; )worklog-theme=(light|dark)(?:;|$)/)?.[1] as Theme) || null;
};

function donutGradient(items: [string, number][], total: number, colors: string[]) {
  let cursor = 0;
  const stops = items.map(([, value], index) => {
    const start = cursor;
    cursor += value / Math.max(total, 1) * 360;
    return `${colors[index % colors.length]} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function Picker({ lang, setLang }: { lang: Lang; setLang: (value: Lang) => void }) {
  return <label className="language"><Globe2 size={15} /><select aria-label="Language" value={lang} onChange={(event) => setLang(event.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option><option value="cs">Čeština</option></select></label>;
}

function Metric({ icon, label, value, foot, trend }: { icon: React.ReactNode; label: string; value: string; foot: string; trend?: number | null }) {
  return <article className="an-metric"><div className="an-metric-top"><span className="an-icon">{icon}</span>{trend !== undefined && trend !== null && <span className={`an-change ${trend >= 0 ? "positive" : "negative"}`}>{trend >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {Math.abs(trend)}%</span>}</div><p>{label}</p><strong>{value}</strong><small>{foot}</small></article>;
}

function TrendChart({ data, mode }: { data: { label: string; actualHours: number; potentialHours: number }[]; mode: ChartMode }) {
  const values = data.map((item) => mode === "actual" ? item.actualHours : item.potentialHours);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({ x: 34 + index * (532 / Math.max(values.length - 1, 1)), y: 154 - (value / max) * 118 }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1]?.x ?? 566} 164 L ${points[0]?.x ?? 34} 164 Z`;
  return <div className="an-trend-chart">
    <div className="an-chart-scale"><span>{Math.round(max)} h</span><span>{Math.round(max / 2)} h</span><span>0</span></div>
    <svg viewBox="0 0 600 190" role="img" aria-label={mode === "actual" ? "Actual monthly hours" : "Potential monthly hours"} preserveAspectRatio="none">
      <defs><linearGradient id="an-area-hours" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8068f4" stopOpacity=".28"/><stop offset="100%" stopColor="#8068f4" stopOpacity="0"/></linearGradient></defs>
      {[36, 95, 154].map((y) => <line key={y} x1="30" x2="570" y1={y} y2={y} className="an-grid-line"/>)}
      <path d={area} fill="url(#an-area-hours)"/>
      <path d={line} fill="none" stroke="#8068f4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point, index) => <g key={data[index].label}><circle cx={point.x} cy={point.y} r="8" className="an-point-halo"/><circle cx={point.x} cy={point.y} r="4" fill="#8068f4"/></g>)}
    </svg>
    <div className="an-chart-labels" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
  </div>;
}
export default function Analytics() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>(() => readThemeCookie() || "light");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [period, setPeriod] = useState<Period>(6);
  const [chartMode, setChartMode] = useState<ChartMode>("actual");
  const t = copy[lang];
  const a = messages[lang];

  useEffect(() => {
    let active = true;
    const savedLang = localStorage.getItem("worklog-lang") as Lang | null;
    const savedTheme = (readThemeCookie() || localStorage.getItem("worklog-theme")) as Theme | null;
    if (savedLang && ["en", "ru", "cs"].includes(savedLang)) setLang(savedLang);
    if (savedTheme) setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme || "light";
    const load = async () => {
      setDataState("loading"); setDataError("");
      try {
        if (!supabase) throw new Error(t.loadError);
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const user = data.session?.user;
        if (!user) { if (active) { setShifts([]); setDataState("ready"); } return; }
        const rows = await loadUserShifts(user.id);
        if (!active) return;
        setShifts(rows); setDataState("ready");
        void syncConnecteamIfConnected()
          .then((result) => result.synced ? loadUserShifts(user.id) : null)
          .then((fresh) => { if (active && fresh) setShifts(fresh); })
          .catch((error) => console.error("Analytics background refresh failed", error));
      } catch (error) {
        console.error("Analytics data loading failed", error);
        if (active) { setDataError(error instanceof Error ? error.message : t.loadError); setDataState("error"); }
      }
    };
    void load();
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => { localStorage.setItem("worklog-lang", lang); }, [lang]);
  useEffect(() => {
    localStorage.setItem("worklog-theme", theme);
    document.cookie = `worklog-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const now = new Date();
  const actual = useMemo(() => shifts.filter(isWorkedShift), [shifts]);
  const currentActual = actual.filter((shift) => isSameMonth(parseISO(shift.work_date), now));
  const currentPotential = shifts.filter((shift) => isSameMonth(parseISO(shift.work_date), now));
  const previousMonth = subMonths(now, 1);
  const previous = actual.filter((shift) => isSameMonth(parseISO(shift.work_date), previousMonth));
  const currentHours = currentActual.reduce((sum, shift) => sum + shift.hours, 0);
  const previousHours = previous.reduce((sum, shift) => sum + shift.hours, 0);
  const currentIncome = currentActual.reduce((sum, shift) => sum + shift.hours * shift.hourly_rate, 0);
  const potentialHours = currentPotential.reduce((sum, shift) => sum + shift.hours, 0);
  const potentialIncome = currentPotential.reduce((sum, shift) => sum + shift.hours * shift.hourly_rate, 0);
  const previousIncome = previous.reduce((sum, shift) => sum + shift.hours * shift.hourly_rate, 0);
  const hoursDelta = previousHours ? Math.round(((currentHours - previousHours) / previousHours) * 100) : null;
  const incomeDelta = previousIncome ? Math.round(((currentIncome - previousIncome) / previousIncome) * 100) : null;

  const trend = Array.from({ length: period }, (_, index) => {
    const month = startOfMonth(subMonths(now, period - index - 1));
    const actualRows = actual.filter((shift) => isSameMonth(parseISO(shift.work_date), month));
    const potentialRows = shifts.filter((shift) => isSameMonth(parseISO(shift.work_date), month));
    return {
      label: format(month, "MMM", { locale: locales[lang] }),
      actualHours: actualRows.reduce((sum, shift) => sum + shift.hours, 0),
      potentialHours: potentialRows.reduce((sum, shift) => sum + shift.hours, 0),
    };
  });
  const byStore = Object.entries(currentActual.reduce<Record<string, number>>((result, shift) => {
    result[shift.store] = (result[shift.store] || 0) + shift.hours; return result;
  }, {})).sort((left, right) => right[1] - left[1]);
  const totalStoreHours = byStore.reduce((sum, item) => sum + item[1], 0);
  const colors = ["#8068f4", "#20b68a", "#f3a64a", "#4c9de8", "#e779a8", "#8993a5"];
  const weekdays = Array.from({ length: 7 }, (_, day) => {
    const rows = currentActual.filter((shift) => (parseISO(shift.work_date).getDay() + 6) % 7 === day);
    return { label: format(new Date(2024, 0, 1 + day), "EEE", { locale: locales[lang] }), hours: rows.reduce((sum, shift) => sum + shift.hours, 0) };
  });
  const maxWeekday = Math.max(...weekdays.map((day) => day.hours), 1);
  const bestDay = [...weekdays].sort((left, right) => right.hours - left.hours)[0];
  const avgShift = currentActual.length ? currentHours / currentActual.length : 0;
  const avgHourly = currentHours ? currentIncome / currentHours : 0;
  const weeklyAverage = currentHours / Math.max(now.getDate() / 7, 1);
  const hasData = shifts.length > 0;

  return (
    <main className={`app-shell ${theme === "dark" ? "theme-dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><Image className="brand-logo" src="/yk-logo.png" alt="YK" width={36} height={36} priority/><span className="brand-name">YK WorkLog</span></div>
        <nav><Link href="/"><CalendarDays/>{t.calendar}</Link><a className="active" aria-current="page"><BarChart3/>{t.analytics}</a></nav>
        <div className="sidebar-bottom"><Picker lang={lang} setLang={setLang}/><button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon/> : <Sun/>}{theme === "light" ? t.dark : t.light}</button><button><Settings2/>{t.settings}</button></div>
      </aside>

      <section className="content analytics-page analytics-v2">
        <header className="an-header">
          <div><p className="eyebrow">{a.subtitle}</p><h1>{a.title}</h1><p className="an-description">{a.description}</p></div>
          <div className="an-month"><span>{a.thisMonth}</span><strong>{format(now, "LLLL yyyy", { locale: locales[lang] })}</strong></div>
        </header>

        {dataState === "loading" ? <section className="card data-state-card" aria-live="polite"><span className="spinner"/><strong>{a.loading}</strong></section>
        : dataState === "error" ? <section className="card data-state-card data-state-error" role="alert"><strong>{a.error}</strong><p>{dataError}</p><button className="primary" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={16}/>{a.retry}</button></section>
        : <>
          <section className="an-metrics">
            <Metric icon={<Clock3/>} label={a.hours} value={`${currentHours.toLocaleString(lang)} ${a.hoursShort}`} foot={hoursDelta === null ? a.currentPeriod : `${hoursDelta >= 0 ? "+" : ""}${hoursDelta}% ${a.vsLast}`} trend={hoursDelta}/>
            <Metric icon={<WalletCards/>} label={a.earnings} value={money(currentIncome)} foot={incomeDelta === null ? a.currentPeriod : `${incomeDelta >= 0 ? "+" : ""}${incomeDelta}% ${a.vsLast}`} trend={incomeDelta}/>
            <Metric icon={<BriefcaseBusiness/>} label={a.shifts} value={String(currentActual.length)} foot={`${avgShift.toFixed(1)} ${a.hoursShort} · ${a.average.toLowerCase()}`}/>
            <Metric icon={<Activity/>} label={a.incomePerHour} value={money(avgHourly)} foot={a.thisMonth}/>
          </section>

          <section className="an-main-chart card">
            <div className="an-section-head">
              <div><div className="an-kicker"><TrendingUp size={14}/>{a.trend}</div><h2>{a.trendHint}</h2></div>
              <div className="an-chart-actions">
                <div className="an-segment"><button className={chartMode === "actual" ? "selected" : ""} onClick={() => setChartMode("actual")}>{a.actualLabel}</button><button className={chartMode === "potential" ? "selected" : ""} onClick={() => setChartMode("potential")}>{a.potentialLabel}</button></div>
                <label className="an-period"><select value={period} onChange={(event) => setPeriod(Number(event.target.value) as Period)}><option value={6}>{a.last6}</option><option value={12}>{a.last12}</option></select><ChevronDown size={14}/></label>
              </div>
            </div>
            {hasData ? <><div className="an-chart-summary"><strong>{(chartMode === "actual" ? currentHours : potentialHours).toLocaleString(lang)} {a.hoursShort}</strong><span>{a.currentPeriod}</span><b>{money(chartMode === "actual" ? currentIncome : potentialIncome)}</b></div><TrendChart data={trend} mode={chartMode}/></> : <div className="empty an-empty">{a.noShifts}</div>}
          </section>

          <div className="an-lower-grid">
            <section className="card an-panel">
              <div className="an-section-head"><div><div className="an-kicker"><MapPin size={14}/>{a.locations}</div><h2>{a.locationsHint}</h2></div><span className="an-count">{byStore.length}</span></div>
              {byStore.length ? <div className="an-store-content">
                <div className="an-donut-wrap"><div className="an-donut" style={{ background: donutGradient(byStore, totalStoreHours, colors) }}><div><strong>{Math.round(totalStoreHours)}</strong><span>{a.hoursShort}</span></div></div></div>
                <div className="an-legend">{byStore.map(([name, hours], index) => <div className="an-legend-row" key={name}><i style={{ background: colors[index % colors.length] }}/><span>{getStoreDisplayName(name, lang)}</span><b>{hours.toLocaleString(lang)} h</b><small>{Math.round(hours / Math.max(totalStoreHours, 1) * 100)}%</small></div>)}</div>
              </div> : <div className="empty">{a.noData}</div>}
              {byStore[0] && <div className="an-highlight"><span>{a.topLocation}</span><strong>{getStoreDisplayName(byStore[0][0], lang)}</strong></div>}
            </section>

            <section className="card an-panel">
              <div className="an-section-head"><div><div className="an-kicker"><CalendarDays size={14}/>{a.weekdays}</div><h2>{a.weekdaysHint}</h2></div></div>
              {current.length ? <div className="an-week-bars">{weekdays.map((day, index) => <div className="an-week-col" key={day.label}><strong>{day.hours ? day.hours.toLocaleString(lang) : "–"}</strong><div className="an-week-track"><i style={{ height: `${Math.max(day.hours / maxWeekday * 100, day.hours ? 5 : 0)}%`, background: colors[index % colors.length] }}/></div><span>{day.label}</span></div>)}</div> : <div className="empty">{a.noData}</div>}
              <div className="an-mini-stats"><div><span>{a.bestDay}</span><strong>{bestDay.hours ? bestDay.label : "—"}</strong></div><div><span>{a.avgWeek}</span><strong>{weeklyAverage.toFixed(1)} h</strong></div></div>
            </section>
          </div>
          <div className="an-footer-note"><span><Activity size={15}/>{a.currentPeriod}</span><span>{current.length} {a.shifts.toLowerCase()} · {a.previousPeriod}: {previousHours} h</span></div>
        </>}
      </section>

      <MobileNav active="analytics" calendar={t.calendar} analytics={t.analytics} settings={t.settings} onSettings={() => setMobileMenu(true)}/>
      {mobileMenu && <div className="overlay mobile-sheet-overlay" onMouseDown={() => setMobileMenu(false)}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={t.settings} onMouseDown={(event) => event.stopPropagation()}><span className="sheet-handle"/><div className="mobile-sheet-head"><h2>{t.settings}</h2><button type="button" className="close" onClick={() => setMobileMenu(false)} aria-label={a.close}>×</button></div><div className="mobile-setting-row"><span>{a.theme}</span><button type="button" className="setting-action" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon/> : <Sun/>}{theme === "light" ? t.dark : t.light}</button></div><div className="mobile-setting-row"><span>{a.language}</span><Picker lang={lang} setLang={setLang}/></div></section></div>}
    </main>
  );
}
