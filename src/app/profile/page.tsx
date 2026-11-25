"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { enUS, ru, cs } from "date-fns/locale";
import { loadUserShifts } from "@/lib/connecteam-client";
import type { Shift } from "@/lib/worklog";
import { ArrowLeft, Moon, Sun, UserRound, Target, Globe2, Save, LoaderCircle, CalendarDays, BarChart3, Trash2, WalletCards, CheckCircle2, Plus, CalendarClock, TrendingUp, CircleDollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Lang, money } from "@/lib/worklog";
import { MobileNav } from "@/components/mobile-nav";

type Theme = "light" | "dark";
type GoalType = "income" | "hours" | "";
type SaveState = "idle" | "saving" | "saved" | "error";
type SalaryPayment = { id: string; period_month: string; amount: number; paid_at: string };
type MonthSalary = { month: string; earned: number; received: number; unpaid: number; lastPaidAt: string | null; payments: SalaryPayment[] };

const text = {
  en: {
    salary:"My salary",salaryDescription:"Track what you earned, what you received and what is still owed.",earnedSalary:"Earned",receivedSalary:"Received",unpaidSalary:"Still owed",recordPayment:"Record payment",paymentAmount:"Amount received",paymentDate:"Payment date",addPayment:"Add payment",receivedButton:"Received",settleHint:"Mark the outstanding balance as paid and add it to your received total.",noDebt:"Nothing outstanding. Your salary is up to date.",paymentHistory:"Monthly history",paymentLog:"Payment dates",noPaymentsMonth:"No payments recorded for this month.",noHistory:"No salary history yet.",month:"Month",paidOn:"Paid",totalOwed:"Total still owed",paymentSaved:"Payment recorded",paymentSettled:"Outstanding balance marked as received",paymentError:"Could not save payment. Apply the salary payments migration first.",paymentInvalid:"Enter an amount greater than zero.",
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
    salary:"Моя зарплата",salaryDescription:"Контролируй начисления, полученные деньги и оставшуюся задолженность.",earnedSalary:"Начислено",receivedSalary:"Получено",unpaidSalary:"Не выдано",recordPayment:"Записать выплату",paymentAmount:"Сколько получил",paymentDate:"Дата получки",addPayment:"Добавить выплату",receivedButton:"Получил",settleHint:"Подтверди получение остатка. Сумма добавится к полученным деньгам.",noDebt:"Задолженности нет. Зарплата выплачена полностью.",paymentHistory:"История по месяцам",paymentLog:"Даты выплат",noPaymentsMonth:"В этом месяце выплат пока не было.",noHistory:"Истории выплат пока нет.",month:"Месяц",paidOn:"Получено",totalOwed:"Всего должны",paymentSaved:"Выплата записана",paymentSettled:"Остаток отмечен как полученный",paymentError:"Не удалось сохранить выплату. Сначала примени миграцию зарплат.",paymentInvalid:"Введи сумму больше нуля.",
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
    salary:"Moje výplata",salaryDescription:"Sledujte výdělek, přijaté peníze a zbývající dlužnou částku.",earnedSalary:"Vyděláno",receivedSalary:"Vyplaceno",unpaidSalary:"Zbývá vyplatit",recordPayment:"Zaznamenat výplatu",paymentAmount:"Přijatá částka",paymentDate:"Datum výplaty",addPayment:"Přidat výplatu",receivedButton:"Přijato",settleHint:"Potvrďte přijetí zbývající částky a přičtěte ji k vyplaceným penězům.",noDebt:"Žádný nedoplatek. Výplata je kompletní.",paymentHistory:"Měsíční historie",paymentLog:"Data výplat",noPaymentsMonth:"Tento měsíc zatím nebyly zaznamenány žádné výplaty.",noHistory:"Zatím žádná historie výplat.",month:"Měsíc",paidOn:"Vyplaceno",totalOwed:"Celkem dluženo",paymentSaved:"Výplata zaznamenána",paymentSettled:"Zbývající částka byla označena jako vyplacená",paymentError:"Výplatu se nepodařilo uložit. Nejprve použijte migraci výplat.",paymentInvalid:"Zadejte částku větší než nula.",
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
  const [hasGoal,setHasGoal]=useState(false);
  const [rateState,setRateState]=useState<SaveState>("idle");
  const [goalState,setGoalState]=useState<SaveState>("idle");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [profileFallback,setProfileFallback]=useState(false);
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [payments,setPayments]=useState<SalaryPayment[]>([]);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentDate,setPaymentDate]=useState(()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");});
  const [paymentState,setPaymentState]=useState<SaveState>("idle");
  const [paymentError,setPaymentError]=useState("");
  const [paymentNotice,setPaymentNotice]=useState("");
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
        const [full, shiftResult, paymentResult] = await Promise.all([
          supabase.from("profiles").select("hourly_rate,display_name,monthly_goal_type,monthly_goal_value").eq("id",user.id).maybeSingle(),
          loadUserShifts(user.id).then(rows=>({rows,error:null as unknown})).catch(error=>({rows:[] as Shift[],error})),
          supabase.from("salary_payments").select("id,period_month,amount,paid_at").eq("user_id",user.id).order("paid_at",{ascending:false}),
        ]);
        if(!active)return;
        if(!full.error&&full.data){
          setName(full.data.display_name||"");
          setRate(String(full.data.hourly_rate??150));
          setGoalType(full.data.monthly_goal_type==="income"||full.data.monthly_goal_type==="hours"?full.data.monthly_goal_type:"");
          setGoalValue(full.data.monthly_goal_value==null?"":String(full.data.monthly_goal_value));
          setHasGoal(Boolean(full.data.monthly_goal_type && full.data.monthly_goal_value != null));
        }else{
          const legacy=await supabase.from("profiles").select("hourly_rate,display_name").eq("id",user.id).maybeSingle();
          if(!active)return;
          if(!legacy.error&&legacy.data){setName(legacy.data.display_name||"");setRate(String(legacy.data.hourly_rate??150));}
          else{setProfileFallback(true);console.warn("Profile row unavailable; showing editable defaults",full.error||legacy.error);}
        }
        if(shiftResult.error)console.warn("Could not load shifts for salary summary",shiftResult.error);
        setShifts(shiftResult.rows);
        if(paymentResult.error){console.error("Salary payment history unavailable",paymentResult.error);setPaymentError("migration");}
        else setPayments((paymentResult.data||[]) as SalaryPayment[]);
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

  const locale = lang === "ru" ? ru : lang === "cs" ? cs : enUS;
  const now = new Date();
  const todayKey = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  const currentMonth = todayKey.slice(0,7);
  const monthSummaries = useMemo<MonthSalary[]>(()=>{
    const map = new Map<string,MonthSalary>();
    const ensure=(month:string)=>{if(!map.has(month))map.set(month,{month,earned:0,received:0,unpaid:0,lastPaidAt:null,payments:[]});return map.get(month)!;};
    for(const shift of shifts){if(shift.work_date>todayKey)continue;ensure(shift.work_date.slice(0,7)).earned+=Number(shift.hours||0)*Number(shift.hourly_rate||0);}
    for(const payment of payments){const row=ensure(payment.period_month.slice(0,7));row.received+=Number(payment.amount||0);row.payments.push(payment);if(!row.lastPaidAt||payment.paid_at>row.lastPaidAt)row.lastPaidAt=payment.paid_at;}
    for(const row of map.values())row.unpaid=Math.max(0,row.earned-row.received);
    ensure(currentMonth);
    return Array.from(map.values()).sort((a,b)=>b.month.localeCompare(a.month));
  },[shifts,payments,currentMonth,todayKey]);
  const [selectedSalaryMonth,setSelectedSalaryMonth]=useState(currentMonth);
  const selectedSalary=monthSummaries.find(row=>row.month===selectedSalaryMonth)||monthSummaries[0];
  const totalOwed=monthSummaries.reduce((sum,row)=>sum+row.unpaid,0);
  const monthLabel=(month:string)=>format(parseISO(month+"-01"),"LLLL yyyy",{locale});
  const dateLabel=(date:string)=>format(parseISO(date.slice(0,10)),"d MMM yyyy",{locale});
  async function addSalaryPayment(amount:number,successMessage:string){
    if(!userId||!supabase||!Number.isFinite(amount)||amount<=0)return;
    setPaymentState("saving");setPaymentError("");setPaymentNotice("");
    const paidAt=new Date(paymentDate+"T12:00:00").toISOString();
    const periodMonth=selectedSalaryMonth+"-01";
    const {data,error:insertError}=await supabase.from("salary_payments").insert({user_id:userId,period_month:periodMonth,amount,paid_at:paidAt}).select("id,period_month,amount,paid_at").single();
    if(insertError){console.error("Salary payment insert failed",insertError);setPaymentState("error");setPaymentError(t.paymentError);return;}
    setPayments(previous=>[data as SalaryPayment,...previous]);setPaymentAmount("");setPaymentState("saved");setPaymentNotice(successMessage);
    window.setTimeout(()=>setPaymentState("idle"),2200);
  }
  async function recordPartialPayment(){const amount=Number(paymentAmount);if(!Number.isFinite(amount)||amount<=0){setPaymentError(t.paymentInvalid);return;}await addSalaryPayment(amount,t.paymentSaved);}
  async function settleOutstanding(){const unpaid=selectedSalary?.unpaid||0;if(unpaid<=0){setPaymentNotice(t.noDebt);return;}await addSalaryPayment(unpaid,t.paymentSettled);}
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
    setHasGoal(true);setGoalState("saved");setNotice(t.goalSaved);window.setTimeout(()=>setGoalState("idle"),2200);
  }

  async function deleteGoal(){
    if(!userId||!supabase)return;
    setGoalState("saving");setError("");setNotice("");
    const {error:deleteError}=await supabase.from("profiles").update({
      monthly_goal_type:null,monthly_goal_value:null,
    }).eq("id",userId);
    if(deleteError){console.error("Monthly goal delete failed",deleteError);setGoalState("error");setError(t.goalError);return;}
    setGoalType("");setGoalValue("");setHasGoal(false);setGoalState("saved");setNotice(t.goalDeleted);
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
        <section className="salary-overview">
          <div className="salary-overview-head">
            <div><div className="salary-kicker"><WalletCards size={15}/>{t.salary}</div><h2>{monthLabel(selectedSalaryMonth)}</h2><p>{t.salaryDescription}</p></div>
            <label className="salary-month-select"><CalendarClock size={16}/><select aria-label={t.month} value={selectedSalaryMonth} onChange={e=>{setSelectedSalaryMonth(e.target.value);setPaymentNotice("");setPaymentError("");}}>{monthSummaries.map(row=><option key={row.month} value={row.month}>{monthLabel(row.month)}</option>)}</select></label>
          </div>
          <div className="salary-main-number"><span>{t.unpaidSalary}</span><strong>{money(selectedSalary?.unpaid||0)}</strong><small>{t.totalOwed}: {money(totalOwed)}</small></div>
          <div className="salary-stats">
            <div><span><TrendingUp size={14}/>{t.earnedSalary}</span><strong>{money(selectedSalary?.earned||0)}</strong></div>
            <div><span><CheckCircle2 size={14}/>{t.receivedSalary}</span><strong>{money(selectedSalary?.received||0)}</strong></div>
          </div>
          <div className="salary-payment-form">
            <div className="salary-form-title"><CircleDollarSign size={17}/><strong>{t.recordPayment}</strong></div>
            <div className="salary-form-fields">
              <label>{t.paymentAmount}<div className="salary-money-input"><input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} placeholder="0"/><span>Kč</span></div></label>
              <label>{t.paymentDate}<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label>
              <button type="button" className="primary salary-add-button" onClick={recordPartialPayment} disabled={paymentState==="saving"||!paymentAmount}><Plus size={16}/>{paymentState==="saving"?t.saving:t.addPayment}</button>
            </div>
            <div className="salary-settle-row"><div><strong>{t.receivedButton}</strong><span>{t.settleHint}</span></div><button type="button" className="salary-settle-button" onClick={settleOutstanding} disabled={paymentState==="saving"||!selectedSalary?.unpaid}><CheckCircle2 size={16}/>{t.receivedButton}</button></div>
            {selectedSalary?.unpaid===0&&<p className="salary-no-debt"><CheckCircle2 size={15}/>{t.noDebt}</p>}
            {(paymentError||paymentNotice)&&<p className={paymentError?"salary-error":"salary-notice"} role={paymentError?"alert":"status"}>{paymentError?t.paymentError:paymentNotice}</p>}
          </div>
          <div className="salary-payment-log">
            <div className="salary-history-heading"><h3>{t.paymentLog}</h3><span>{selectedSalary?.payments.length||0}</span></div>
            {selectedSalary?.payments.length ? <div className="salary-payment-list">{[...selectedSalary.payments].sort((a,b)=>b.paid_at.localeCompare(a.paid_at)).map(payment=><div className="salary-payment-item" key={payment.id}><span className="salary-payment-check"><CheckCircle2 size={15}/></span><span className="salary-payment-date">{dateLabel(payment.paid_at)}</span><strong>{money(payment.amount)}</strong></div>)}</div> : <p className="salary-empty">{t.noPaymentsMonth}</p>}
          </div>
          <div className="salary-history">
            <div className="salary-history-heading"><h3>{t.paymentHistory}</h3><span>{monthSummaries.length} {t.month.toLowerCase()}</span></div>
            {monthSummaries.length===1&&monthSummaries[0].earned===0&&monthSummaries[0].received===0?<p className="salary-empty">{t.noHistory}</p>:monthSummaries.map(row=><button type="button" className={`salary-history-row ${row.month===selectedSalaryMonth?"selected":""}`} key={row.month} onClick={()=>{setSelectedSalaryMonth(row.month);setPaymentNotice("");setPaymentError("");}}>
              <span className="salary-history-month"><strong>{monthLabel(row.month)}</strong>{row.lastPaidAt&&<small>{t.paidOn}: {dateLabel(row.lastPaidAt)}</small>}</span>
              <span className="salary-history-numbers"><small>{t.earnedSalary}: {money(row.earned)}</small><small>{t.receivedSalary}: {money(row.received)}</small></span>
              <span className={`salary-history-debt ${row.unpaid>0?"has-debt":""}`}>{row.unpaid>0?money(row.unpaid):"✓"}</span>
            </button>)}
          </div>
        </section>
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
            {(hasGoal||goalType||goalValue)&&<button type="button" className="profile-delete-goal" onClick={deleteGoal} disabled={goalState==="saving"}><Trash2 size={15}/>{t.deleteGoal}</button>}
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
