"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Moon, Sun, UserRound, Target, Globe2, Save, LoaderCircle, CalendarDays, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Lang, money } from "@/lib/worklog";
import { MobileNav } from "@/components/mobile-nav";

type Theme = "light" | "dark";
type GoalType = "income" | "hours" | "";

const text = {
  en: {
    eyebrow: "YOUR ACCOUNT", title: "Profile", description: "Manage your personal details, hourly rate and monthly target.",
    personal: "Personal details", name: "Display name", nameHint: "Used in your dashboard greeting",
    rate: "Default hourly rate", rateHint: "Applied to new shifts. Existing shifts keep their saved rate.",
    goal: "Monthly goal", goalHint: "Choose one target. WorkLog will estimate the other metric using your hourly rate.",
    goalType: "I want to", incomeGoal: "Earn money", hoursGoal: "Work hours", amount: "Target",
    save: "Save changes", saving: "Saving…", saved: "Profile saved", load: "Loading profile…",
    loadError: "Could not load your profile", saveError: "Could not save your profile. Try again.",
    login: "Sign in to manage your profile", signIn: "Sign in", calendar: "Calendar", analytics: "Analytics", profile: "Profile", settings: "Settings",
    estimateHours: "You need to work approximately", estimateEarn: "At this target, you would earn approximately",
    hours: "hours", clearGoal: "No monthly goal", theme: "Appearance", language: "Language", dark: "Dark mode", light: "Light mode",
    invalid: "Enter a value greater than zero.", currency: "CZK",
  },
  ru: {
    eyebrow: "ТВОЙ АККАУНТ", title: "Профиль", description: "Управляй личными данными, почасовой ставкой и месячной целью.",
    personal: "Личные данные", name: "Имя", nameHint: "Отображается в приветствии на главной",
    rate: "Почасовая ставка по умолчанию", rateHint: "Применяется к новым сменам. У существующих смен сохраняется их ставка.",
    goal: "Цель на месяц", goalHint: "Выбери одну цель. WorkLog рассчитает второй показатель по твоей почасовой ставке.",
    goalType: "Я хочу", incomeGoal: "Заработать", hoursGoal: "Отработать часов", amount: "Целевое значение",
    save: "Сохранить изменения", saving: "Сохранение…", saved: "Профиль сохранён", load: "Загружаем профиль…",
    loadError: "Не удалось загрузить профиль", saveError: "Не удалось сохранить профиль. Попробуй ещё раз.",
    login: "Войди в аккаунт, чтобы управлять профилем", signIn: "Войти", calendar: "Календарь", analytics: "Аналитика", profile: "Профиль", settings: "Настройки",
    estimateHours: "Для этой цели нужно отработать примерно", estimateEarn: "При такой цели по часам заработок составит примерно",
    hours: "часов", clearGoal: "Без месячной цели", theme: "Оформление", language: "Язык", dark: "Тёмная тема", light: "Светлая тема",
    invalid: "Введи значение больше нуля.", currency: "Kč",
  },
  cs: {
    eyebrow: "VÁŠ ÚČET", title: "Profil", description: "Spravujte osobní údaje, hodinovou sazbu a měsíční cíl.",
    personal: "Osobní údaje", name: "Jméno", nameHint: "Zobrazí se v pozdravu na hlavní stránce",
    rate: "Výchozí hodinová sazba", rateHint: "Použije se pro nové směny. Starší směny si zachovají uloženou sazbu.",
    goal: "Měsíční cíl", goalHint: "Vyberte jeden cíl. WorkLog vypočítá druhý ukazatel podle hodinové sazby.",
    goalType: "Chci", incomeGoal: "Vydělat", hoursGoal: "Odpracovat hodin", amount: "Cílová hodnota",
    save: "Uložit změny", saving: "Ukládání…", saved: "Profil uložen", load: "Načítání profilu…",
    loadError: "Profil se nepodařilo načíst", saveError: "Profil se nepodařilo uložit. Zkuste to znovu.",
    login: "Pro správu profilu se přihlaste", signIn: "Přihlásit se", calendar: "Kalendář", analytics: "Analytika", profile: "Profil", settings: "Nastavení",
    estimateHours: "Pro dosažení cíle musíte odpracovat přibližně", estimateEarn: "Při tomto počtu hodin vyděláte přibližně",
    hours: "hodin", clearGoal: "Bez měsíčního cíle", theme: "Vzhled", language: "Jazyk", dark: "Tmavý režim", light: "Světlý režim",
    invalid: "Zadejte hodnotu větší než nula.", currency: "Kč",
  },
} as const;

const readTheme = (): Theme => {
  if (typeof document === "undefined") return "light";
  return (document.cookie.match(/(?:^|; )worklog-theme=(light|dark)(?:;|$)/)?.[1] as Theme) || "light";
};

export default function ProfilePage() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("150");
  const [goalType, setGoalType] = useState<GoalType>("");
  const [goalValue, setGoalValue] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "saving" | "saved">("loading");
  const [error, setError] = useState("");
  const t = text[lang];

  useEffect(() => {
    const savedLang = localStorage.getItem("worklog-lang") as Lang | null;
    const savedTheme = (readTheme() || localStorage.getItem("worklog-theme")) as Theme | null;
    if (savedLang && ["en", "ru", "cs"].includes(savedLang)) setLang(savedLang);
    if (savedTheme) setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme || "light";
    let active = true;
    const load = async () => {
      try {
        if (!supabase) throw new Error(t.loadError);
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const user = sessionData.session?.user;
        if (!user) { if (active) setStatus("ready"); return; }
        const { data, error: profileError } = await supabase.from("profiles")
          .select("hourly_rate,display_name,monthly_goal_type,monthly_goal_value")
          .eq("id", user.id).single();
        if (profileError) throw profileError;
        if (!active) return;
        setUserId(user.id);
        setEmail(user.email || "");
        setName(data?.display_name || "");
        setRate(String(data?.hourly_rate ?? 150));
        setGoalType(data?.monthly_goal_type || "");
        setGoalValue(data?.monthly_goal_value == null ? "" : String(data.monthly_goal_value));
        setStatus("ready");
      } catch (e) {
        console.error("Profile loading failed", e);
        if (active) { setError(e instanceof Error ? e.message : t.loadError); setStatus("error"); }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem("worklog-lang", lang); }, [lang]);
  useEffect(() => {
    localStorage.setItem("worklog-theme", theme);
    document.cookie = `worklog-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const numericRate = Math.max(0, Number(rate) || 0);
  const numericGoal = Math.max(0, Number(goalValue) || 0);
  const estimate = useMemo(() => {
    if (!goalType || numericGoal <= 0) return null;
    return goalType === "income"
      ? { label: t.estimateHours, value: numericRate > 0 ? `${(numericGoal / numericRate).toFixed(1)} ${t.hours}` : "—" }
      : { label: t.estimateEarn, value: money(numericGoal * numericRate) };
  }, [goalType, numericGoal, numericRate, t]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !supabase) return;
    if (goalType && numericGoal <= 0) { setError(t.invalid); setStatus("ready"); return; }
    setStatus("saving"); setError("");
    const { error: saveError } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: name.trim() || null,
      hourly_rate: numericRate,
      monthly_goal_type: goalType || null,
      monthly_goal_value: goalType ? numericGoal : null,
    });
    if (saveError) {
      console.error("Profile save failed", saveError);
      setError(t.saveError);
      setStatus("ready");
      return;
    }
    setStatus("saved");
    window.setTimeout(() => setStatus("ready"), 2400);
  }

  return (
    <main className={`app-shell ${theme === "dark" ? "theme-dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><Image className="brand-logo" src="/yk-logo.png" alt="YK" width={36} height={36} priority/><span className="brand-name">YK WorkLog</span></div>
        <nav>
          <Link href="/"><CalendarDays />{t.calendar}</Link>
          <Link href="/analytics"><BarChart3 />{t.analytics}</Link>
          <a className="active" aria-current="page"><UserRound />{t.profile}</a>
        </nav>
        <div className="sidebar-bottom">
          <label className="language"><Globe2 size={15}/><select aria-label={t.language} value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option><option value="cs">Čeština</option></select></label>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon/> : <Sun/>}{theme === "light" ? t.dark : t.light}</button>
          <small>{email}</small>
        </div>
      </aside>
      <section className="content profile-page">
        <header className="profile-header">
          <div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="profile-description">{t.description}</p></div>
          <Link href="/" className="profile-back"><ArrowLeft size={16}/>{t.calendar}</Link>
        </header>
        {status === "loading" ? <section className="card profile-state"><LoaderCircle className="spin"/>{t.load}</section>
        : status === "error" ? <section className="card profile-state" role="alert">{t.loadError}<small>{error}</small></section>
        : !userId ? <section className="card profile-state"><p>{t.login}</p><Link className="primary" href="/login">{t.signIn}</Link></section>
        : <form className="profile-layout" onSubmit={save}>
          <section className="card profile-card">
            <div className="profile-card-heading"><span className="an-icon"><UserRound/></span><div><h2>{t.personal}</h2><p>{email}</p></div></div>
            <label className="profile-field">{t.name}<small>{t.nameHint}</small><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t.name}/></label>
            <label className="profile-field">{t.rate}<small>{t.rateHint}</small><div className="profile-input-with-unit"><input type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} required/><span>{t.currency} / h</span></div></label>
          </section>
          <section className="card profile-card">
            <div className="profile-card-heading"><span className="an-icon"><Target/></span><div><h2>{t.goal}</h2><p>{t.goalHint}</p></div></div>
            <label className="profile-field">{t.goalType}
              <select value={goalType} onChange={(e) => { setGoalType(e.target.value as GoalType); setGoalValue(""); setError(""); }}>
                <option value="">{t.clearGoal}</option><option value="income">{t.incomeGoal}</option><option value="hours">{t.hoursGoal}</option>
              </select>
            </label>
            {goalType && <label className="profile-field">{t.amount}<div className="profile-input-with-unit"><input type="number" min="0.1" step="0.1" value={goalValue} onChange={(e) => { setGoalValue(e.target.value); setError(""); }} required/><span>{goalType === "income" ? t.currency : t.hours}</span></div></label>}
            {estimate && <div className="profile-estimate"><span>{estimate.label}</span><strong>{estimate.value}</strong></div>}
            {!goalType && <p className="profile-no-goal">{t.clearGoal}</p>}
          </section>
          <div className="profile-save-row">
            {error && <p className="profile-error" role="alert">{error}</p>}
            <button className="primary profile-save" disabled={status === "saving"}><Save size={16}/>{status === "saving" ? t.saving : status === "saved" ? t.saved : t.save}</button>
          </div>
        </form>}
      </section>
      <MobileNav active="profile" calendar={t.calendar} analytics={t.analytics} profile={t.profile} settings={t.settings} onSettings={() => setMobileMenu(true)}/>
      {mobileMenu && <div className="overlay mobile-sheet-overlay" onMouseDown={() => setMobileMenu(false)}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={t.settings} onMouseDown={(event) => event.stopPropagation()}><span className="sheet-handle"/><div className="mobile-sheet-head"><h2>{t.settings}</h2><button type="button" className="close" onClick={() => setMobileMenu(false)} aria-label={t.close}>×</button></div><div className="mobile-setting-row"><span>{t.theme}</span><button type="button" className="setting-action" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon/> : <Sun/>}{theme === "light" ? t.dark : t.light}</button></div><div className="mobile-setting-row"><span>{t.language}</span><label className="language"><Globe2 size={15}/><select aria-label={t.language} value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option><option value="cs">Čeština</option></select></label></div></section></div>}
    </main>
  );
}

