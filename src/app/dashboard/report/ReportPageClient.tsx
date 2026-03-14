"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw, Search } from "lucide-react";

interface DailyReportLogItem {
  dayKey: string;
  title: string;
  content: string;
  entryCount: number;
  areas: string[];
  topics: string[];
  categories: string[];
  latestDate: string;
}

interface DailyReportResponse {
  days?: DailyReportLogItem[];
}

const REPORTS_SIDEBAR_STORAGE_KEY = "mission-control:reports-sidebar-collapsed";

function subscribePanePreference(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("mission-control:pane-pref-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mission-control:pane-pref-change", handler);
  };
}

function getPaneCollapsedSnapshot(key: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}

function setPaneCollapsed(key: string, nextValue: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, nextValue ? "1" : "0");
  window.dispatchEvent(new Event("mission-control:pane-pref-change"));
}

function formatDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function relativeTime(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReportPageClient() {
  const searchParams = useSearchParams();
  const selectedDayFromQuery = searchParams.get("day");

  const [logs, setLogs] = useState<DailyReportLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [switchingDay, setSwitchingDay] = useState<string | null>(null);
  const storedSidebarCollapsed = useSyncExternalStore(
    subscribePanePreference,
    () => getPaneCollapsedSnapshot(REPORTS_SIDEBAR_STORAGE_KEY),
    () => false,
  );
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const sidebarCollapsed = sidebarCompact || storedSidebarCollapsed;
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/reports?view=daily");
      const payload = response.data as DailyReportResponse;
      setLogs(Array.isArray(payload.days) ? payload.days : []);
      setError("");
    } catch {
      setError("Unable to load daily reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1180px)");
    const syncViewport = () => setSidebarCompact(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((log) => {
      const haystack = [
        log.dayKey,
        log.title,
        log.content,
        log.areas.join(" "),
        log.topics.join(" "),
        log.categories.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [logs, searchQuery]);

  const setSelectedDayKey = useCallback(
    (nextDay: string | null) => {
      if (nextDay && nextDay !== selectedDay) {
        setSwitchingDay(nextDay);
      }
      setSelectedDay(nextDay);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (nextDay) url.searchParams.set("day", nextDay);
        else url.searchParams.delete("day");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    },
    [selectedDay],
  );

  useEffect(() => {
    if (!selectedDayFromQuery) {
      if (!selectedDay && filteredLogs.length > 0) setSelectedDay(filteredLogs[0].dayKey);
      return;
    }
    if (filteredLogs.some((log) => log.dayKey === selectedDayFromQuery) && selectedDay !== selectedDayFromQuery) {
      setSelectedDay(selectedDayFromQuery);
    }
  }, [filteredLogs, selectedDay, selectedDayFromQuery]);

  useEffect(() => {
    if (selectedDay && !filteredLogs.some((log) => log.dayKey === selectedDay)) {
      setSelectedDay(filteredLogs[0]?.dayKey ?? null);
    }
  }, [filteredLogs, selectedDay]);

  const selectedLog = useMemo(
    () => filteredLogs.find((log) => log.dayKey === selectedDay) ?? filteredLogs[0] ?? null,
    [filteredLogs, selectedDay],
  );

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [selectedLog?.dayKey]);

  useEffect(() => {
    if (!switchingDay) return;
    if (selectedLog?.dayKey !== switchingDay) return;
    const frame = window.requestAnimationFrame(() => {
      setSwitchingDay(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedLog?.dayKey, switchingDay]);

  const isSwitching = Boolean(switchingDay && switchingDay !== selectedLog?.dayKey) || (Boolean(switchingDay) && loading);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-base">
      <aside
        className={[
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          sidebarCollapsed ? "w-[4.75rem]" : "w-[22rem]",
        ].join(" ")}
      >
        <div
          className={[
            "relative min-h-[5.25rem] overflow-hidden border-b border-border",
            sidebarCollapsed ? "px-2" : "px-4",
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              sidebarCollapsed ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => setPaneCollapsed(REPORTS_SIDEBAR_STORAGE_KEY, false)}
              className="group/logo relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-elevated text-text-primary shadow-sm transition-all duration-200 hover:border-text-muted hover:bg-border"
              title="Expand reports sidebar"
              disabled={sidebarCompact}
            >
              <span className="transition-[opacity,transform] duration-200 group-hover/logo:-translate-x-1 group-hover/logo:opacity-0">
                <FileText className="h-4 w-4" />
              </span>
              <span className="absolute inset-0 flex translate-x-1 items-center justify-center opacity-0 transition-[opacity,transform] duration-200 group-hover/logo:translate-x-0 group-hover/logo:opacity-100">
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </div>

          <div
            className={[
              "absolute inset-0 flex items-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              sidebarCollapsed ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100",
            ].join(" ")}
          >
            <div className="flex w-full items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-primary shadow-sm">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="text-sm font-semibold text-text-primary">Reports</div>
                  <div className="text-xs text-text-muted">Daily work documentation</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaneCollapsed(REPORTS_SIDEBAR_STORAGE_KEY, true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-bg-elevated hover:text-text-primary"
                title="Collapse reports sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          className={[
            "overflow-hidden border-b border-border transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            sidebarCollapsed ? "max-h-0 px-0 py-0 opacity-0" : "max-h-32 px-4 py-4 opacity-100",
          ].join(" ")}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search daily logs..."
              className="w-full rounded-lg border border-border bg-bg-base py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-xs">Loading...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-text-muted">No daily logs found.</div>
          ) : (
            filteredLogs.map((log) => (
              <button
                key={log.dayKey}
                type="button"
                onClick={() => setSelectedDayKey(log.dayKey)}
                title={sidebarCollapsed ? formatDayLabel(log.dayKey) : undefined}
                className={[
                  "group w-full border-l-2 text-left transition-all",
                  sidebarCollapsed ? "flex items-center justify-center px-3 py-3" : "flex flex-col gap-1.5 px-4 py-3",
                  selectedLog?.dayKey === log.dayKey
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-transparent hover:bg-bg-panel/60",
                ].join(" ")}
              >
                {sidebarCollapsed ? (
                  <FileText className="h-4 w-4 text-text-muted" />
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">{formatDayLabel(log.dayKey)}</div>
                        <div className="mt-0.5 text-[11px] text-text-muted">
                          {log.entryCount} update{log.entryCount === 1 ? "" : "s"} · {relativeTime(log.latestDate)}
                        </div>
                      </div>
                    </div>
                    <div className="pl-[22px] text-xs text-text-secondary">
                      {log.areas.slice(0, 2).join(", ") || log.categories.join(", ") || "Daily work log"}
                    </div>
                    {log.topics.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pl-[22px]">
                        {log.topics.slice(0, 3).map((topic) => (
                          <span
                            key={topic}
                            className="rounded bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </button>
            ))
          )}
        </div>

        {!sidebarCollapsed ? (
          <div className="flex-none border-t border-border p-3">
            <button
              type="button"
              onClick={() => void fetchLogs()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-card py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh daily logs
            </button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-base">
        {error ? (
          <div className="mx-4 mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
            {error}
          </div>
        ) : null}

        {isSwitching ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <div className="h-6 w-48 animate-pulse rounded-md bg-bg-card" />
              <div className="mt-3 h-4 w-72 animate-pulse rounded-md bg-bg-card" />
            </div>
            <div className="flex-1 space-y-3 px-6 py-6">
              <div className="h-4 w-full animate-pulse rounded bg-bg-card" />
              <div className="h-4 w-[92%] animate-pulse rounded bg-bg-card" />
              <div className="h-4 w-[88%] animate-pulse rounded bg-bg-card" />
              <div className="h-4 w-[76%] animate-pulse rounded bg-bg-card" />
            </div>
          </div>
        ) : selectedLog ? (
          <div key={selectedLog.dayKey} className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-[1.04rem] font-semibold text-white">{formatDayLabel(selectedLog.dayKey)}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span>{selectedLog.entryCount} update{selectedLog.entryCount === 1 ? "" : "s"}</span>
                    <span>|</span>
                    <span>{selectedLog.categories.join(", ") || "No categories"}</span>
                    <span>|</span>
                    <span>{relativeTime(selectedLog.latestDate)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchLogs()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedLog.areas.map((area) => (
                  <span key={area} className="rounded-md bg-bg-card px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary">
                    {area}
                  </span>
                ))}
                {selectedLog.topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-md bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-primary"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="prose-chat prose-docs max-w-none text-sm leading-relaxed text-text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedLog.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-text-muted">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-card">
              <FileText className="h-7 w-7 text-accent-primary/50" />
            </div>
            <div className="text-center">
              <p className="matte-panel-heading">Select a day</p>
              <p className="mt-1 matte-panel-copy">Open a daily work log to review everything recorded for that day.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
