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
      <main className="sidebar-shell-transition ml-(--sidebar-width) min-h-screen w-[calc(100%-var(--sidebar-width))] overflow-x-hidden bg-bg-base">
        <div
          className={`w-full ${
            isFullWidth ? "h-screen overflow-hidden" : "mx-auto max-w-352 px-4 py-8 md:px-8"
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
