"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, UserRound } from "lucide-react";

type MobileNavProps = {
  active: "calendar" | "analytics" | "profile";
  calendar: string;
  analytics: string;
  profile: string;
};

/** Three primary sections, kept within thumb reach on small touch devices. */
export function MobileNav({ active, calendar, analytics, profile }: MobileNavProps) {
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
    </nav>
  );
}
