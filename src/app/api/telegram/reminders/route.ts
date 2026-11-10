import { NextResponse } from "next/server";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";

export const runtime = "nodejs";
type Lang = "en" | "ru" | "cs";
type Shift = { id:string; user_id:string; work_date:string; store:string; shift_name:string };
type Account = { linked_user_id:string; chat_id:number; language:Lang; reminders_enabled:boolean; reminder_minutes:number; timezone:string };

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] || c));
}
function zonedLocalToUtc(date:string,time:string,zone:string) {
  const [year,month,day]=date.split("-").map(Number);
  const [hour,minute]=time.split(":").map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute);
  let guess=target;
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  for(let i=0;i<4;i++){
    const p=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
    const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
    const diff=target-represented;
    if(!diff) break;
    guess+=diff;
  }
  return new Date(guess);
}
const templates:Record<Lang,(s:Shift,time:string,minutes:number)=>string>={
  en:(s,t,m)=>`🔔 <b>Shift reminder</b>\n\nYour shift at <b>${escapeHtml(s.store)}</b> starts in ${m} minutes.\n📅 ${s.work_date}\n🕒 Start: ${t}\n\nHave a good shift! 💪`,
  ru:(s,t,m)=>`🔔 <b>Напоминание о смене</b>\n\nТвоя смена в <b>${escapeHtml(s.store)}</b> начнётся через ${m} мин.\n📅 ${s.work_date}\n🕒 Начало: ${t}\n\nХорошей смены! 💪`,
  cs:(s,t,m)=>`🔔 <b>Připomenutí směny</b>\n\nTvoje směna v <b>${escapeHtml(s.store)}</b> začíná za ${m} minut.\n📅 ${s.work_date}\n🕒 Začátek: ${t}\n\nAť se daří! 💪`,
};

export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const db=createAdminClient();
    const today=new Date();
    const from=new Date(today.getTime()-86_400_000).toISOString().slice(0,10);
    const to=new Date(today.getTime()+3*86_400_000).toISOString().slice(0,10);
    const {data:shifts,error:shiftError}=await db.from("shifts")
      .select("id,user_id,work_date,store,shift_name")
      .gte("work_date",from).lte("work_date",to);
    if(shiftError) throw shiftError;
    const rows=(shifts||[]) as Shift[];
    if(!rows.length) return NextResponse.json({checked:0,sent:0});
    const ids=[...new Set(rows.map(s=>s.user_id))];
    const {data:accounts,error:accountError}=await db.from("telegram_accounts")
      .select("linked_user_id,chat_id,language,reminders_enabled,reminder_minutes,timezone")
      .in("linked_user_id",ids).eq("reminders_enabled",true);
    if(accountError) throw accountError;
    const byUser=new Map((accounts||[]).map((a:Account)=>[a.linked_user_id,a]));
    let sent=0, skipped=0, failed=0;
    for(const shift of rows){
      const account=byUser.get(shift.user_id);
      if(!account){skipped++;continue;}
      const match=shift.shift_name.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
      if(!match){skipped++;continue;}
      const label=`${match[1].padStart(2,"0")}:${match[2]}`;
      let starts:Date;
      try { starts=zonedLocalToUtc(shift.work_date,label,account.timezone||"Europe/Prague"); }
      catch { skipped++; continue; }
      const scheduled=new Date(starts.getTime()-account.reminder_minutes*60_000);
      const age=Date.now()-scheduled.getTime();
      if(age<0 || age>10*60_000 || starts.getTime()<=Date.now()){skipped++;continue;}
      const scheduledFor=scheduled.toISOString();
      const {data:existing,error:existingError}=await db.from("telegram_reminders")
        .select("id,status,attempts").eq("shift_id",shift.id).eq("scheduled_for",scheduledFor).maybeSingle();
      if(existingError) throw existingError;
      let reminderId:string|null=null;
      if(existing) {
        if(existing.status!=="failed" || Number(existing.attempts)>=3){skipped++;continue;}
        const {data:retry,error:retryError}=await db.from("telegram_reminders")
          .update({status:"processing",attempts:Number(existing.attempts)+1,last_error:null})
          .eq("id",existing.id).eq("status","failed").select("id").maybeSingle();
        if(retryError) throw retryError;
        reminderId=retry?.id||null;
      } else {
        const {data:created,error:createError}=await db.from("telegram_reminders")
          .insert({shift_id:shift.id,user_id:shift.user_id,scheduled_for:scheduledFor,status:"processing",attempts:1})
          .select("id").maybeSingle();
        if(createError?.code==="23505"){skipped++;continue;}
        if(createError) throw createError;
        reminderId=created?.id||null;
      }
      if(!reminderId){skipped++;continue;}
      try {
        const lang=(account.language in templates?account.language:"en") as Lang;
        await telegramApi("sendMessage",{
          chat_id:account.chat_id,
          text:templates[lang](shift,label,account.reminder_minutes),
          parse_mode:"HTML",
          reply_markup:{inline_keyboard:[[{text:lang==="ru"?"Открыть WorkLog":lang==="cs"?"Otevřít WorkLog":"Open WorkLog",web_app:{url:process.env.NEXT_PUBLIC_APP_URL!}}]]},
        });
        await db.from("telegram_reminders").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",reminderId);
        sent++;
      } catch(error) {
        await db.from("telegram_reminders").update({status:"failed",last_error:error instanceof Error?error.message.slice(0,500):"Delivery failed"}).eq("id",created.id);
        failed++;
      }
    }
    return NextResponse.json({checked:rows.length,sent,skipped,failed});
  } catch(error) {
    console.error("Telegram reminder scheduler failed",error);
    return NextResponse.json({error:"Unable to process shift reminders."},{status:500});
  }
}
