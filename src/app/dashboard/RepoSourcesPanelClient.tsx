"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function relativeTime(dateValue: string) {
  const deltaSeconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000),
  );
  if (deltaSeconds < 60) return "just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function repoSourcesStatusTone(status: "stable" | "updates" | "blocked" | "unavailable" | "stale") {
  if (status === "stable") return "bg-status-success/15 text-status-success";
  if (status === "updates") return "bg-status-warning/15 text-status-warning";
  if (status === "blocked") return "bg-status-error/15 text-status-error";
  if (status === "stale") return "bg-status-warning/15 text-status-warning";
  return "border border-border bg-bg-panel text-text-muted";
}

interface RepoSourcesPanelClientProps {
  repoSources: {
    available: boolean;
    generatedAt: string | null;
    stale: boolean;
    maxAgeHours: number;
    ageMinutes: number | null;
    summary: {
      total: number;
      enabled: number;
      updateAvailable: number;
      updated: number;
      upToDate: number;
      dirtyAllowed: number;
      dirtyBlocking: number;
      blocked: number;
      skipped: number;
    };
    countsByState: Record<string, number>;
    blockedEntries: Array<{
      name: string;
      path: string;
      state: string;
      error: string | null;
      command: string | null;
      remoteUrl: string | null;
      currentBranch: string | null;
      dirty: boolean | null;
      ahead: number | null;
      behind: number | null;
    }>;
  };
}

interface RepoSourcesApiResponse {
  ok?: boolean;
  action?: "refresh" | "set_flags";
  mode?: "check" | "update";
  scope?: "all" | "single";
  targetPath?: string | null;
  stderr?: string;
  busy?: boolean;
  snapshot?: RepoSourcesPanelClientProps["repoSources"];
}

export default function RepoSourcesPanelClient({ repoSources }: RepoSourcesPanelClientProps) {
  const router = useRouter();
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const status: "stable" | "updates" | "blocked" | "unavailable" | "stale" =
    !repoSources.available
      ? "unavailable"
      : repoSources.stale
        ? "stale"
        : repoSources.summary.blocked > 0
          ? "blocked"
          : repoSources.summary.updateAvailable > 0
            ? "updates"
            : "stable";

  function actionKey(
    action: "check" | "update" | "set_flags",
    scope: "all" | "single",
    targetPath?: string,
  ) {
    return `${action}:${scope}:${targetPath || "all"}`;
  }

  async function callRepoOpsApi(
    input:
      | { action: "refresh"; mode: "check" | "update"; scope: "all" | "single"; targetPath?: string }
      | { action: "set_flags"; targetPath: string; set: { track?: boolean; enabled?: boolean } },
    currentActionKey: string,
  ) {
    setActiveActionKey(currentActionKey);
    setStatusMessage("");
    try {
      const response = await fetch("/api/ops/repo-sources", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });

      const payload = (await response.json().catch(() => null)) as RepoSourcesApiResponse | null;
      if (!response.ok || !payload?.ok) {
        if (payload?.busy) {
          setStatusMessage("Repo sources operation already in progress.");
        } else {
          setStatusMessage(trimText(payload?.stderr || "Repo sources operation failed.", 180));
        }
        return;
      }

      const blocked = payload.snapshot?.summary.blocked ?? 0;
      const updates = payload.snapshot?.summary.updateAvailable ?? 0;
      if (input.action === "set_flags") {
        setStatusMessage(`Config updated: blocked=${blocked}, updates=${updates}.`);
      } else {
        const actionLabel = input.mode === "update" ? "Update complete" : "Refresh complete";
        setStatusMessage(`${actionLabel}: blocked=${blocked}, updates=${updates}.`);
      }
      router.refresh();
    } catch {
      setStatusMessage("Repo sources request failed.");
    } finally {
      setActiveActionKey(null);
    }
  }

  async function refreshAll(mode: "check" | "update") {
    if (mode === "update") {
      const confirmed = window.confirm(
        "Run repository update now? This executes tracked fast-forward pulls for clean repositories.",
      );
      if (!confirmed) return;
    }
    await callRepoOpsApi(
      { action: "refresh", mode, scope: "all" },
      actionKey(mode, "all"),
    );
  }

  async function runSingle(mode: "check" | "update", targetPath: string) {
    if (mode === "update") {
      const confirmed = window.confirm(`Update only this repo?\n${targetPath}`);
      if (!confirmed) return;
    }
    await callRepoOpsApi(
      { action: "refresh", mode, scope: "single", targetPath },
      actionKey(mode, "single", targetPath),
    );
  }

  async function setFlags(targetPath: string, set: { track?: boolean; enabled?: boolean }) {
    await callRepoOpsApi(
      { action: "set_flags", targetPath, set },
      actionKey("set_flags", "single", targetPath),
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-bg-panel/55 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="matte-section-title">Tracked repositories</div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
            repoSourcesStatusTone(status),
          )}
        >
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
        <div>total: <span className="text-text-primary">{repoSources.summary.total}</span></div>
        <div>enabled: <span className="text-text-primary">{repoSources.summary.enabled}</span></div>
        <div>up-to-date: <span className="text-text-primary">{repoSources.summary.upToDate}</span></div>
        <div>updates: <span className="text-text-primary">{repoSources.summary.updateAvailable}</span></div>
        <div>dirty (block): <span className="text-text-primary">{repoSources.summary.dirtyBlocking}</span></div>
        <div>blocked: <span className="text-text-primary">{repoSources.summary.blocked}</span></div>
      </div>

      {repoSources.blockedEntries.length > 0 ? (
        <div className="space-y-2">
          {repoSources.blockedEntries.slice(0, 3).map((entry) => {
            const rowKey = entry.path;
            const busyCheck = activeActionKey === actionKey("check", "single", rowKey);
            const busyUpdate = activeActionKey === actionKey("update", "single", rowKey);
            const busySetFlags = activeActionKey === actionKey("set_flags", "single", rowKey);
            return (
              <div key={`${entry.path}:${entry.state}`} className="rounded-lg border border-border bg-bg-panel px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-[11px] text-text-primary">
                    {trimText(entry.path, 54)}
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                    {entry.state}
                  </span>
                </div>
                {entry.error ? (
                  <div className="mt-1 text-[11px] text-text-muted">{trimText(entry.error, 140)}</div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runSingle("check", rowKey)}
                    disabled={activeActionKey !== null}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyCheck ? "Retrying..." : "Retry This"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSingle("update", rowKey)}
                    disabled={activeActionKey !== null}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyUpdate ? "Updating..." : "Update This"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void setFlags(rowKey, { track: false })}
                    disabled={activeActionKey !== null}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busySetFlags ? "Applying..." : "Untrack"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void setFlags(rowKey, { enabled: false })}
                    disabled={activeActionKey !== null}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary transition hover:bg-bg-card hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busySetFlags ? "Applying..." : "Disable"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void refreshAll("check")}
          disabled={activeActionKey !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", activeActionKey === actionKey("check", "all") && "animate-spin")} />
          Retry Sync Now
        </button>
        <button
          type="button"
          onClick={() => void refreshAll("update")}
          disabled={activeActionKey !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", activeActionKey === actionKey("update", "all") && "animate-spin")} />
          Update Repos
        </button>
        <Link
          href="/api/ops/repo-sources?view=blocked"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition hover:text-text-primary"
        >
          Blocked JSON
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/dashboard/report"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition hover:text-text-primary"
        >
          Open ops reports
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {repoSources.generatedAt ? (
        <div className="text-[11px] text-text-muted">
          last sync: {relativeTime(repoSources.generatedAt)}
          {repoSources.stale ? ` (stale > ${repoSources.maxAgeHours}h)` : ""}
        </div>
      ) : null}
      {statusMessage ? <div className="text-[11px] text-text-muted">{statusMessage}</div> : null}
    </div>
  );
}
