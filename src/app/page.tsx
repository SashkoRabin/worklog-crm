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
  Link2,
  MapPin,
  Moon,
  Plus,
  Settings2,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { stores } from "@/lib/stores";
import {
  dismissConnecteamShift,
  loadUserShifts,
  syncConnecteamCalendar,
  syncConnecteamIfConnected,
} from "@/lib/connecteam-client";
import { supabase } from "@/lib/supabase";
import { copy, isWorkedShift, Lang, locales, money, Shift } from "@/lib/worklog";
import { MobileNav } from "@/components/mobile-nav";

const connecteamText = {
  en: { title: "Connecteam", intro: "Paste your personal Calendar Sync link. Planned shifts never affect earnings until you add actual hours.", link: "Personal calendar link", connect: "Connect & sync", sync: "Sync now", syncing: "Syncing…", disconnect: "Disconnect", connected: "Connected", planned: "Planned" },
  ru: { title: "Connecteam", intro: "Вставьте личную ссылку Calendar Sync. Запланированные смены не влияют на доход, пока вы не добавите фактические часы.", link: "Личная ссылка календаря", connect: "Подключить и синхронизировать", sync: "Синхронизировать", syncing: "Синхронизация…", disconnect: "Отключить", connected: "Подключено", planned: "Запланировано" },
  cs: { title: "Connecteam", intro: "Vložte osobní odkaz Calendar Sync. Plánované směny neovlivní výdělek, dokud nezadáte skutečné hodiny.", link: "Osobní odkaz kalendáře", connect: "Připojit a synchronizovat", sync: "Synchronizovat", syncing: "Synchronizace…", disconnect: "Odpojit", connected: "Připojeno", planned: "Plánováno" },
} as const;

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
    [dialog, setDialog] = useState<"shift" | "settings" | "quick" | "connecteam" | null>(null),
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
      await syncConnecteamIfConnected();
      const [{ data: profile }, rows] = await Promise.all([
        client
          .from("profiles")
          .select("hourly_rate")
          .eq("id", data.user.id)
          .single(),
        loadUserShifts(data.user.id),
      ]);
      setShifts(rows);
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
    actualOwn = own.filter((shift) => isWorkedShift(shift)),
    hours = actualOwn.reduce((sum, shift) => sum + shift.hours, 0),
    earned = actualOwn.reduce(
      (sum, shift) => sum + shift.hours * shift.hourly_rate,
      0,
    ),
    byStore = Object.entries(
      actualOwn.reduce<Record<string, number>>(
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
    if (editing?.source === "connecteam") return;
    const values = new FormData(e.currentTarget),
      row = {
        work_date: String(values.get("date")),
        store: String(values.get("store")),
        shift_name: String(values.get("schedule")),
        shift_type: String(values.get("type")) as Shift["shift_type"],
        hours: Number(values.get("hours")),
        hourly_rate: rate,
        notes: String(values.get("note")),
        source: "manual" as const,
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
        await supabase
          .from("shifts")
          .insert({ ...newShift, user_id: user.id });
    }
    setDialog(null);
    setEditing(null);
  }
  async function deleteShift(shift: Shift) {
    setShifts((all) => all.filter((item) => item.id !== shift.id));
    setDialog(null);
    setEditing(null);
    if (supabase && user) {
      if (shift.source === "connecteam" && shift.external_id) {
        await dismissConnecteamShift(user.id, shift.external_id);
      }
      const { error } = await supabase.from("shifts").delete().eq("id", shift.id);
      if (error) {
        setShifts((all) => [shift, ...all]);
        console.error("Unable to delete shift", error);
      }
    }
  }
  async function refreshShifts() {
    if (!user) return;
    setShifts(await loadUserShifts(user.id));
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
            caption={`${actualOwn.length} ${t.shifts}`}
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
                hasNote = daily.some((shift) => Boolean(shift.notes?.trim())),
                isPast = day < new Date(new Date().setHours(0, 0, 0, 0)),
                isToday = isSameDay(day, new Date());
              return (
                <button
                  className={`day ${daily.length ? "workday" : isPast ? "day-off" : ""} ${hasNote ? "has-note" : ""} ${isToday ? "today" : ""}`}
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
                          className={`event ${isWorkedShift(shift) ? "worked" : "upcoming"}`}
                          key={shift.id}
                        >
                          <span className="event-title">{shift.store} · {shift.hours} h</span>
                          <span className="event-meta">
                            {isWorkedShift(shift) ? t.workedType : t.upcoming} · {shift.source === "connecteam" ? t.connecteam : t.manual}
                            {shift.notes && ` · ${shift.notes}`}
                          </span>
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
                <span className={`pill ${isWorkedShift(shift) ? "worked" : "assigned"}`}>
                  {isWorkedShift(shift) ? t.workedType : t.upcoming}
                </span>
                <span className="shift-hours">{shift.hours} h</span>
                <b className="shift-money">
                  {money(shift.hours * shift.hourly_rate)}
                </b>
                <button
                  className="delete"
                  aria-label="Delete shift"
                  onClick={() => deleteShift(shift)}
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
            <button type="button" className="connecteam-cta compact" onClick={() => setDialog("connecteam")}>
              <Link2 />
              <span><b>{connecteamText[lang].title}</b><small>Calendar Sync</small></span>
              <span aria-hidden="true">→</span>
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
              <button type="button" className="connecteam-cta" onClick={() => setDialog("connecteam")}>
                <span className="connecteam-cta-icon"><Link2 /></span>
                <span>
                  <b>{connecteamText[lang].title}</b>
                  <small>{connecteamText[lang].planned}</small>
                </span>
                <span className="connecteam-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="primary full">{t.save}</button>
            </div>
          </form>
        </div>
      )}
      {dialog === "connecteam" && (
        <ConnecteamDialog lang={lang} onClose={() => setDialog(null)} onSynced={refreshShifts} />
      )}
      {dialog === "shift" && (
        <ShiftDialog
          t={t}
          editing={editing}
          date={date}
          onClose={() => setDialog(null)}
          onSave={saveShift}
          onDelete={deleteShift}
        />
      )}
    </main>
  );
}

function ConnecteamDialog({
  lang,
  onClose,
  onSynced,
}: {
  lang: Lang;
  onClose: () => void;
  onSynced: () => void | Promise<void>;
}) {
  const text = connecteamText[lang];
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/connecteam/sync")
      .then((response) => response.json())
      .then((data) => {
        if (data.code === "SETUP_REQUIRED") throw new Error("CONNECTEAM_SETUP_REQUIRED");
        if (data.connected) {
          setConnected(true);
          setLastSynced(data.lastSyncedAt);
        }
      })
      .catch((reason) => setError(reason instanceof Error && reason.message === "CONNECTEAM_SETUP_REQUIRED" ? "Подключение пока не настроено на сервере. Добавьте серверные переменные из README — после этого ссылка будет синхронизироваться." : "Не удалось проверить подключение Connecteam."));
  }, []);
  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await syncConnecteamCalendar(url || undefined);
      setConnected(true);
      setLastSynced(new Date().toISOString());
      setUrl("");
      await onSynced();
    } catch (reason) {
      setError(reason instanceof Error && reason.message === "CONNECTEAM_SETUP_REQUIRED" ? "Серверная часть Connecteam ещё не настроена. Добавьте SUPABASE_SERVICE_ROLE_KEY и CONNECTEAM_ENCRYPTION_KEY в .env.local или переменные деплоя." : reason instanceof Error ? reason.message : "Не удалось синхронизировать Connecteam.");
    } finally {
      setPending(false);
    }
  }
  async function disconnect() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/connecteam/sync", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to disconnect Connecteam.");
      setConnected(false);
      setLastSynced(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disconnect Connecteam.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="dialog connecteam-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={sync}>
        <button type="button" className="close" onClick={onClose} aria-label="Close"><X /></button>
        <div className="dialog-body">
          <p className="eyebrow">{text.title}</p>
          <h2>{connected ? text.connected : text.title}</h2>
          <p>{text.intro}</p>
          {connected ? (
            <p className="connection-status">{lastSynced ? `${text.connected} · ${new Date(lastSynced).toLocaleString()}` : text.connected}</p>
          ) : (
            <label>
              {text.link}
              <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://…" required />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary full" disabled={pending}>{pending ? text.syncing : connected ? text.sync : text.connect}</button>
          {connected && <button type="button" className="disconnect" onClick={disconnect} disabled={pending}>{text.disconnect}</button>}
        </div>
      </form>
    </div>
  );
}

function ShiftDialog({
  t,
  editing,
  date,
  onClose,
  onSave,
  onDelete,
}: {
  t: (typeof copy)[Lang];
  editing: Shift | null;
  date: string;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (shift: Shift) => void;
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
  const fromConnecteam = editing?.source === "connecteam";
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
          <p className="eyebrow">{fromConnecteam ? t.connecteam : t.newShift}</p>
          <h2>{fromConnecteam ? editing?.store : t.add}</h2>
          {fromConnecteam ? (
            <p className="subtle">
              {editing?.shift_name} · {editing?.hours} h · {t.connecteam}
            </p>
          ) : null}
          <div className="form-grid">
            <label>
              {t.date}
              <input
                name="date"
                type="date"
                defaultValue={editing?.work_date || date}
                readOnly={fromConnecteam}
                disabled={fromConnecteam}
              />
            </label>
            <label>
              {t.type}
              <select
                name="type"
                defaultValue={editing?.shift_type || "worked"}
                disabled={fromConnecteam}
              >
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
              value={fromConnecteam ? editing?.store ?? store.name : store.name}
              disabled={fromConnecteam}
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
            {fromConnecteam ? (
              <input name="schedule" readOnly disabled value={editing?.shift_name ?? ""} />
            ) : (
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
            )}
          </label>
          <label>
            {t.actual}
            <input
              name="hours"
              type="number"
              step="0.5"
              min="0"
              value={fromConnecteam ? editing?.hours ?? hours : hours}
              readOnly={fromConnecteam}
              disabled={fromConnecteam}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </label>
          <label>
            {t.note} <span className="subtle">{t.optional}</span>
            <input
              name="note"
              defaultValue={editing?.notes || ""}
              readOnly={fromConnecteam}
              disabled={fromConnecteam}
            />
          </label>
          {editing && (
            <button
              type="button"
              className="delete-shift"
              onClick={() => onDelete(editing)}
            >
              {t.deleteShift}
            </button>
          )}
          {fromConnecteam ? (
            <button type="button" className="primary full" onClick={onClose}>
              {t.save}
            </button>
          ) : (
            <button className="primary full">{t.saveShift}</button>
          )}
        </div>
      </form>
    </div>
  );
}
