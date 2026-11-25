"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Moon, Sun, UserRound, Target, Globe2, Save, LoaderCircle, CalendarDays, BarChart3, Trash2, Pencil, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Lang, money } from "@/lib/worklog";
import { MobileNav } from "@/components/mobile-nav";

type Theme = "light" | "dark";
type GoalType = "income" | "hours" | "";
type SaveState = "idle" | "saving" | "saved" | "error";

const text = {
  en: {
    eyebrow:"YOUR ACCOUNT",title:"Profile",description:"Manage your hourly rate and monthly target.",
    rate:"Hourly rate",rateHint:"Your default rate for new shifts. Existing shifts keep their saved rate.",
    saveRate:"Save rate",saving:"Saving…",saved:"Saved",rateError:"Could not save hourly rate. Please try again.",
    goal:"Monthly goal",goalHint:"Set an earnings or work-hours target. You can change or remove it at any time.",
    goalType:"I want to",incomeGoal:"Earn money",hoursGoal:"Work hours",amount:"Target amount",
    noGoal:"No monthly goal set",setGoal:"Set goal",updateGoal:"Save goal",deleteGoal:"Delete goal",
    goalSaved:"Monthly goal saved",goalDeleted:"Monthly goal deleted",goalError:"Could not save monthly goal. Check the database migration and try again.",
    estimateHours:"Hours needed to reach your earnings goal",estimateEarn:"Estimated earnings for your hours goal",
    hours:"hours",currency:"CZK",invalid:"Enter a value greater than zero.",load:"Loading account…",
    login:"Sign in to manage your profile",signIn:"Sign in",calendar:"Calendar",analytics:"Analytics",profile:"Profile",settings:"Settings",
    theme:"Appearance",language:"Language",dark:"Dark mode",light:"Light mode",close:"Close",
    name:"Display name",nameHint:"Shown in your dashboard greeting",personal:"Personal details",saveName:"Save name",
    fallback:"Your settings are ready. Existing profile values will appear after the profile record is available.",
  },
  ru: {
    eyebrow:"ТВОЙ АККАУНТ",title:"Профиль",description:"Управляй почасовой ставкой и целью на месяц.",
    rate:"Почасовая ставка",rateHint:"Ставка по умолчанию для новых смен. У существующих смен сохраняется прежняя ставка.",
    saveRate:"Сохранить ставку",saving:"Сохранение…",saved:"Сохранено",rateError:"Не удалось сохранить ставку. Попробуй ещё раз.",
    goal:"Цель на месяц",goalHint:"Укажи желаемый заработок или количество часов. Цель можно изменить или удалить в любой момент.",
    goalType:"Я хочу",incomeGoal:"Заработать",hoursGoal:"Отработать часов",amount:"Целевое значение",
    noGoal:"Цель на месяц не установлена",setGoal:"Указать цель",updateGoal:"Сохранить цель",deleteGoal:"Удалить цель",
    goalSaved:"Цель на месяц сохранена",goalDeleted:"Цель на месяц удалена",goalError:"Не удалось сохранить цель. Проверь миграцию базы данных и попробуй ещё раз.",
    estimateHours:"Сколько часов нужно отработать",estimateEarn:"Примерный заработок за указанные часы",
    hours:"часов",currency:"Kč",invalid:"Введи значение больше нуля.",load:"Загружаем аккаунт…",
    login:"Войди в аккаунт, чтобы управлять профилем",signIn:"Войти",calendar:"Календарь",analytics:"Аналитика",profile:"Профиль",settings:"Настройки",
    theme:"Оформление",language:"Язык",dark:"Тёмная тема",light:"Светлая тема",close:"Закрыть",
    name:"Имя",nameHint:"Отображается в приветствии на главной",personal:"Личные данные",saveName:"Сохранить имя",
    fallback:"Настройки доступны. Сохранённые значения появятся, когда запись профиля станет доступна.",
  },
  cs: {
    eyebrow:"VÁŠ ÚČET",title:"Profil",description:"Spravujte hodinovou sazbu a měsíční cíl.",
    rate:"Hodinová sazba",rateHint:"Výchozí sazba pro nové směny. Starší směny si zachovají uloženou sazbu.",
    saveRate:"Uložit sazbu",saving:"Ukládání…",saved:"Uloženo",rateError:"Hodinovou sazbu se nepodařilo uložit. Zkuste to znovu.",
    goal:"Měsíční cíl",goalHint:"Nastavte cílový výdělek nebo počet hodin. Cíl můžete kdykoli změnit nebo odstranit.",
    goalType:"Chci",incomeGoal:"Vydělat",hoursGoal:"Odpracovat hodin",amount:"Cílová hodnota",
    noGoal:"Měsíční cíl není nastaven",setGoal:"Nastavit cíl",updateGoal:"Uložit cíl",deleteGoal:"Smazat cíl",
    goalSaved:"Měsíční cíl uložen",goalDeleted:"Měsíční cíl smazán",goalError:"Měsíční cíl se nepodařilo uložit. Zkontrolujte migraci databáze a zkuste to znovu.",
    estimateHours:"Počet hodin potřebných k dosažení cíle",estimateEarn:"Odhadovaný výdělek za zadaný počet hodin",
    hours:"hodin",currency:"Kč",invalid:"Zadejte hodnotu větší než nula.",load:"Načítání účtu…",
    login:"Pro správu profilu se přihlaste",signIn:"Přihlásit se",calendar:"Kalendář",analytics:"Analytika",profile:"Profil",settings:"Nastavení",
    theme:"Vzhled",language:"Jazyk",dark:"Tmavý režim",light:"Světlý režim",close:"Zavřít",
    name:"Jméno",nameHint:"Zobrazí se v pozdravu na hlavní stránce",personal:"Osobní údaje",saveName:"Uložit jméno",
    fallback:"Nastavení jsou dostupná. Uložené hodnoty se zobrazí, jakmile bude záznam profilu dostupný.",
  },
} as const;

const readTheme = (): Theme => {
  if (typeof document === "undefined") return "light";
  return (document.cookie.match(/(?:^|; )worklog-theme=(light|dark)(?:;|$)/)?.[1] as Theme) || "light";
};

export default function ProfilePage() {
  const [lang,setLang]=useState<Lang>("en");
  const [theme,setTheme]=useState<Theme>(()=>readTheme());
  const [userId,setUserId]=useState<string|null>(null);
  const [email,setEmail]=useState("");
  const [mobileMenu,setMobileMenu]=useState(false);
  const [name,setName]=useState("");
  const [rate,setRate]=useState("150");
  const [goalType,setGoalType]=useState<GoalType>("");
  const [goalValue,setGoalValue]=useState("");
  const [rateState,setRateState]=useState<SaveState>("idle");
  const [goalState,setGoalState]=useState<SaveState>("idle");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [profileFallback,setProfileFallback]=useState(false);
  const t=text[lang];

  useEffect(()=>{
    const savedLang=localStorage.getItem("worklog-lang") as Lang|null;
    const savedTheme=(readTheme()||localStorage.getItem("worklog-theme")) as Theme|null;
    if(savedLang&&["en","ru","cs"].includes(savedLang))setLang(savedLang);
    if(savedTheme)setTheme(savedTheme);
    document.documentElement.dataset.theme=savedTheme||"light";
    let active=true;
    const load=async()=>{
      try{
        if(!supabase)throw new Error("Supabase is not configured");
        const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
        if(sessionError)throw sessionError;
        const user=sessionData.session?.user;
        if(!user){if(active)setLoading(false);return;}
        if(!active)return;
        setUserId(user.id);setEmail(user.email||"");
        // maybeSingle handles a first-time account with no profile row. If the
        // monthly-goal migration is not deployed yet, fall back to legacy fields.
        const full=await supabase.from("profiles")
          .select("hourly_rate,display_name,monthly_goal_type,monthly_goal_value")
          .eq("id",user.id).maybeSingle();
        if(!active)return;
        if(!full.error&&full.data){
          setName(full.data.display_name||"");
          setRate(String(full.data.hourly_rate??150));
          setGoalType(full.data.monthly_goal_type==="income"||full.data.monthly_goal_type==="hours"?full.data.monthly_goal_type:"");
          setGoalValue(full.data.monthly_goal_value==null?"":String(full.data.monthly_goal_value));
        }else{
          const legacy=await supabase.from("profiles").select("hourly_rate,display_name").eq("id",user.id).maybeSingle();
          if(!active)return;
          if(!legacy.error&&legacy.data){
            setName(legacy.data.display_name||"");
            setRate(String(legacy.data.hourly_rate??150));
          }else{
            setProfileFallback(true);
            console.warn("Profile row unavailable; showing editable defaults",full.error||legacy.error);
          }
        }
      }catch(e){
        console.warn("Profile initialization; showing editable defaults",e);
        if(active)setProfileFallback(true);
      }finally{if(active)setLoading(false);}
    };
    void load();
    return()=>{active=false;};
  },[]);

  useEffect(()=>{localStorage.setItem("worklog-lang",lang);},[lang]);
  useEffect(()=>{
    localStorage.setItem("worklog-theme",theme);
    document.cookie=`worklog-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.dataset.theme=theme;
  },[theme]);

  const numericRate=Math.max(0,Number(rate)||0);
  const numericGoal=Math.max(0,Number(goalValue)||0);
  const estimate=useMemo(()=>{
    if(!goalType||numericGoal<=0)return null;
    return goalType==="income"
      ?{label:t.estimateHours,value:numericRate>0?`${(numericGoal/numericRate).toFixed(1)} ${t.hours}`:"—"}
      :{label:t.estimateEarn,value:money(numericGoal*numericRate)};
  },[goalType,numericGoal,numericRate,t]);

  async function saveRate(){
    if(!userId||!supabase)return;
    if(!Number.isFinite(numericRate)||numericRate<0){setError(t.invalid);return;}
    setRateState("saving");setError("");setNotice("");
    const {error:saveError}=await supabase.from("profiles").upsert({id:userId,hourly_rate:numericRate,display_name:name.trim()||null},{onConflict:"id"});
    if(saveError){console.error("Hourly rate save failed",saveError);setRateState("error");setError(t.rateError);return;}
    setRateState("saved");setNotice(t.saved);window.setTimeout(()=>setRateState("idle"),2200);
  }

  async function saveGoal(){
    if(!userId||!supabase)return;
    if(!goalType||numericGoal<=0){setError(t.invalid);return;}
    setGoalState("saving");setError("");setNotice("");
    const {error:saveError}=await supabase.from("profiles").upsert({
      id:userId,monthly_goal_type:goalType,monthly_goal_value:numericGoal,
    },{onConflict:"id"});
    if(saveError){console.error("Monthly goal save failed",saveError);setGoalState("error");setError(t.goalError);return;}
    setGoalState("saved");setNotice(t.goalSaved);window.setTimeout(()=>setGoalState("idle"),2200);
  }

  async function deleteGoal(){
    if(!userId||!supabase)return;
    setGoalState("saving");setError("");setNotice("");
    const {error:deleteError}=await supabase.from("profiles").update({
      monthly_goal_type:null,monthly_goal_value:null,
    }).eq("id",userId);
    if(deleteError){console.error("Monthly goal delete failed",deleteError);setGoalState("error");setError(t.goalError);return;}
    setGoalType("");setGoalValue("");setGoalState("saved");setNotice(t.goalDeleted);
    window.setTimeout(()=>setGoalState("idle"),2200);
  }

  async function saveName(){
    if(!userId||!supabase)return;
    const {error:saveError}=await supabase.from("profiles").upsert({id:userId,display_name:name.trim()||null},{onConflict:"id"});
    if(saveError){setError(t.rateError);return;}
    setNotice(t.saved);
  }

  return <main className={`app-shell ${theme==="dark"?"theme-dark":""}`}>
    <aside className="sidebar">
      <div className="brand"><Image className="brand-logo" src="/yk-logo.png" alt="YK" width={36} height={36} priority/><span className="brand-name">YK WorkLog</span></div>
      <nav><Link href="/"><CalendarDays/>{t.calendar}</Link><Link href="/analytics"><BarChart3/>{t.analytics}</Link><a className="active" aria-current="page"><UserRound/>{t.profile}</a></nav>
      <div className="sidebar-bottom">
        <label className="language"><Globe2 size={15}/><select aria-label={t.language} value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option><option value="cs">Čeština</option></select></label>
        <button onClick={()=>setTheme(theme==="light"?"dark":"light")}>{theme==="light"?<Moon/>:<Sun/>}{theme==="light"?t.dark:t.light}</button><small>{email}</small>
      </div>
    </aside>
    <section className="content profile-page">
      <header className="profile-header"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="profile-description">{t.description}</p></div><Link href="/" className="profile-back"><ArrowLeft size={16}/>{t.calendar}</Link></header>
      {loading?<section className="card profile-state"><LoaderCircle className="spin"/>{t.load}</section>
      :!userId?<section className="card profile-state"><p>{t.login}</p><Link className="primary" href="/login">{t.signIn}</Link></section>
      :<div className="profile-layout">
        <section className="card profile-card">
          <div className="profile-card-heading"><span className="an-icon"><UserRound/></span><div><h2>{t.personal}</h2><p>{email}</p></div></div>
          <label className="profile-field">{t.name}<small>{t.nameHint}</small><input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder={t.name}/></label>
          <button type="button" className="primary profile-save" onClick={saveName}><Save size={16}/>{t.saveName}</button>
        </section>
        <section className="card profile-card">
          <div className="profile-card-heading"><span className="an-icon"><UserRound/></span><div><h2>{t.rate}</h2><p>{t.rateHint}</p></div></div>
          <label className="profile-field">{t.rate}<div className="profile-input-with-unit"><input type="number" min="0" step="1" value={rate} onChange={e=>{setRate(e.target.value);setRateState("idle");}} required/><span>{t.currency} / h</span></div></label>
          <button type="button" className="primary profile-save" onClick={saveRate} disabled={rateState==="saving"}><Save size={16}/>{rateState==="saving"?t.saving:rateState==="saved"?t.saved:t.saveRate}</button>
        </section>
        <section className="card profile-card profile-goal-card">
          <div className="profile-card-heading"><span className="an-icon"><Target/></span><div><h2>{t.goal}</h2><p>{t.goalHint}</p></div></div>
          <label className="profile-field">{t.goalType}
            <select value={goalType} onChange={e=>{setGoalType(e.target.value as GoalType);setGoalValue("");setGoalState("idle");setError("");}}>
              <option value="">{t.noGoal}</option><option value="income">{t.incomeGoal}</option><option value="hours">{t.hoursGoal}</option>
            </select>
          </label>
          {goalType&&<label className="profile-field">{t.amount}<div className="profile-input-with-unit"><input type="number" min="0.1" step="0.1" value={goalValue} onChange={e=>{setGoalValue(e.target.value);setGoalState("idle");setError("");}} required/><span>{goalType==="income"?t.currency:t.hours}</span></div></label>}
          {estimate&&<div className="profile-estimate"><span>{estimate.label}</span><strong>{estimate.value}</strong></div>}
          <div className="profile-goal-actions">
            {goalType&&<button type="button" className="primary profile-save" onClick={saveGoal} disabled={goalState==="saving"}><Save size={16}/>{goalState==="saving"?t.saving:goalState==="saved"?t.saved:t.updateGoal}</button>}
            {(goalType||goalValue)&&<button type="button" className="profile-delete-goal" onClick={deleteGoal} disabled={goalState==="saving"}><Trash2 size={15}/>{t.deleteGoal}</button>}
            {!goalType&&<p className="profile-no-goal">{t.noGoal}</p>}
          </div>
        </section>
        {profileFallback&&<p className="profile-fallback-note">{t.fallback}</p>}
        {(error||notice)&&<div className={error?"profile-error":"profile-notice"} role={error?"alert":"status"}>{error||notice}</div>}
      </div>}
    </section>
    <MobileNav active="profile" calendar={t.calendar} analytics={t.analytics} profile={t.profile} settings={t.settings} onSettings={()=>setMobileMenu(true)}/>
    {mobileMenu&&<div className="overlay mobile-sheet-overlay" onMouseDown={()=>setMobileMenu(false)}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={t.settings} onMouseDown={e=>e.stopPropagation()}><span className="sheet-handle"/><div className="mobile-sheet-head"><h2>{t.settings}</h2><button type="button" className="close" onClick={()=>setMobileMenu(false)} aria-label={t.close}>×</button></div><div className="mobile-setting-row"><span>{t.theme}</span><button type="button" className="setting-action" onClick={()=>setTheme(theme==="light"?"dark":"light")}>{theme==="light"?<Moon/>:<Sun/>}{theme==="light"?t.dark:t.light}</button></div><div className="mobile-setting-row"><span>{t.language}</span><label className="language"><Globe2 size={15}/><select aria-label={t.language} value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option><option value="cs">Čeština</option></select></label></div></section></div>}
  </main>;
}
