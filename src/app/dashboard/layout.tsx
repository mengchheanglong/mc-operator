"use client";

import { usePathname } from "next/navigation";
import Sidebar from "../../components/Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const isFullWidth =
    pathname === "/dashboard/prompt-pack" ||
    pathname === "/dashboard/docs" ||
    pathname === "/dashboard/graph";

  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar />
      <main className="sidebar-shell-transition relative ml-[var(--sidebar-width)] min-h-screen w-[calc(100%-var(--sidebar-width))] overflow-x-hidden bg-bg-base">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(95,68,127,0.1),transparent_22%),linear-gradient(180deg,rgba(9,9,13,0),rgba(9,9,13,0.24))]" />
        <div
          className={`relative z-10 h-full w-full ${
            isFullWidth ? "" : "mx-auto max-w-[88rem] px-4 py-8 md:px-8"
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
