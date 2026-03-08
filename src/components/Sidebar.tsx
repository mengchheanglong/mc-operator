"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Network,
  StickyNote,
  ScrollText,
  Target,
  LayoutDashboard,
  FileText,
  ClipboardList,
  Scale,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AIBadge from "@/components/AIBadge";
import ProjectSwitcher from "@/components/ProjectSwitcher";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

interface NavItemProps extends NavItem {
  active: boolean;
  collapsed: boolean;
}

function SidebarNavItem({ href, label, icon, active, collapsed }: NavItemProps) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={[
        "group relative flex items-center rounded-xl text-[0.89rem] font-medium transition-all duration-150",
        collapsed ? "justify-center px-3 py-3" : "gap-3 px-3.5 py-3",
        active
          ? "bg-bg-elevated text-white"
          : "text-text-secondary hover:bg-bg-panel/72 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 transition-colors duration-200",
          active
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
          active ? "bg-text-primary opacity-100" : "bg-transparent opacity-0",
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

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "4.5rem" : "17rem",
    );
  }, [collapsed]);

  const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: "/dashboard/notes",
      label: "Notes",
      icon: <StickyNote className="h-5 w-5" />,
    },
    {
      href: "/dashboard/quests",
      label: "Quest",
      icon: <Target className="h-5 w-5" />,
    },
    {
      href: "/dashboard/graph",
      label: "Graph",
      icon: <Network className="h-5 w-5" />,
    },
    {
      href: "/dashboard/prompt-pack",
      label: "Prompt Pack",
      icon: <ScrollText className="h-5 w-5" />,
    },
    {
      href: "/dashboard/docs",
      label: "Docs",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      href: "/dashboard/decisions",
      label: "Decisions",
      icon: <Scale className="h-5 w-5" />,
    },
    {
      href: "/dashboard/report",
      label: "Report",
      icon: <ClipboardList className="h-5 w-5" />,
    },
  ];

  return (
    <aside
      className={[
        "fixed z-[1000] flex h-screen flex-col overflow-hidden border-r border-border/80 bg-bg-sidebar/98 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "w-[var(--sidebar-width)]",
      ].join(" ")}
    >
      <div
        className={[
          "relative min-h-24 overflow-hidden border-b border-border/70",
          collapsed ? "px-2" : "px-5",
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
            onClick={() => setCollapsed(false)}
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
          <div className="flex w-full items-center justify-between gap-3 px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-panel text-text-primary">
                <AIBadge className="text-lg" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <div className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Workspace
                </div>
                <div className="mt-1 truncate text-[0.98rem] font-semibold tracking-tight text-white">
                  Mission Control
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-text-muted transition-colors duration-200 hover:text-white"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <ProjectSwitcher collapsed={collapsed} />

      <div
        className={[
          "overflow-hidden px-4 transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "max-h-0 px-2 pt-0 opacity-0" : "max-h-14 pt-5 opacity-100",
        ].join(" ")}
      >
        <div className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Navigate
        </div>
      </div>

      <nav
        className={`flex-1 space-y-1.5 py-4 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "px-2" : "px-4"}`}
      >
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isNavItemActive(item.href, pathname)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}
