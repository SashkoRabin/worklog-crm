import type { Lang } from "./config";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
function datePartsInZone(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days));
  return value.toISOString().slice(0, 10);
}
function formatDate(date: string, lang: Lang) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : lang === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function money(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}
