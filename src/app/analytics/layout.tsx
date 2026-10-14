import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "YK WorkLog Analytics" } };

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
