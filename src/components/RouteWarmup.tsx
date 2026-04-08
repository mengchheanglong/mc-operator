"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ROUTES_TO_WARM = [
  "/dashboard",
  "/dashboard/notes",
  "/dashboard/quests",
  "/dashboard/graph",
  "/dashboard/agents",
  "/dashboard/docs",
  "/dashboard/report",
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

    const warm = async () => {
      const routeTargets = ROUTES_TO_WARM.filter((href) => href !== pathname);

      for (const href of routeTargets) {
        try {
          await fetch(href, {
            credentials: "same-origin",
            cache: "no-store",
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
