"use client";

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Network,
  StickyNote,
  Target,
  LayoutDashboard,
  FileText,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import AIBadge from "@/components/AIBadge";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import type { ProjectsPayload } from "@/types/projects";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: "/dashboard/notes", label: "Notes", icon: <StickyNote className="h-5 w-5" /> },
  { href: "/dashboard/quests", label: "Quest", icon: <Target className="h-5 w-5" /> },
  { href: "/dashboard/graph", label: "Graph", icon: <Network className="h-5 w-5" /> },
  { href: "/dashboard/directive-workspace", label: "Directive", icon: <GitBranch className="h-5 w-5" /> },
  { href: "/dashboard/agents", label: "Agents", icon: <Bot className="h-5 w-5" /> },
  { href: "/dashboard/docs", label: "Docs", icon: <FileText className="h-5 w-5" /> },
  { href: "/dashboard/report", label: "Report", icon: <ClipboardList className="h-5 w-5" /> },
];

interface NavItemProps extends NavItem {
  active: boolean;
  collapsed: boolean;
  pending: boolean;
  onHoverIntent: (href: string) => void;
  onNavigateIntent: (href: string) => void;
}

function subscribeSidebarPreference(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("mission-control:sidebar-pref-change", handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mission-control:sidebar-pref-change", handler);
  };
}

function getSidebarCollapsedSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem("mission-control:sidebar-collapsed") === "1";
}

function setSidebarCollapsed(nextValue: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    "mission-control:sidebar-collapsed",
    nextValue ? "1" : "0",
  );
  window.dispatchEvent(new Event("mission-control:sidebar-pref-change"));
}

function SidebarNavItem({
  href,
  label,
  icon,
  active,
  collapsed,
  pending,
  onHoverIntent,
  onNavigateIntent,
}: NavItemProps) {
  return (
    <Link
      href={href}
      prefetch
      title={collapsed ? label : undefined}
      onMouseEnter={() => onHoverIntent(href)}
      onFocus={() => onHoverIntent(href)}
      onClick={() => onNavigateIntent(href)}
      className={[
        "group relative flex items-center rounded-xl text-[0.89rem] font-medium transition-all duration-150",
        collapsed ? "justify-center px-3 py-3" : "gap-3 px-3.5 py-3",
        active || pending
          ? "bg-bg-elevated text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(255,255,255,0.04)]"
          : "text-text-secondary hover:bg-bg-elevated/55 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 transition-colors duration-200",
          active || pending
            ? "text-accent-glow"
            : "text-text-muted group-hover:text-text-secondary",
        ].join(" ")}
      >
        {icon}
      </span>
      <span
        className={[
          "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed
            ? "max-w-0 -translate-x-1 opacity-0"
            : "max-w-[10rem] translate-x-0 opacity-100",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        className={[
          "absolute inset-y-3 left-1 w-0.5 rounded-full transition-opacity duration-300",
          active || pending ? "bg-text-primary opacity-100" : "bg-transparent opacity-0",
        ].join(" ")}
      />
    </Link>
  );
}

function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === itemHref;
}

export default function Sidebar({
  initialProjectsPayload,
}: {
  initialProjectsPayload: ProjectsPayload;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(
    subscribeSidebarPreference,
    getSidebarCollapsedSnapshot,
    () => false,
  );
  const previousSidebarWidthRef = useRef<number | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const nextWidth = collapsed ? 72 : 248;
    const previousWidth = previousSidebarWidthRef.current ?? nextWidth;

    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "4.5rem" : "15.5rem",
    );

    window.dispatchEvent(
      new CustomEvent("mission-control:sidebar-resize", {
        detail: {
          collapsed,
          width: nextWidth,
          fromWidth: previousWidth,
          toWidth: nextWidth,
          duration: 300,
        },
      }),
    );

    previousSidebarWidthRef.current = nextWidth;
  }, [collapsed]);

  useEffect(() => {
    NAV_ITEMS.forEach(({ href }) => {
      router.prefetch(href);
    });
  }, [router]);

  function handleHoverIntent(href: string) {
    router.prefetch(href);
  }

  function handleNavigateIntent(href: string) {
    router.prefetch(href);
    if (href !== pathname) {
      setPendingHref(href);
    }
  }

  const effectivePendingHref = pendingHref === pathname ? null : pendingHref;

  return (
    <aside
      className={[
        "fixed z-[1000] flex h-screen flex-col overflow-hidden border-r border-border/70 bg-bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "w-[var(--sidebar-width)]",
      ].join(" ")}
    >
      <div
        className={[
          "relative min-h-[5rem] overflow-hidden border-b border-border/70",
          collapsed ? "px-2" : "px-4",
        ].join(" ")}
      >
        <div
          className={[
            "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            collapsed
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-2 opacity-0",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="group relative flex h-10 w-10 items-center justify-center overflow-hidden text-text-primary transition-colors duration-200 hover:text-white"
            title="Expand sidebar"
          >
            <span className="transition-[opacity,transform] duration-200 group-hover:-translate-x-1 group-hover:opacity-0">
              <AIBadge className="text-lg" />
            </span>
            <span className="absolute inset-0 flex translate-x-1 items-center justify-center opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
              <ChevronRight className="h-5 w-5" />
            </span>
          </button>
        </div>

        <div
          className={[
            "absolute inset-0 flex items-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            collapsed
              ? "pointer-events-none -translate-x-3 opacity-0"
              : "translate-x-0 opacity-100",
          ].join(" ")}
        >
          <div className="flex w-full items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-bg-elevated/70 text-text-primary">
                <AIBadge className="text-lg" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <div className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Workspace
                </div>
                <div className="mt-0.5 truncate text-[0.96rem] font-semibold tracking-[-0.03em] text-white">
                  Mission Control
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors duration-200 hover:bg-bg-panel/70 hover:text-white"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <ProjectSwitcher collapsed={collapsed} initialPayload={initialProjectsPayload} />

      <div
        className={[
          "overflow-hidden px-4 transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "max-h-0 px-2 pt-0 opacity-0" : "max-h-10 pt-3 opacity-100",
        ].join(" ")}
      >
        <div className="px-1 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Navigate
        </div>
      </div>

      <nav
        className={`flex-1 space-y-1 py-2 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "px-2" : "px-3"}`}
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const pending = effectivePendingHref === item.href;
          const selected = effectivePendingHref ? pending : active;

          return (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={selected}
              collapsed={collapsed}
              pending={pending}
              onHoverIntent={handleHoverIntent}
              onNavigateIntent={handleNavigateIntent}
            />
          );
        })}
      </nav>
    </aside>
  );
}
