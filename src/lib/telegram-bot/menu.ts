import { telegramApi } from "@/lib/telegram-server";

import { copy, type Lang } from "./config";

export function appUrl() { return process.env.NEXT_PUBLIC_APP_URL || "https://worklog-crm.vercel.app"; }

export function menuKeyboard(lang: Lang, enabled: boolean) {
  const t = copy[lang];
  return {
    keyboard: [
      [{ text: t.open, web_app: { url: appUrl() } }],
      [{ text: t.guideMenu }, { text: t.schedule }],
      [{ text: t.monthShifts }, { text: t.earnings }],
      [{ text: "👥 Сотрудники" }],
      [{ text: enabled ? t.remindersOn : t.remindersOff }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: lang === "ru" ? "Выберите действие…" : lang === "cs" ? "Vyber akci…" : "Choose an action…",
  };
}
export async function sendMenu(chatId: number, lang: Lang, enabled: boolean, welcome = false) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: welcome ? copy[lang].welcome : copy[lang].menuHint,
    parse_mode: "HTML",
    reply_markup: menuKeyboard(lang, enabled),
  });
}
