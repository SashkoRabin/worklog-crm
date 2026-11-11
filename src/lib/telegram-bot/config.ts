export type Lang = "en" | "ru" | "cs";

export type Account = { language: Lang; reminders_enabled: boolean; timezone?: string; linked_user_id: string | null };

export type Shift = { id: string; work_date: string; store: string; shift_name: string; shift_type: "worked" | "replacement" | "assigned"; hours: number; hourly_rate: number; source: string };

export type Update = { message?: { chat: { id: number; type?: string }; from?: { id: number; username?: string }; text?: string }; callback_query?: { id: string; from: { id: number; username?: string }; data?: string; message?: { message_id: number; chat: { id: number } } }; };

export const ADMIN_TELEGRAM_ID = 626335067;

export const ADMIN_USERNAME = "onesandred";

const copy = {
  en: {
    choose: "Welcome to WorkLog! Choose your language.",
    welcome: "👋 <b>Welcome to WorkLog</b>\n\nYour personal workspace for shifts, working hours and earnings. Use the menu below to open your dashboard, check your weekly schedule or review your income.",
    open: "🌐 Open WorkLog", guideMenu: "📚 Guide", schedule: "📅 Schedule", monthShifts: "🗂 All shifts", earnings: "💰 Hours & earnings",
    remindersOn: "🔕 Turn reminders off", remindersOff: "🔔 Turn reminders on", enabled: "🔔 <b>Reminders enabled</b>\n\nI’ll notify you before each upcoming shift.", disabled: "🔕 <b>Reminders disabled</b>\n\nYou can turn them back on anytime from this menu.",
    linked: "✅ <b>Telegram connected!</b>\n\nYour WorkLog account is linked. Shift reminders are enabled by default.",
    badLink: "⚠️ This link is invalid, expired or already used. Generate a new one in WorkLog → Telegram.",
    guideTitle: "📚 <b>WorkLog quick guide</b>",
    guide: "🗓 <b>Shifts & calendar</b>\nOpen the calendar to add or edit a shift. Select the date, workplace, shift type, actual hours and hourly rate. Planned shifts are shown separately from completed work.\n\n🔗 <b>Connecteam</b>\nIn WorkLog, open <b>Settings → Connecteam</b>. Paste your personal Calendar Sync link and select <b>Connect & sync</b>. Imported shifts appear in your schedule as planned shifts.\n\n💸 <b>Hours & earnings</b>\nCompleted hours multiplied by the saved hourly rate form your earned income. Upcoming shifts contribute to your potential hours and income.\n\n🔔 <b>Notifications</b>\nUse the Reminders button in this menu to turn shift notifications on or off. The notification time is configured in WorkLog → Telegram.",
    noShifts: "📅 <b>You have no shifts scheduled this week.</b>\n\nEnjoy your free time!", monthNoShifts: "🗂 <b>No shifts this month.</b>\n\nYour monthly schedule is currently empty.", monthTitle: "🗂 <b>All shifts · {period}</b>", monthSummary: "📊 {count} shifts · {hours} h · {money}",
    weekTitle: "📅 <b>Your schedule · {from} – {to}</b>", todayLabel: "TODAY", tomorrowLabel: "TOMORROW",
    hoursTitle: "💰 <b>Your hours & earnings</b>\n<i>{period}</i>",
    actual: "✅ Completed", potential: "📈 Potential (including planned)", hours: "h", currency: "CZK",
    menuHint: "Use the menu below to continue.",
    guideButton: "📚 Open guide", connecteamButton: "🔗 Connect Connecteam",
    actualNote: "Based on shifts dated up to today.", potentialNote: "Includes all shifts scheduled for this month.",
  },
  ru: {
    choose: "Добро пожаловать в WorkLog! Выбери язык.",
    welcome: "👋 <b>Добро пожаловать в WorkLog</b>\n\nТвой персональный помощник для учёта смен, рабочего времени и заработка. Используй меню ниже, чтобы открыть приложение, посмотреть расписание или проверить доход.",
    open: "🌐 Открыть WorkLog", guideMenu: "📚 Руководство", schedule: "📅 Расписание", monthShifts: "🗂 Список смен", earnings: "💰 Часы и заработок",
    remindersOn: "🔕 Выключить напоминания", remindersOff: "🔔 Включить напоминания", enabled: "🔔 <b>Напоминания включены</b>\n\nБуду присылать уведомления перед предстоящими сменами.", disabled: "🔕 <b>Напоминания выключены</b>\n\nВ любой момент можешь включить их обратно через меню.",
    linked: "✅ <b>Telegram подключён!</b>\n\nАккаунт WorkLog успешно привязан. Напоминания о сменах включены по умолчанию.",
    badLink: "⚠️ Ссылка недействительна, устарела или уже использована. Создай новую в WorkLog → Telegram.",
    guideTitle: "📚 <b>Краткое руководство WorkLog</b>",
    guide: "🗓 <b>Смены и календарь</b>\nОткрой календарь, чтобы добавить или изменить смену. Выбери дату, рабочее место, тип смены, фактические часы и ставку. Запланированные смены отображаются отдельно от уже отработанных.\n\n🔗 <b>Подключение Connecteam</b>\nВ WorkLog открой <b>Настройки → Connecteam</b>. Вставь личную ссылку Calendar Sync и нажми <b>Подключить и синхронизировать</b>. Импортированные смены появятся в расписании как запланированные.\n\n💸 <b>Часы и заработок</b>\nФактический заработок рассчитывается по отработанным часам и ставке, сохранённой в смене. Будущие смены учитываются в потенциальных часах и заработке.\n\n🔔 <b>Уведомления</b>\nВключай и выключай уведомления кнопкой «Напоминания» в меню. Время уведомления настраивается на сайте в разделе WorkLog → Telegram.",
    noShifts: "📅 <b>У вас нет смен на этой неделе.</b>\n\nОтличная возможность отдохнуть и восстановить силы! 🌿", monthNoShifts: "🗂 <b>В этом месяце смен пока нет.</b>\n\nРасписание за месяц пустое.", monthTitle: "🗂 <b>Все смены · {period}</b>", monthSummary: "📊 Всего: {count} смен · {hours} ч · {money}",
    weekTitle: "📅 <b>Ваше расписание · {from} – {to}</b>", todayLabel: "СЕГОДНЯ", tomorrowLabel: "ЗАВТРА",
    hoursTitle: "💰 <b>Часы и заработок</b>\n<i>{period}</i>",
    actual: "✅ Фактически", potential: "📈 Потенциально (с учётом плановых смен)", hours: "ч", currency: "CZK",
    menuHint: "Используйте меню ниже для быстрого доступа.",
    guideButton: "📚 Открыть руководство", connecteamButton: "🔗 Подключить Connecteam",
    actualNote: "Смены по сегодняшний день включительно.", potentialNote: "Включает все смены, запланированные на этот месяц.",
  },
  cs: {
    choose: "Vítej ve WorkLogu! Vyber si jazyk.",
    welcome: "👋 <b>Vítej ve WorkLogu</b>\n\nTvůj osobní prostor pro směny, pracovní dobu a výdělek. Pomocí nabídky níže otevři aplikaci, zobraz rozvrh nebo zkontroluj příjem.",
    open: "🌐 Otevřít WorkLog", guideMenu: "📚 Návod", schedule: "📅 Rozvrh", monthShifts: "🗂 Všechny směny", earnings: "💰 Hodiny a výdělek",
    remindersOn: "🔕 Vypnout připomenutí", remindersOff: "🔔 Zapnout připomenutí", enabled: "🔔 <b>Připomenutí zapnuta</b>\n\nUpozorním tě před každou nadcházející směnou.", disabled: "🔕 <b>Připomenutí vypnuta</b>\n\nKdykoli je můžeš znovu zapnout v nabídce.",
    linked: "✅ <b>Telegram je propojen!</b>\n\nTvůj účet WorkLog je propojen. Připomenutí směn jsou ve výchozím nastavení zapnutá.",
    badLink: "⚠️ Odkaz je neplatný, vypršel nebo už byl použit. Vytvoř nový ve WorkLog → Telegram.",
    guideTitle: "📚 <b>Rychlý návod WorkLog</b>",
    guide: "🗓 <b>Směny a kalendář</b>\nOtevři kalendář pro přidání nebo úpravu směny. Vyber datum, pracoviště, typ směny, skutečné hodiny a sazbu. Plánované směny jsou oddělené od dokončené práce.\n\n🔗 <b>Connecteam</b>\nVe WorkLog otevři <b>Nastavení → Connecteam</b>. Vlož osobní odkaz Calendar Sync a klikni na <b>Připojit a synchronizovat</b>. Importované směny se zobrazí jako plánované.\n\n💸 <b>Hodiny a výdělek</b>\nSkutečný výdělek se počítá z odpracovaných hodin a sazby uložené u směny. Budoucí směny se započítávají do potenciálních hodin a výdělku.\n\n🔔 <b>Upozornění</b>\nUpozornění zapneš nebo vypneš tlačítkem v nabídce. Čas upozornění nastavíš na webu v WorkLog → Telegram.",
    noShifts: "📅 <b>Tento týden nemáte žádné směny.</b>\n\nUžij si volný čas!", monthNoShifts: "🗂 <b>Tento měsíc nemáš žádné směny.</b>\n\nMěsíční rozvrh je zatím prázdný.", monthTitle: "🗂 <b>Všechny směny · {period}</b>", monthSummary: "📊 Celkem: {count} směn · {hours} h · {money}",
    weekTitle: "📅 <b>Tvůj rozvrh · {from} – {to}</b>", todayLabel: "DNES", tomorrowLabel: "ZÍTRA",
    hoursTitle: "💰 <b>Tvé hodiny a výdělek</b>\n<i>{period}</i>",
    actual: "✅ Skutečnost", potential: "📈 Potenciál (včetně plánovaných)", hours: "h", currency: "CZK",
    menuHint: "Pokračuj pomocí nabídky níže.",
    guideButton: "📚 Otevřít návod", connecteamButton: "🔗 Připojit Connecteam",
    actualNote: "Směny do dnešního dne včetně.", potentialNote: "Zahrnuje všechny směny naplánované na tento měsíc.",
  },
} as const;

export function getLanguage(value?: string): Lang { return value && value in copy ? value as Lang : "en"; }