"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { format, isSameMonth, parseISO, subMonths } from "date-fns";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Globe2,
  MapPin,
  Moon,
  Settings2,
  Sun,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { loadUserShifts, syncConnecteamIfConnected } from "@/lib/connecteam-client";
import { copy, isWorkedShift, Lang, locales, money, Shift } from "@/lib/worklog";
import { supabase } from "@/lib/supabase";
import { MobileNav } from "@/components/mobile-nav";

const now = new Date();
const readThemeCookie = () => {
  if (typeof document === "undefined") return null;
  return document.cookie.match(
    /(?:^|; )worklog-theme=(light|dark)(?:;|$)/,
  )?.[1] as "light" | "dark" | undefined;
};
const seed: Shift[] = [
  {
    id: "a1",
    work_date: format(now, "yyyy-MM-dd"),
    store: "Narodni",
    shift_name: "Day",
    shift_type: "worked",
    hours: 7.5,
    hourly_rate: 150,
  },
  {
    id: "a2",
    work_date: format(subMonths(now, 0), "yyyy-MM-08"),
    store: "Opletalova",
    shift_name: "Day",
    shift_type: "worked",
    hours: 7,
    hourly_rate: 150,
  },
  {
    id: "a3",
    work_date: format(subMonths(now, 1), "yyyy-MM-12"),
    store: "Kaprova",
    shift_name: "Evening",
    shift_type: "replacement",
    hours: 7,
    hourly_rate: 150,
  },
  {
    id: "a4",
    work_date: format(subMonths(now, 1), "yyyy-MM-19"),
    store: "Narodni",
    shift_name: "Day",
    shift_type: "worked",
    hours: 7.5,
    hourly_rate: 150,
  },
];
function Picker({ lang, setLang }: { lang: Lang; setLang: (x: Lang) => void }) {
  return (
    <label className="language">
      <Globe2 size={15} />
      <select
        aria-label="Language"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        <option value="en">English</option>
        <option value="ru">Русский</option>
        <option value="cs">Čeština</option>
      </select>
    </label>
  );
}
function Insight({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="insight card">
      <span className="metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <small>{note}</small>
      </div>
    </article>
  );
}

export default function Analytics() {
  const [lang, setLang] = useState<Lang>("en"),
    [theme, setTheme] = useState<"light" | "dark">(
      () => readThemeCookie() || "light",
    ),
    [shifts, setShifts] = useState<Shift[]>(seed),
    [mobileMenu, setMobileMenu] = useState(false);
  const t = copy[lang];
  useEffect(() => {
    const savedLang = localStorage.getItem("worklog-lang") as Lang | null,
      savedTheme = (readThemeCookie() ||
        localStorage.getItem("worklog-theme")) as "light" | "dark" | null,
      client = supabase;
    if (savedLang) setLang(savedLang);
    if (savedTheme) setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme || "light";
    if (!client) return;
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setShifts(await loadUserShifts(data.user.id));
      // Do not hold analytics behind a remote calendar request. If a linked
      // calendar changes, refresh the already rendered view in the background.
      void syncConnecteamIfConnected().then((result) => {
        if (result.synced) void loadUserShifts(data.user.id).then(setShifts);
      });
    });
  }, []);
  useEffect(() => {
    localStorage.setItem("worklog-lang", lang);
  }, [lang]);
  useEffect(() => {
    localStorage.setItem("worklog-theme", theme);
    document.cookie = `worklog-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const actualShifts = shifts.filter((shift) => isWorkedShift(shift)),
    current = actualShifts.filter((s) => isSameMonth(parseISO(s.work_date), now)),
    previous = actualShifts.filter((s) =>
      isSameMonth(parseISO(s.work_date), subMonths(now, 1)),
    );
  const currentHours = current.reduce((sum, s) => sum + s.hours, 0),
    previousHours = previous.reduce((sum, s) => sum + s.hours, 0),
    currentIncome = current.reduce(
      (sum, s) => sum + s.hours * s.hourly_rate,
      0,
    );
  const stores = Object.entries(
    current.reduce<Record<string, number>>(
      (all, s) => ({ ...all, [s.store]: (all[s.store] || 0) + s.hours }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...stores.map(([, hours]) => hours), 1);
  const months = [
    subMonths(now, 3),
    subMonths(now, 2),
    subMonths(now, 1),
    now,
  ].map((month) => ({
    label: format(month, "MMM", { locale: locales[lang] }),
    hours: actualShifts
      .filter((s) => isSameMonth(parseISO(s.work_date), month))
      .reduce((sum, s) => sum + s.hours, 0),
  }));
  const maxMonth = Math.max(...months.map((m) => m.hours), 1);
  const delta = previousHours
    ? Math.round(((currentHours - previousHours) / previousHours) * 100)
    : 0;
  return (
    <main className={`app-shell ${theme === "dark" ? "theme-dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/yk-logo.png"
            alt="YK"
            width={36}
            height={36}
            priority
          />
          <span className="brand-name">YK WorkLog</span>
        </div>
        <nav>
          <Link href="/">
            <CalendarDays />
            {t.calendar}
          </Link>
          <a className="active">
            <BarChart3 />
            {t.analytics}
          </a>
        </nav>
        <div className="sidebar-bottom">
          <Picker lang={lang} setLang={setLang} />
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon /> : <Sun />}
            {theme === "light" ? t.dark : t.light}
          </button>
          <button>
            <Settings2 />
            {t.settings}
          </button>
        </div>
      </aside>
      <section className="content analytics-page">
        <header>
          <div>
            <p className="eyebrow">{t.analyticsTitle}</p>
            <h1>{t.analyticsGreeting}</h1>
          </div>
          <div className="period-badge">
            <span>{t.thisMonth}</span>
            <b>{format(now, "LLLL yyyy", { locale: locales[lang] })}</b>
          </div>
        </header>
        <div className="insights">
          <Insight
            icon={<Clock3 />}
            label={t.totalHours}
            value={`${currentHours} h`}
            note={
              delta === 0
                ? t.thisMonth
                : `${delta > 0 ? "+" : ""}${delta}% ${t.comparison.toLowerCase()}`
            }
          />
          <Insight
            icon={<WalletCards />}
            label={t.income}
            value={money(currentIncome)}
            note={`${current.length} ${t.shifts}`}
          />
          <Insight
            icon={<TrendingUp />}
            label={t.averageShift}
            value={`${current.length ? (currentHours / current.length).toFixed(1) : "0"} h`}
            note={t.basedOnHours}
          />
          <Insight
            icon={<MapPin />}
            label={t.bestStore}
            value={stores[0]?.[0] || "—"}
            note={stores[0] ? `${stores[0][1]} h` : t.empty}
          />
        </div>
        <div className="analytics-grid">
          <section className="card comparison-card">
            <div className="card-head">
              <div>
                <h2>{t.comparison}</h2>
                <p>
                  {t.thisMonth} · {t.previousMonth}
                </p>
              </div>
            </div>
            <div className="compare-columns">
              <div>
                <span>{t.previousMonth}</span>
                <b>{previousHours} h</b>
                <i
                  style={{
                    width: `${Math.max((previousHours / Math.max(currentHours, previousHours, 1)) * 100, 6)}%`,
                  }}
                />
              </div>
              <div className="current">
                <span>{t.thisMonth}</span>
                <b>{currentHours} h</b>
                <i
                  style={{
                    width: `${Math.max((currentHours / Math.max(currentHours, previousHours, 1)) * 100, 6)}%`,
                  }}
                />
              </div>
            </div>
          </section>
          <section className="card trend-card">
            <div className="card-head">
              <div>
                <h2>{t.monthTrend}</h2>
                <p>{t.totalHours}</p>
              </div>
            </div>
            <div className="trend-bars">
              {months.map((item) => (
                <div key={item.label}>
                  <span
                    className="trend-fill"
                    style={{
                      height: `${Math.max((item.hours / maxMonth) * 100, 5)}%`,
                    }}
                  />
                  <b>{item.hours}h</b>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="card store-card">
          <div className="card-head">
            <div>
              <h2>{t.storePerformance}</h2>
              <p>{t.basedOnHours}</p>
            </div>
            <span className="store-count">{stores.length}</span>
          </div>
          {stores.length ? (
            <div className="store-table">
              {stores.map(([name, hours], index) => (
                <div className="store-row" key={name}>
                  <span className="rank">0{index + 1}</span>
                  <b>{name}</b>
                  <div className="track">
                    <i style={{ width: `${(hours / max) * 100}%` }} />
                  </div>
                  <span>{hours} h</span>
                  <strong>
                    {Math.round((hours / Math.max(currentHours, 1)) * 100)}%
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">{t.empty}</div>
          )}
        </section>
      </section>
      <MobileNav
        active="analytics"
        calendar={t.calendar}
        analytics={t.analytics}
        settings={t.settings}
        onSettings={() => setMobileMenu(true)}
      />
      {mobileMenu && (
        <div className="overlay mobile-sheet-overlay" onMouseDown={() => setMobileMenu(false)}>
          <section
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t.settings}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="sheet-handle" />
            <div className="mobile-sheet-head">
              <h2>{t.settings}</h2>
              <button type="button" className="close" onClick={() => setMobileMenu(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="mobile-setting-row">
              <span>{t.theme}</span>
              <button
                type="button"
                className="setting-action"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <Moon /> : <Sun />}
                {theme === "light" ? t.dark : t.light}
              </button>
            </div>
            <div className="mobile-setting-row">
              <span>{t.language}</span>
              <Picker lang={lang} setLang={setLang} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
