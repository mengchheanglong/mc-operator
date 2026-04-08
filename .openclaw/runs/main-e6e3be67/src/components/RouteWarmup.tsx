"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ROUTES_TO_WARM = [
  "/dashboard",
  "/dashboard/notes",
  "/dashboard/quests",
  "/dashboard/graph",
  "/dashboard/agents",
  "/dashboard/automations",
  "/dashboard/docs",
  "/dashboard/report",
];

const APIS_TO_WARM = [
  "/api/projects",
  "/api/notes",
  "/api/quests?limit=100",
  "/api/reports?limit=60",
  "/api/docs",
  "/api/automation/n8n/status",
];

declare global {
  interface Window {
    __missionControlWarmupDone?: boolean;
  }
}

export default function RouteWarmup() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    if (window.__missionControlWarmupDone) {
      return;
    }

    window.__missionControlWarmupDone = true;

    const controller = new AbortController();

    const warm = async () => {
      const routeTargets = ROUTES_TO_WARM.filter((href) => href !== pathname);

      for (const href of [...routeTargets, ...APIS_TO_WARM]) {
        if (controller.signal.aborted) {
          return;
        }

        try {
          await fetch(href, {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          });
        } catch {
          // Warmup is best-effort only.
        }
      }
    };

    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    if ("requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(
        () => {
          void warm();
        },
        { timeout: 2000 },
      );
    } else {
      timeoutId = globalThis.setTimeout(() => {
        void warm();
      }, 800);
    }

    return () => {
      controller.abort();

      if (idleCallbackId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [pathname]);

  return null;
}
