import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient, telegramApi } from "@/lib/telegram-server";
import { ADMIN_TELEGRAM_ID, ADMIN_USERNAME, copy, getLanguage, type Lang, type Update } from "./config";
import { escapeHtml } from "./utils";
import { menuKeyboard, sendMenu } from "./menu";
import { showStaffHome, showStaffLocations, showStaffDates, showStaffForDate, showStaffEmployees, showStaffEmployeeWeek } from "./features/staff";
import { showSchedule, showMonthShifts, showEarnings, showGuide, toggleReminders } from "./features/dashboard";
import { showStaffLeaderboard } from "./features/staff-leaderboard";

function matchSecret(received: string | null, expected: string) {
  if (!received) return false;
  const actual = Buffer.from(received), target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export async function handleTelegramWebhook(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Telegram webhook is not configured." }, { status: 503 });
  if (!matchSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const update = await request.json() as Update, db = createAdminClient(), msg = update.message;
    if (msg?.from && msg.chat.type !== "group" && msg.chat.type !== "supergroup") {
      const id = msg.from.id, chat = msg.chat.id;
      await db.from("telegram_accounts").upsert({ telegram_user_id: id, chat_id: chat }, { onConflict: "telegram_user_id", ignoreDuplicates: true });
      const { data: account, error } = await db.from("telegram_accounts").select("language,reminders_enabled,timezone,linked_user_id").eq("telegram_user_id", id).single();
      if (error) throw error;
      const lang = getLanguage(account.language), t = copy[lang];
      if (id === ADMIN_TELEGRAM_ID && /^\/broadcast(?:@\w+)?$/i.test(msg.text?.trim() || "")) {
        await telegramApi("sendMessage", { chat_id: chat, text: "Использование: /broadcast текст сообщения" });
        return NextResponse.json({ ok: true });
      }
      const broadcastCommand = msg.text?.match(/^\/broadcast(?:@\w+)?\s+([\s\S]+)$/i);
      if (id === ADMIN_TELEGRAM_ID && broadcastCommand) {
        const message = broadcastCommand[1].trim();
        if (!message || message.length > 4000) {
          await telegramApi("sendMessage", { chat_id: chat, text: "Текст рассылки должен содержать от 1 до 4000 символов." });
        } else {
          const { data: draft, error: draftError } = await db.from("telegram_broadcasts")
            .insert({ message, created_by: id, status: "draft" }).select("id").single();
          if (draftError) {
            console.error("Telegram broadcast table is unavailable", draftError);
            await telegramApi("sendMessage", {
              chat_id: chat,
              text: "Функция рассылки пока не настроена в Supabase. Выполни миграцию supabase/telegram-admin-migration.sql.",
            });
            return NextResponse.json({ ok: true });
          }
          await telegramApi("sendMessage", {
            chat_id: chat,
            text: `Предпросмотр рассылки от @${ADMIN_USERNAME}:\n\n${message}\n\nОтправить всем пользователям с привязанным Telegram?`,
            reply_markup: { inline_keyboard: [[
              { text: "📢 Отправить", callback_data: `broadcast:send:${draft.id}` },
              { text: "Отмена", callback_data: `broadcast:cancel:${draft.id}` },
            ]] },
          });
        }
        return NextResponse.json({ ok: true });
      }
      const payload = msg.text?.match(/^\/start(?:\s+(.+))?/i)?.[1];
      if (payload?.startsWith("link_")) {
        const hash = createHash("sha256").update(payload.slice(5)).digest("hex");
        const { data: link } = await db.from("telegram_link_tokens").select("id,user_id").eq("token_hash", hash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!link) await telegramApi("sendMessage", { chat_id: chat, text: t.badLink });
        else {
          const { data: claimed, error: claimError } = await db.from("telegram_link_tokens").update({ used_at: new Date().toISOString() }).eq("id", link.id).is("used_at", null).select("id").maybeSingle();
          if (claimError) throw claimError;
          if (!claimed) await telegramApi("sendMessage", { chat_id: chat, text: t.badLink });
          else {
            const { error: linkError } = await db.from("telegram_accounts").update({ linked_user_id: link.user_id, linked_at: new Date().toISOString(), reminders_enabled: true, reminder_minutes: 120 }).eq("telegram_user_id", id);
            if (linkError) throw linkError;
            await telegramApi("sendMessage", { chat_id: chat, text: t.linked, parse_mode: "HTML" });
            await sendMenu(chat, lang, true, true);
          }
        }
      } else if (msg.text?.startsWith("/start")) {
        await telegramApi("sendMessage", { chat_id: chat, text: copy.en.choose, reply_markup: { inline_keyboard: [[{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇨🇿 Čeština", callback_data: "lang:cs" }]] } });
      } else if (msg.text?.startsWith("/menu") || msg.text?.startsWith("/help")) {
        await sendMenu(chat, lang, account.reminders_enabled, true);
      } else if (msg.text === t.open) {
        await telegramApi("sendMessage", { chat_id: chat, text: t.menuHint, reply_markup: menuKeyboard(lang, account.reminders_enabled) });
      } else if (msg.text === t.guideMenu) {
        await showGuide(chat, lang);
      } else if (msg.text === t.schedule) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showSchedule(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === t.monthShifts) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showMonthShifts(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === t.earnings) {
        if (!account.linked_user_id) await telegramApi("sendMessage", { chat_id: chat, text: lang === "ru" ? "Сначала привяжите Telegram к аккаунту WorkLog на сайте → Telegram." : "Connect your Telegram account to WorkLog first." });
        else await showEarnings(chat, account.linked_user_id, lang, account.timezone || "Europe/Prague");
      } else if (msg.text === "/staff" || msg.text === "👥 Сотрудники") {
        if (id !== ADMIN_TELEGRAM_ID) await telegramApi("sendMessage", { chat_id: chat, text: "Эта команда доступна только администратору." });
        else await showStaffHome(chat);
      } else if (msg.text === t.remindersOn || msg.text === t.remindersOff) {
        await toggleReminders(chat, id, account);
      }
    }
    if (update.callback_query) {
      const q = update.callback_query, chat = q.message?.chat.id;
      if (chat === undefined) return NextResponse.json({ ok: true });
      if (q.data?.startsWith("broadcast:")) {
        if (q.from.id !== ADMIN_TELEGRAM_ID) {
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: "Недостаточно прав.", show_alert: true });
          return NextResponse.json({ ok: true });
        }
        const [, action, broadcastId] = q.data.split(":");
        if (!/^[0-9a-f-]{36}$/i.test(broadcastId || "") || action !== "send" && action !== "cancel") {
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: "Некорректная команда.", show_alert: true });
          return NextResponse.json({ ok: true });
        }
        if (action === "cancel") {
          const { data: cancelled, error: cancelError } = await db.from("telegram_broadcasts")
            .update({ status: "cancelled", finished_at: new Date().toISOString() })
            .eq("id", broadcastId).eq("created_by", ADMIN_TELEGRAM_ID).eq("status", "draft").select("id").maybeSingle();
          if (cancelError) throw cancelError;
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: cancelled ? "Рассылка отменена." : "Рассылка уже обработана." });
          return NextResponse.json({ ok: true });
        }
        const { data: broadcast, error: claimError } = await db.from("telegram_broadcasts")
          .update({ status: "sending" }).eq("id", broadcastId).eq("created_by", ADMIN_TELEGRAM_ID)
          .eq("status", "draft").select("id,message").maybeSingle();
        if (claimError) throw claimError;
        if (!broadcast) {
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: "Рассылка уже обработана или отменена.", show_alert: true });
          return NextResponse.json({ ok: true });
        }
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: "Рассылка запущена." });
        const { data: recipients, error: recipientsError } = await db.from("telegram_accounts")
          .select("chat_id").not("linked_user_id", "is", null);
        if (recipientsError) throw recipientsError;
        let sent = 0, failed = 0;
        for (const recipient of recipients || []) {
          try {
            await telegramApi("sendMessage", {
              chat_id: recipient.chat_id,
              text: `📢 Сообщение от администратора @${ADMIN_USERNAME}\n\n${broadcast.message}`,
            });
            sent++;
          } catch (sendError) {
            failed++;
            console.error("Telegram broadcast delivery failed", sendError);
          }
        }
        const status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
        const { error: finishError } = await db.from("telegram_broadcasts").update({
          status, sent_count: sent, failed_count: failed, finished_at: new Date().toISOString(),
        }).eq("id", broadcast.id);
        if (finishError) throw finishError;
        await telegramApi("sendMessage", {
          chat_id: chat,
          text: `Рассылка завершена.\nУспешно: ${sent}\nОшибок: ${failed}`,
        });
        return NextResponse.json({ ok: true });
      }

      const { data: account, error } = await db.from("telegram_accounts").select("language,reminders_enabled,timezone").eq("telegram_user_id", q.from.id).single();
      if (error) throw error;
      const lang = getLanguage(account.language);
      if (q.data?.startsWith("staff:")) {
        if (q.from.id !== ADMIN_TELEGRAM_ID) { await telegramApi("answerCallbackQuery", { callback_query_id: q.id, text: "Недостаточно прав.", show_alert: true }); return NextResponse.json({ ok: true }); }
        const parts = q.data.split(":");
        try {
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
        } catch (callbackError) {
          // Telegram callbacks expire quickly. A stale acknowledgement must not
          // prevent handling the action or cause webhook retry storms.
          console.warn("Telegram callback acknowledgement failed", callbackError);
        }
        if (parts[1] === "home") await showStaffHome(chat, q.message?.message_id);
        else if (parts[1] === "locations") await showStaffLocations(chat, q.message?.message_id);
        else if (parts[1] === "leaderboard") await showStaffLeaderboard(chat, q.message?.message_id);
        else if (parts[1] === "employees") await showStaffEmployees(chat, Number(parts[2] || 0), q.message?.message_id);
        else if (parts[1] === "person") await showStaffEmployeeWeek(chat, parts[2] || "", Number(parts[3] || 0), q.message?.message_id);
        else if (parts[1] === "noop") { /* Pagination indicator only. */ }
        else if (parts[1] === "loc") await showStaffDates(chat, Number(parts[2]), q.message?.message_id);
        else if (parts[1] === "date") await showStaffForDate(chat, Number(parts[2]), parts[3], q.message?.message_id);
        else if (parts[1] === "back" && parts[2] === "loc") await showStaffLocations(chat, q.message?.message_id);
        else if (parts[1] === "back" && parts[2] === "dates") await showStaffDates(chat, Number(parts[3]), q.message?.message_id);
        else if (parts[1] === "menu") {
          if (q.message?.message_id) {
            try { await telegramApi("deleteMessage", { chat_id: chat, message_id: q.message.message_id }); }
            catch (deleteError) { console.warn("Could not remove staff flow message", deleteError); }
          }
          await sendMenu(chat, lang, account.reminders_enabled, true);
        }
      } else if (q.data?.startsWith("lang:")) {
        const value = q.data.slice(5) as Lang;
        if (value in copy) {
          const { error: languageError } = await db.from("telegram_accounts").update({ language: value }).eq("telegram_user_id", q.from.id);
          if (languageError) throw languageError;
          await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
          await sendMenu(chat, value, account.reminders_enabled, true);
        }
      } else if (q.data === "language:choose") {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
        await telegramApi("sendMessage", { chat_id: chat, text: copy.en.choose, reply_markup: { inline_keyboard: [[{ text: "🇬🇧 English", callback_data: "lang:en" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇨🇿 Čeština", callback_data: "lang:cs" }]] } });
      } else if (q.data?.startsWith("guide:")) {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
        await showGuide(chat, lang);
      } else {
        await telegramApi("answerCallbackQuery", { callback_query_id: q.id });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ error: "Unable to process Telegram update." }, { status: 500 });
  }
}