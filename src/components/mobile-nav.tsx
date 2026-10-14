"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, Settings2 } from "lucide-react";

type MobileNavProps = {
  active: "calendar" | "analytics";
  calendar: string;
  analytics: string;
  settings: string;
  onSettings: () => void;
};

/** Primary actions are kept within thumb reach on small touch devices. */
export function MobileNav({
  active,
  calendar,
  analytics,
  settings,
  onSettings,
}: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      <Link
        href="/"
        className={active === "calendar" ? "active" : ""}
        aria-current={active === "calendar" ? "page" : undefined}
      >
        <CalendarDays aria-hidden="true" />
        <span>{calendar}</span>
      </Link>
      <Link
        href="/analytics"
        className={active === "analytics" ? "active" : ""}
        aria-current={active === "analytics" ? "page" : undefined}
      >
        <BarChart3 aria-hidden="true" />
        <span>{analytics}</span>
      </Link>
      <button type="button" onClick={onSettings} aria-label={settings}>
        <Settings2 aria-hidden="true" />
        <span>{settings}</span>
      </button>
    </nav>
  );
}
