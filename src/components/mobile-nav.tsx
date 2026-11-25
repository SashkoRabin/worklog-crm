"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, Settings2, UserRound } from "lucide-react";

type MobileNavProps = {
  active: "calendar" | "analytics" | "profile";
  calendar: string;
  analytics: string;
  profile: string;
  settings: string;
  onSettings: () => void;
};

/** Main sections plus quick settings, all within thumb reach on mobile. */
export function MobileNav({ active, calendar, analytics, profile, settings, onSettings }: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      <Link href="/" className={active === "calendar" ? "active" : ""} aria-current={active === "calendar" ? "page" : undefined}>
        <CalendarDays aria-hidden="true" /><span>{calendar}</span>
      </Link>
      <Link href="/analytics" className={active === "analytics" ? "active" : ""} aria-current={active === "analytics" ? "page" : undefined}>
        <BarChart3 aria-hidden="true" /><span>{analytics}</span>
      </Link>
      <Link href="/profile" className={active === "profile" ? "active" : ""} aria-current={active === "profile" ? "page" : undefined}>
        <UserRound aria-hidden="true" /><span>{profile}</span>
      </Link>
      <button type="button" onClick={onSettings} aria-label={settings}>
        <Settings2 aria-hidden="true" /><span>{settings}</span>
      </button>
    </nav>
  );
}
