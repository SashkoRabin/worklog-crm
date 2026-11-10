import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";

export const runtime = "nodejs";
type Lang = "en" | "ru" | "cs";
type Update = {
  message?: { chat: { id: number; type?: string }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number } } };
};
const copy = {
  en: {
    choose: "Welcome to WorkLog! Choose your language.",
    welcome: "Welcome to WorkLog! 🚀\n\nManage shifts, track actual hours and understand your earnings. Open the website and use this bot as your guide.",
    open: "Open WorkLog", guide: "User guide", calendar: "Calendar & shifts", connecteam: "Connect Connecteam",
    earnings: "Hours & earnings", reminders: "Shift reminders", language: "Change language",
    on: "Turn reminders off", off: "Turn reminders on", enabled: "🔔 Reminders enabled. I’ll remind you 2 hours before each shift.",
    disabled: "🔕 Reminders disabled.", linked: "✅ Telegram connected! Shift reminders are enabled by default.",
    badLink: "This link is invalid, expired or already used. Generate a new one in WorkLog → Telegram.",
    overview: "<b>Getting started</b>\n1. Sign in or create a WorkLog account.\n2. Use the calendar to view and add shifts.\n3. Record actual hours for accurate earnings.\n4. Open Analytics to compare months and workplaces.\n5. Connect Telegram to receive reminders.",
    guideCalendar: "<b>Calendar & shifts</b>\nSelect a date to add or edit a shift. Enter workplace, shift type, hours and rate. Planned Connecteam shifts are separate from actual work. Only recorded work contributes to earned income.",
    guideConnecteam: "<b>Connecteam</b>\nOpen WorkLog → Settings → Connecteam. Paste your personal Calendar Sync link and tap Connect & sync. Imported shifts are planned shifts, not confirmed earnings.",
    guideEarnings: "<b>Hours & earnings</b>\nEarnings are calculated from recorded hours multiplied by the hourly rate saved on each shift. Check your default rate in Settings. Analytics shows monthly hours and income.",
    guideReminders: "<b>Shift reminders</b>\nAfter linking your account, reminders are enabled by default. I’ll message you 2 hours before a shift. Change this setting in the bot menu or WorkLog → Telegram.",
  },
  ru: {
    choose: "Добро пожаловать в WorkLog! Выбери язык.",
    welcome: "Добро пожаловать в WorkLog! 🚀\n\nУправляй сменами, учитывай фактические часы и следи за заработком. Открой сайт и используй бота как персонального помощника.",
    open: "Открыть WorkLog", guide: "Руководство", calendar: "Календарь и смены", connecteam: "Подключение Connecteam",
    earnings: "Часы и заработок", reminders: "Напоминания о сменах", language: "Изменить язык",
    on: "Выключить напоминания", off: "Включить напоминания", enabled: "🔔 Напоминания включены. Буду писать за 2 часа до каждой смены.",
    disabled: "🔕 Напоминания выключены.", linked: "✅ Telegram подключён к WorkLog. Напоминания включены по умолчанию.",
    badLink: "Ссылка недействительна, устарела или уже использована. Создай новую в WorkLog → Telegram.",
    overview: "<b>Начало работы</b>\n1. Войди в WorkLog или создай аккаунт.\n2. Используй календарь для просмотра и добавления смен.\n3. Вноси фактические часы для расчёта заработка.\n4. Открывай Аналитику для сравнения месяцев и рабочих мест.\n5. Подключи Telegram для получения напоминаний.",
    guideCalendar: "<b>Календарь и смены</b>\nВыбери дату, чтобы добавить или изменить смену. Укажи рабочее место, тип смены, часы и ставку. Плановые смены Connecteam отделены от фактической работы. В заработок попадают только внесённые фактические часы.",
    guideConnecteam: "<b>Connecteam</b>\nОткрой WorkLog → Настройки → Connecteam. Вставь личную ссылку Calendar Sync и нажми «Подключить и синхронизировать». Импортированные смены являются плановыми, а не подтверждённым заработком.",
    guideEarnings: "<b>Часы и заработок</b>\nЗаработок рассчитывается как фактические часы × ставка, сохранённая в смене. Проверь ставку по умолчанию в настройках. Аналитика показывает часы и доход за месяцы.",
    guideReminders: "<b>Напоминания о сменах</b>\nПосле привязки аккаунта напоминания включены по умолчанию. Я напишу за 2 часа до смены. Управлять настройкой можно в меню бота или WorkLog → Telegram.",
  },
  cs: {
    choose: "Vítej ve WorkLogu! Vyber si jazyk.",
    welcome: "Vítej ve WorkLogu! 🚀\n\nSpravuj směny, eviduj skutečně odpracované hodiny a sleduj svůj výdělek. Otevři web a používej tohoto bota jako průvodce.",
    open: "Otevřít WorkLog", guide: "Uživatelský návod", calendar: "Kalendář a směny", connecteam: "Připojení Connecteam",
    earnings: "Hodiny a výdělek", reminders: "Připomenutí směn", language: "Změnit jazyk",
    on: "Vypnout připomenutí", off: "Zapnout připomenutí", enabled: "🔔 Připomenutí jsou zapnutá. Upozorním tě 2 hodiny před směnou.",
    disabled: "🔕 Připomenutí jsou vypnutá.", linked: "✅ Telegram je propojen s WorkLogem. Připomenutí jsou ve výchozím nastavení zapnutá.",
    badLink: "Odkaz je neplatný, vypršel nebo už byl použit. Vytvoř nový ve WorkLog → Telegram.",
    overview: "<b>Začínáme</b>\n1. Přihlas se do WorkLogu nebo vytvoř účet.\n2. V kalendáři zobraz a přidávej směny.\n3. Zadej skutečně odpracované hodiny.\n4. V Analytice porovnáš měsíce a pracoviště.\n5. Propoj Telegram pro připomenutí.",
    guideCalendar: "<b>Kalendář a směny</b>\nVyber datum pro přidání nebo úpravu směny. Zadej pracoviště, typ směny, hodiny a sazbu. Plánované směny Connecteam jsou oddělené od skutečné práce. Výdělek vychází pouze ze zaznamenaných hodin.",
    guideConnecteam: "<b>Connecteam</b>\nOtevři WorkLog → Nastavení → Connecteam. Vlož osobní odkaz Calendar Sync a klikni na Připojit a synchronizovat. Importované směny jsou plánované, nikoli potvrzený výdělek.",
    guideEarnings: "<b>Hodiny a výdělek</b>\nVýdělek se počítá jako skutečně odpracované hodiny × sazba uložená u směny. Výchozí sazbu najdeš v Nastavení. Analytika zobrazuje měsíční hodiny a příjmy.",
    guideReminders: "<b>Připomenutí směn</b>\nPo propojení účtu jsou připomenutí ve výchozím nastavení zapnutá. Napíšu ti 2 hodiny před směnou. Nastavení změníš v nabídce bota nebo WorkLog → Telegram.",
  },
} as const;
function matchSecret(a: string | null, b: string) { if (!a) return false; const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
async function menu(chatId: number, lang: Lang, enabled: boolean) {
  const t=copy[lang];
  await telegramApi("sendMessage", { chat_id:chatId, text:t.welcome, reply_markup:{inline_keyboard:[
    [{text:t.open,web_app:{url:process.env.NEXT_PUBLIC_APP_URL!}}],
    [{text:t.guide,callback_data:"guide:overview"}],
    [{text:t.calendar,callback_data:"guide:calendar"},{text:t.connecteam,callback_data:"guide:connecteam"}],
    [{text:t.earnings,callback_data:"guide:earnings"},{text:t.reminders,callback_data:"guide:reminders"}],
    [{text:enabled?t.on:t.off,callback_data:"reminders:toggle"}],
    [{text:t.language,callback_data:"language:choose"}],
  ]}});
}
export async function POST(request: Request) {
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
  if(!secret) return NextResponse.json({error:"Telegram webhook is not configured."},{status:503});
  if(!matchSecret(request.headers.get("x-telegram-bot-api-secret-token"),secret)) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const update=await request.json() as Update, db=createAdminClient();
    const msg=update.message;
    if(msg?.from && msg.chat.type!=="group" && msg.chat.type!=="supergroup") {
      const id=msg.from.id, chat=msg.chat.id;
      await db.from("telegram_accounts").upsert({telegram_user_id:id,chat_id:chat},{onConflict:"telegram_user_id",ignoreDuplicates:true});
      const {data:account,error}=await db.from("telegram_accounts").select("language,reminders_enabled").eq("telegram_user_id",id).single();
      if(error) throw error;
      const t=copy[account.language as Lang] || copy.en;
      const payload=msg.text?.match(/^\/start(?:\s+(.+))?/i)?.[1];
      if(payload?.startsWith("link_")) {
        const hash=createHash("sha256").update(payload.slice(5)).digest("hex");
        const {data:link}=await db.from("telegram_link_tokens").select("id,user_id").eq("token_hash",hash).is("used_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
        if(!link) await telegramApi("sendMessage",{chat_id:chat,text:t.badLink});
        else {
          const {data:claimed,error:claimError}=await db.from("telegram_link_tokens").update({used_at:new Date().toISOString()}).eq("id",link.id).is("used_at",null).select("id").maybeSingle();
          if(claimError) throw claimError;
          if(!claimed) await telegramApi("sendMessage",{chat_id:chat,text:t.badLink});
          else {
            const {error:linkError}=await db.from("telegram_accounts").update({linked_user_id:link.user_id,linked_at:new Date().toISOString(),reminders_enabled:true,reminder_minutes:120}).eq("telegram_user_id",id);
            if(linkError) throw linkError;
            await telegramApi("sendMessage",{chat_id:chat,text:t.linked});
            await menu(chat,account.language as Lang,true);
          }
        }
      } else if(msg.text?.startsWith("/start")) {
        await telegramApi("sendMessage",{chat_id:chat,text:copy.en.choose+"\n🇬🇧 English\n🇷🇺 Русский\n🇨🇿 Čeština",reply_markup:{inline_keyboard:[[{text:"🇬🇧 English",callback_data:"lang:en"},{text:"🇷🇺 Русский",callback_data:"lang:ru"},{text:"🇨🇿 Čeština",callback_data:"lang:cs"}]]}});
      } else if(msg.text?.startsWith("/menu") || msg.text?.startsWith("/help")) {
        const lang=account.language as Lang;
        await menu(chat,lang,account.reminders_enabled);
      }
    }
    if(update.callback_query) {
      const q=update.callback_query, chat=q.message?.chat.id;
      if(chat===undefined) return NextResponse.json({ok:true});
      const {data:account,error}=await db.from("telegram_accounts").select("language,reminders_enabled").eq("telegram_user_id",q.from.id).single();
      if(error) throw error;
      let lang=account.language as Lang;
      if(q.data?.startsWith("lang:")) {
        const value=q.data.slice(5) as Lang;
        if(value in copy) { lang=value; await db.from("telegram_accounts").update({language:lang}).eq("telegram_user_id",q.from.id); await telegramApi("answerCallbackQuery",{callback_query_id:q.id}); await menu(chat,lang,account.reminders_enabled); }
      } else if(q.data==="language:choose") {
        await telegramApi("answerCallbackQuery",{callback_query_id:q.id});
        await telegramApi("sendMessage",{chat_id:chat,text:copy.en.choose,reply_markup:{inline_keyboard:[[{text:"🇬🇧 English",callback_data:"lang:en"},{text:"🇷🇺 Русский",callback_data:"lang:ru"},{text:"🇨🇿 Čeština",callback_data:"lang:cs"}]]}});
      } else if(q.data?.startsWith("guide:")) {
        const section=q.data.slice(6), key=section==="calendar"?"guideCalendar":section==="connecteam"?"guideConnecteam":section==="earnings"?"guideEarnings":section==="reminders"?"guideReminders":"overview";
        const guide=section==="overview"?copy[lang].overview:copy[lang][key as "guideCalendar"|"guideConnecteam"|"guideEarnings"|"guideReminders"];
        await telegramApi("answerCallbackQuery",{callback_query_id:q.id});
        await telegramApi("sendMessage",{chat_id:chat,text:guide,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:copy[lang].open,web_app:{url:process.env.NEXT_PUBLIC_APP_URL!}}]]}});
      } else if(q.data==="reminders:toggle") {
        const enabled=!account.reminders_enabled;
        await db.from("telegram_accounts").update({reminders_enabled:enabled}).eq("telegram_user_id",q.from.id);
        await telegramApi("answerCallbackQuery",{callback_query_id:q.id});
        await telegramApi("sendMessage",{chat_id:chat,text:enabled?copy[lang].enabled:copy[lang].disabled});
        await menu(chat,lang,enabled);
      } else await telegramApi("answerCallbackQuery",{callback_query_id:q.id});
    }
    return NextResponse.json({ok:true});
  } catch(error) { console.error("Telegram webhook failed",error); return NextResponse.json({error:"Unable to process Telegram update."},{status:500}); }
}
