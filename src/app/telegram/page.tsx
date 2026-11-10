"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff, Check, CheckCircle2, Clock3, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Unlink } from "lucide-react";

type State = { connected: boolean; account: null | { language: string; remindersEnabled: boolean; reminderMinutes: number; timezone: string; linkedAt: string | null } };

function TelegramMark({ size = 25 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.6 4.2 18.35 19.55c-.24 1.08-.87 1.35-1.76.84l-4.86-3.58-2.34 2.25c-.26.26-.48.48-.98.48l.35-4.95 9.02-8.15c.39-.35-.08-.55-.6-.2L6.03 13.3l-4.76-1.49c-1.04-.33-1.06-1.04.22-1.55L20.1 2.92c.87-.32 1.63.21 1.5 1.28Z" fill="currentColor"/></svg>;
}

export default function TelegramSettingsPage() {
  const [state, setState] = useState<State | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/telegram/account", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const root = document.documentElement;
    const syncTheme = () => setDark(root.classList.contains("theme-dark") || document.querySelector(".app-shell.theme-dark, .theme-dark .app-shell") !== null);
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const shell = document.querySelector(".app-shell");
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [refresh]);

  async function createLink() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/telegram/account", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setUrl(d.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create link."); }
    finally { setBusy(false); }
  }

  async function patch(value: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/telegram/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState(s => s?.account ? { connected: true, account: { ...s.account, remindersEnabled: d.remindersEnabled, reminderMinutes: d.reminderMinutes } } : s);
      setNotice("Settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Telegram from this WorkLog account?")) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/telegram/account", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setUrl(""); setNotice("Telegram disconnected."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to disconnect."); }
    finally { setBusy(false); }
  }

  const shell = dark ? "bg-[#191720] text-[#f4f1fb]" : "bg-[#fbfafc] text-[#24202e]";
  const panel = dark ? "border-[#383343] bg-[#24212c]" : "border-[#e9e5f0] bg-white";
  const muted = dark ? "text-[#aaa4b9]" : "text-[#817b8d]";
  const soft = dark ? "bg-[#302b3a]" : "bg-[#f7f5fb]";
  const field = dark ? "border-[#494252] bg-[#211e29] text-[#f4f1fb]" : "border-[#e5e0ed] bg-white text-[#24202e]";

  return (
    <main className={`min-h-screen px-4 py-5 sm:px-7 sm:py-8 lg:px-10 ${shell}`}>
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/" className={`mb-7 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm transition hover:opacity-70 ${muted}`}><ArrowLeft size={17}/>Back to WorkLog</Link>
        <header className="mb-7 grid gap-4 border-b border-[var(--line)] pb-7 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.85fr)] sm:items-end sm:gap-8">
          <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8069ed]">WorkLog / Integrations</p><h1 className="text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px]">Telegram</h1><p className={`mt-1 text-lg font-medium tracking-tight ${muted}`}>Assistant & reminders</p></div>
          <p className={`max-w-md text-sm leading-6 sm:pb-1 ${muted}`}>Keep your shifts close. Get a guided introduction and timely reminders directly in Telegram.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(230px,0.75fr)]">
          <section className={`overflow-hidden rounded-2xl border shadow-[0_12px_34px_rgba(45,35,77,0.045)] ${panel}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-5 sm:px-7">
              <div className="flex min-w-0 items-center gap-3.5"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#229ed9] text-white shadow-[0_7px_18px_rgba(34,158,217,0.25)]"><TelegramMark size={27}/></div><div><h2 className="text-base font-semibold tracking-tight">Telegram connection</h2><p className={`mt-0.5 text-xs ${muted}`}>Your personal WorkLog assistant</p></div></div>
              {state?.connected ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14}/>Connected</span> : state ? <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${soft} ${muted}`}>Not connected</span> : null}
            </div>

            <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
              {!state && <div className={`flex items-center gap-2 py-5 text-sm ${muted}`}><LoaderCircle className="animate-spin" size={17}/>Loading connection…</div>}
              {state && !state.connected && <div className={`rounded-xl p-4 sm:p-5 ${soft}`}>
                <div className="mb-4 flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-[#8069ed]/10 p-2 text-[#8069ed]"><Bell size={17}/></div><div><h3 className="text-sm font-semibold">Connect in three steps</h3><p className={`mt-1 text-xs leading-5 ${muted}`}>It takes less than a minute. Your account is linked securely with a one-time link.</p></div></div>
                <ol className="mb-5 grid gap-3 text-sm sm:grid-cols-3">{["Open the WorkLog bot in Telegram","Create your personal connection link","Tap Start in the Telegram chat"].map((step,i)=><li key={step} className="flex items-start gap-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#8069ed]/10 text-[11px] font-bold text-[#8069ed]">{i+1}</span><span className={`text-xs leading-5 ${muted}`}>{step}</span></li>)}</ol>
                <button onClick={createLink} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6750e8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5842d2] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy?<LoaderCircle className="animate-spin" size={16}/>:<TelegramMark size={17}/>}Generate connection link</button>
                {url && <a href={url} target="_blank" rel="noreferrer" className="mt-4 flex min-h-11 items-center gap-2 break-all text-sm font-semibold text-[#8069ed] hover:underline"><ExternalLink size={16}/>Open Telegram to finish linking</a>}
              </div>}

              {state?.connected && state.account && <>
                <div className={`flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${soft}`}>
                  <div className="flex items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><ShieldCheck size={20}/></div><div><p className="text-sm font-semibold">Account linked successfully</p><p className={`mt-1 text-xs ${muted}`}>Language: {state.account.language.toUpperCase()} <span className="mx-1">·</span>{state.account.timezone}</p></div></div>
                  <button onClick={disconnect} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition hover:border-red-400 hover:text-red-500 disabled:opacity-50 sm:self-auto"><Unlink size={14}/>Disconnect</button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 rounded-xl p-2.5 ${state.account.remindersEnabled ? "bg-emerald-500/10 text-emerald-600" : soft + " " + muted}`}>{state.account.remindersEnabled?<Bell size={19}/>:<BellOff size={19}/>}</div><div><p className="text-sm font-semibold">Shift reminders</p><p className={`mt-1 max-w-sm text-xs leading-5 ${muted}`}>Get a Telegram notification before every upcoming shift.</p></div></div>
                  <button role="switch" aria-label="Enable shift reminders" aria-checked={state.account.remindersEnabled} onClick={()=>void patch({remindersEnabled:!state.account?.remindersEnabled})} disabled={busy} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${state.account.remindersEnabled?"bg-emerald-500":dark?"bg-[#514b5d]":"bg-[#d6d1de]"}`}><span className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all ${state.account.remindersEnabled?"left-6":"left-1"}`}/></button>
                </div>
                <div className={`h-px ${dark?"bg-[#383343]":"bg-[#eeeaf3]"}`}/>
                <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} className="text-[#8069ed]"/>Reminder timing</span><select value={state.account.reminderMinutes} onChange={e=>void patch({reminderMinutes:Number(e.target.value)})} disabled={busy} className={`min-h-12 w-full rounded-xl border px-3.5 py-3 text-sm outline-none transition focus:border-[#8069ed] focus:ring-2 focus:ring-[#8069ed]/15 disabled:opacity-50 ${field}`}><option value={120}>2 hours before shift</option><option value={60}>1 hour before shift</option><option value={30}>30 minutes before shift</option></select><span className={`mt-2 block text-xs leading-5 ${muted}`}>Notifications follow the time zone configured for your Telegram account.</span></label>
              </>}

              {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
              {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-600"><Check size={15}/>{notice}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4"><span className={`text-xs ${muted}`}>Changes are saved automatically.</span><button onClick={()=>void refresh()} disabled={busy} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition hover:bg-[#8069ed]/10 hover:text-[#8069ed] disabled:opacity-50 ${muted}`}><RefreshCw size={14} className={busy?"animate-spin":""}/>Refresh status</button></div>
            </div>
          </section>

          <aside className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className={`rounded-2xl border p-5 ${panel}`}><div className="mb-3 grid size-9 place-items-center rounded-xl bg-[#8069ed]/10 text-[#8069ed]"><Bell size={18}/></div><h3 className="text-sm font-semibold">Never miss a shift</h3><p className={`mt-1.5 text-xs leading-5 ${muted}`}>A quiet nudge before work starts, with the timing you choose.</p></div>
            <div className={`rounded-2xl border p-5 ${panel}`}><div className="mb-3 grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><ShieldCheck size={18}/></div><h3 className="text-sm font-semibold">Private by design</h3><p className={`mt-1.5 text-xs leading-5 ${muted}`}>Your Telegram chat is linked to your WorkLog account with a one-time token.</p></div>
          </aside>
        </div>
      </div>
    </main>
  );
}
