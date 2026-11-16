import { telegramApi } from "@/lib/telegram-server";

import { copy, type Lang } from "./config";
import { hasNeedShifts } from "./features/need-shifts";

export function appUrl() { return process.env.NEXT_PUBLIC_APP_URL || "https://worklog-crm.vercel.app"; }

export function menuKeyboard(lang: Lang, enabled: boolean, needsShifts = false) {
  const t = copy[lang];
  return {
    keyboard: [
      [{ text: t.open, web_app: { url: appUrl() } }],
      [{ text: t.guideMenu }, { text: t.scheduleMenu }],
      [{ text: t.earnings }],
      [{ text: lang === "ru" ? (needsShifts ? "🆘 Нужны смены (отменить)" : "🆘 Нужны смены") : lang === "cs" ? (needsShifts ? "🆘 Potřebuji směny (zrušit)" : "🆘 Potřebuji směny") : (needsShifts ? "🆘 Need shifts (cancel)" : "🆘 Need shifts") }],
      [{ text: "👥 Сотрудники" }],
      [{ text: enabled ? t.remindersOn : t.remindersOff }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: lang === "ru" ? "Выберите действие…" : lang === "cs" ? "Vyber akci…" : "Choose an action…",
  };
}
export async function sendMenu(chatId: number, lang: Lang, enabled: boolean, welcome = false, telegramUserId?: number) {
  const needsShifts = telegramUserId ? await hasNeedShifts(telegramUserId) : false;
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: welcome ? copy[lang].welcome : copy[lang].menuHint,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(lang, enabled, needsShifts),
  });
}
