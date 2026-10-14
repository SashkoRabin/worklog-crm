"use client";
import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Settings2,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { stores } from "@/lib/stores";
import { supabase } from "@/lib/supabase";
import { copy, Lang, locales, money, Shift } from "@/lib/worklog";
import { MobileNav } from "@/components/mobile-nav";

const current = new Date(),
  today = format(current, "yyyy-MM-dd");
const readThemeCookie = () => {
  if (typeof document === "undefined") return null;
  return document.cookie.match(
    /(?:^|; )worklog-theme=(light|dark)(?:;|$)/,
  )?.[1] as "light" | "dark" | undefined;
};
const demo: Shift[] = [
  {
    id: "demo-1",
    work_date: today,
    store: "Narodni",
    shift_name: "Day · 10:00–17:30",
    shift_type: "worked",
    hours: 7.5,
    hourly_rate: 150,
  },
  {
    id: "demo-2",
    work_date: format(addDays(current, -2), "yyyy-MM-dd"),
    store: "Opletalova",
    shift_name: "Day · 10:00–17:00",
    shift_type: "worked",
    hours: 7,
    hourly_rate: 150,
  },
  {
    id: "demo-3",
    work_date: format(addDays(current, -5), "yyyy-MM-dd"),
    store: "Kaprova",
    shift_name: "Evening · 17:00–00:00",
    shift_type: "replacement",
    hours: 7,
    hourly_rate: 150,
  },
];
function LangPicker({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (x: Lang) => void;
}) {
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
function Metric({
  icon,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="metric card">
      <span className="metric-icon">{icon}</span>
      <p>{label}</p>
      <h2>{value}</h2>
      <small>{caption}</small>
    </article>
  );
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en"),
    [theme, setTheme] = useState<"light" | "dark">(
      () => readThemeCookie() || "light",
    ),
    [user, setUser] = useState<{ id: string; email?: string } | null>(null),
    [shifts, setShifts] = useState<Shift[]>(demo),
    [rate, setRate] = useState(150),
    [month, setMonth] = useState(current),
    [dialog, setDialog] = useState<"shift" | "settings" | "quick" | null>(null),
    [date, setDate] = useState(today),
    [editing, setEditing] = useState<Shift | null>(null);
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
      setUser(data.user);
      const [{ data: rows }, { data: profile }] = await Promise.all([
        client
          .from("shifts")
          .select("*")
          .eq("user_id", data.user.id)
          .order("work_date", { ascending: false }),
        client
          .from("profiles")
          .select("hourly_rate")
          .eq("id", data.user.id)
          .single(),
      ]);
      setShifts((rows as Shift[]) || []);
      if (profile?.hourly_rate) setRate(Number(profile.hourly_rate));
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
  const own = useMemo(
      () =>
        shifts.filter((shift) => isSameMonth(parseISO(shift.work_date), month)),
      [shifts, month],
    ),
    hours = own.reduce((sum, shift) => sum + shift.hours, 0),
    earned = own.reduce(
      (sum, shift) => sum + shift.hours * shift.hourly_rate,
      0,
    ),
    byStore = Object.entries(
      own.reduce<Record<string, number>>(
        (all, shift) => ({
          ...all,
          [shift.store]: (all[shift.store] || 0) + shift.hours,
        }),
        {},
      ),
    ).sort((a, b) => b[1] - a[1]);
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });
  async function saveShift(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget),
      row = {
        work_date: String(values.get("date")),
        store: String(values.get("store")),
        shift_name: String(values.get("schedule")),
        shift_type: String(values.get("type")) as Shift["shift_type"],
        hours: Number(values.get("hours")),
        hourly_rate: rate,
        notes: String(values.get("note")),
      };
    if (editing) {
      setShifts((all) =>
        all.map((item) =>
          item.id === editing.id ? { ...item, ...row } : item,
        ),
      );
      if (supabase && user)
        await supabase.from("shifts").update(row).eq("id", editing.id);
    } else {
      const newShift = { ...row, id: crypto.randomUUID() };
      setShifts((all) => [newShift, ...all]);
      if (supabase && user)
        await supabase.from("shifts").insert({ ...row, user_id: user.id });
    }
    setDialog(null);
    setEditing(null);
  }
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
          <a className="active">
            <CalendarDays />
            {t.calendar}
          </a>
          <Link href="/analytics">
            <BarChart3 />
            {t.analytics}
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <LangPicker lang={lang} setLang={setLang} />
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon /> : <Sun />}
            {theme === "light" ? t.dark : t.light}
          </button>
          <button onClick={() => setDialog("settings")}>
            <Settings2 />
            {t.settings}
          </button>
          {user && (
            <button onClick={() => supabase?.auth.signOut()}>
              <LogOut />
              {t.logout}
            </button>
          )}
          <small>{user?.email}</small>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">{t.dashboard}</p>
            <h1>{t.greeting}</h1>
          </div>
          <button
            className="primary"
            onClick={() => {
              setDate(today);
              setEditing(null);
              setDialog("shift");
            }}
          >
            <Plus />
            {t.add}
          </button>
        </header>
        <div className="metrics">
          <Metric
            icon={<WalletCards />}
            label={t.earned}
            value={money(earned)}
            caption={format(month, "LLLL", { locale: locales[lang] })}
          />
          <Metric
            icon={<Clock3 />}
            label={t.worked}
            value={`${hours} h`}
            caption={`${own.length} ${t.shifts}`}
          />
          <Metric
            icon={<MapPin />}
            label={t.mainStore}
            value={byStore[0]?.[0] || "—"}
            caption={
              byStore[0]
                ? `${Math.round((byStore[0][1] / Math.max(hours, 1)) * 100)}%`
                : t.empty
            }
          />
        </div>
        <section className="card calendar-card">
          <div className="card-head">
            <div>
              <h2>{format(month, "LLLL yyyy", { locale: locales[lang] })}</h2>
              <p>{t.clickDay}</p>
            </div>
            <div className="month-nav">
              <button
                aria-label="Previous month"
                onClick={() => setMonth(subMonths(month, 1))}
              >
                <ChevronLeft />
              </button>
              <button
                aria-label="Next month"
                onClick={() => setMonth(addDays(endOfMonth(month), 1))}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="weekdays">
            {["M", "T", "W", "T", "F", "S", "S"].map((item, index) => (
              <span key={index}>{item}</span>
            ))}
          </div>
          <div className="calendar">
            {Array.from({ length: (getDay(startOfMonth(month)) + 6) % 7 }).map(
              (_, index) => (
                <i key={index} />
              ),
            )}
            {days.map((day) => {
              const daily = own.filter((shift) =>
                  isSameDay(parseISO(shift.work_date), day),
                ),
                isPast = day < new Date(new Date().setHours(0, 0, 0, 0)),
                isToday = isSameDay(day, new Date());
              return (
                <button
                  className={`day ${daily.length ? "workday" : isPast ? "day-off" : ""} ${isToday ? "today" : ""}`}
                  key={day.toString()}
                  onClick={() => {
                    setDate(format(day, "yyyy-MM-dd"));
                    setEditing(daily[0] || null);
                    setDialog("shift");
                  }}
                >
                  <b>{format(day, "d")}</b>
                  {daily.length
                    ? daily.slice(0, 2).map((shift) => (
                        <span
                          className={`event ${shift.shift_type}`}
                          key={shift.id}
                        >
                          {shift.store} · {shift.hours} h
                        </span>
                      ))
                    : isPast && <span className="off-label">{t.dayOff}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section className="card recent">
          <div className="card-head">
            <div>
              <h2>{t.recent}</h2>
              <p>
                {t.defaultRate}: {money(rate)}/h
              </p>
            </div>
            <button className="link" onClick={() => setDialog("settings")}>
              {t.changeRate}
            </button>
          </div>
          {shifts.length ? (
            shifts.slice(0, 5).map((shift) => (
              <div className="shift-row" key={shift.id}>
                <div className="date-box">
                  <b>{format(parseISO(shift.work_date), "dd")}</b>
                  <span>
                    {format(parseISO(shift.work_date), "MMM", {
                      locale: locales[lang],
                    })}
                  </span>
                </div>
                <div className="shift-info">
                  <b>{shift.store}</b>
                  <span>{shift.shift_name}</span>
                </div>
                <span className={`pill ${shift.shift_type}`}>
                  {
                    t[
                      shift.shift_type === "worked"
                        ? "workedType"
                        : shift.shift_type
                    ]
                  }
                </span>
                <span className="shift-hours">{shift.hours} h</span>
                <b className="shift-money">
                  {money(shift.hours * shift.hourly_rate)}
                </b>
                <button
                  className="delete"
                  aria-label="Delete shift"
                  onClick={() =>
                    setShifts((all) =>
                      all.filter((item) => item.id !== shift.id),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty">{t.empty}</div>
          )}
        </section>
      </section>
      <MobileNav
        active="calendar"
        calendar={t.calendar}
        analytics={t.analytics}
        settings={t.settings}
        onSettings={() => setDialog("quick")}
      />
      {dialog === "quick" && (
        <div className="overlay mobile-sheet-overlay" onMouseDown={() => setDialog(null)}>
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
              <button type="button" className="close" onClick={() => setDialog(null)} aria-label="Close">
                <X />
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
              <LangPicker lang={lang} setLang={setLang} />
            </div>
            <button type="button" className="setting-link" onClick={() => setDialog("settings")}>
              {t.changeRate}
            </button>
          </section>
        </div>
      )}
      {dialog === "settings" && (
        <div className="overlay" onMouseDown={() => setDialog(null)}>
          <form
            className="dialog"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setRate(Number(new FormData(e.currentTarget).get("rate")));
              setDialog(null);
            }}
          >
            <button
              type="button"
              className="close"
              onClick={() => setDialog(null)}
            >
              <X />
            </button>
            <div className="dialog-body">
              <p className="eyebrow">{t.settings}</p>
              <h2>{t.rate}</h2>
              <p>{t.rateNote}</p>
              <label>
                {t.rate}
                <input name="rate" type="number" min="0" defaultValue={rate} />
              </label>
              <button className="primary full">{t.save}</button>
            </div>
          </form>
        </div>
      )}
      {dialog === "shift" && (
        <ShiftDialog
          t={t}
          editing={editing}
          date={date}
          onClose={() => setDialog(null)}
          onSave={saveShift}
        />
      )}
    </main>
  );
}

function ShiftDialog({
  t,
  editing,
  date,
  onClose,
  onSave,
}: {
  t: (typeof copy)[Lang];
  editing: Shift | null;
  date: string;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initialStore =
    stores.find((store) => store.name === editing?.store) || stores[0];
  const initialShift = Math.max(
    0,
    initialStore.shifts.findIndex((shift) =>
      editing?.shift_name.includes(`${shift.start}–${shift.end}`),
    ),
  );
  const [storeId, setStoreId] = useState(initialStore.id),
    [shiftIndex, setShiftIndex] = useState(initialShift),
    [hours, setHours] = useState(
      editing?.hours ?? initialStore.shifts[initialShift].hours,
    );
  const store = stores.find((item) => item.id === storeId)!,
    shift = store.shifts[shiftIndex];
  const selectStore = (id: string) => {
    const next = stores.find((item) => item.id === id)!;
    setStoreId(id);
    setShiftIndex(0);
    setHours(next.shifts[0].hours);
  };
  const selectShift = (index: number) => {
    setShiftIndex(index);
    setHours(store.shifts[index].hours);
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form
        className="dialog shift-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSave}
      >
        <button type="button" className="close" onClick={onClose}>
          <X />
        </button>
        <div className="dialog-body">
          <p className="eyebrow">{t.newShift}</p>
          <h2>{t.add}</h2>
          <div className="form-grid">
            <label>
              {t.date}
              <input
                name="date"
                type="date"
                defaultValue={editing?.work_date || date}
              />
            </label>
            <label>
              {t.type}
              <select name="type" defaultValue={editing?.shift_type || "worked"}>
                <option value="worked">{t.workedType}</option>
                <option value="replacement">{t.replacement}</option>
                <option value="assigned">{t.assigned}</option>
              </select>
            </label>
          </div>
          <label>
            {t.store}
            <select
              name="store"
              value={store.name}
              onChange={(event) =>
                selectStore(
                  stores.find((item) => item.name === event.target.value)!.id,
                )
              }
            >
              {stores.map((item) => (
                <option value={item.name} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.schedule}
            <select
              name="schedule"
              value={`${shift.start}–${shift.end}`}
              onChange={(event) =>
                selectShift(
                  store.shifts.findIndex(
                    (item) => `${item.start}–${item.end}` === event.target.value,
                  ),
                )
              }
            >
              {store.shifts.map((item) => (
                <option
                  value={`${item.start}–${item.end}`}
                  key={`${item.start}-${item.end}`}
                >
                  {item.start}–{item.end} · {item.hours} h
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.actual}
            <input
              name="hours"
              type="number"
              step="0.5"
              min="0"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </label>
          <label>
            {t.note} <span className="subtle">{t.optional}</span>
            <input name="note" defaultValue={editing?.notes || ""} />
          </label>
          <button className="primary full">{t.saveShift}</button>
        </div>
      </form>
    </div>
  );
}
