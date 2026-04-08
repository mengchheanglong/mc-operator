"use client";

import { usePathname } from "next/navigation";
import RouteWarmup from "../../components/RouteWarmup";
import Sidebar from "../../components/Sidebar";
import type { ProjectsPayload } from "@/types/projects";

interface DashboardLayoutClientProps {
  children: React.ReactNode;
  initialProjectsPayload: ProjectsPayload;
}

export default function DashboardLayoutClient({
  children,
  initialProjectsPayload,
}: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const isFullWidth =
    pathname === "/dashboard/docs" ||
    pathname === "/dashboard/graph" ||
    pathname === "/dashboard/report";

  return (
    <div className="min-h-screen bg-bg-base">
      <RouteWarmup />
      <Sidebar initialProjectsPayload={initialProjectsPayload} />
      <main className="sidebar-shell-transition relative ml-[var(--sidebar-width)] min-h-screen w-[calc(100%-var(--sidebar-width))] overflow-x-hidden bg-bg-base">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(95,68,127,0.1),transparent_22%),linear-gradient(180deg,rgba(9,9,13,0),rgba(9,9,13,0.24))]" />
        <div
          className={`relative z-10 w-full ${
            isFullWidth ? "h-screen overflow-hidden" : "h-full mx-auto max-w-[88rem] px-4 py-8 md:px-8"
          }`}
        >
          <div key={pathname} className={`dashboard-route-stage animate-fade-in ${isFullWidth ? "h-full" : ""}`}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
