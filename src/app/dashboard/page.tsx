import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Clock3,
  Copy,
  FileText,
  FolderKanban,
  GitBranch,
  Network,
  ScrollText,
  Sparkles,
  Target,
  TerminalSquare,
} from "lucide-react";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { buildDashboardSnapshot } from "@/server/services/dashboard-service";
import RepoSourcesPanelClient from "./RepoSourcesPanelClient";

export const dynamic = "force-dynamic";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function formatDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dayKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusTone(status: "healthy" | "degraded" | "insufficient_data" | "warning") {
  if (status === "healthy") return "bg-status-success/15 text-status-success";
  if (status === "degraded") return "bg-status-error/15 text-status-error";
  if (status === "warning") return "bg-status-warning/15 text-status-warning";
  return "bg-status-warning/15 text-status-warning";
}

function nightlyTone(input: { available: boolean; stale: boolean; ok: boolean | null }) {
  if (!input.available) return "border border-border bg-bg-panel text-text-muted";
  if (input.stale) return "bg-status-warning/15 text-status-warning";
  if (input.ok === true) return "bg-status-success/15 text-status-success";
  if (input.ok === false) return "bg-status-error/15 text-status-error";
  return "border border-border bg-bg-panel text-text-muted";
}

function Section({
  title,
  subtitle,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="matte-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="matte-panel-heading">{title}</h2>
          {subtitle ? <p className="mt-1 matte-panel-copy">{subtitle}</p> : null}
        </div>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition hover:text-text-primary"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  title,
  value,
  detail,
  href,
  icon,
}: {
  title: string;
  value: number;
  detail: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="matte-panel group p-5 transition duration-200 hover:border-text-muted/18 hover:bg-bg-card"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-bg-panel text-text-primary transition group-hover:scale-105">
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-text-muted transition group-hover:text-white" />
      </div>
      <div className="space-y-1">
        <div className="matte-stat-value">{value}</div>
        <div className="matte-stat-label">{title}</div>
        <div className="matte-stat-copy">{detail}</div>
      </div>
    </Link>
  );
}

function SignalCard({
  title,
  value,
  detail,
  tone,
  href,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "fail" | "neutral";
  href: string;
}) {
  const toneClass =
    tone === "ok"
      ? "border-status-success/25 bg-status-success/10"
      : tone === "warn"
        ? "border-status-warning/25 bg-status-warning/10"
        : tone === "fail"
          ? "border-status-error/25 bg-status-error/10"
          : "border-border bg-bg-panel/65";
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border p-4 transition hover:border-text-muted/18 hover:bg-bg-card",
        toneClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-text-muted transition group-hover:text-white" />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[12px] text-text-muted">{detail}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const dashboard = await buildDashboardSnapshot(user.id, project);

  const activeQuests = dashboard.activeQuests.slice(0, 4);
  const recentRecords = dashboard.recentActivity.slice(0, 6);
  const changedFiles = dashboard.repoSnapshot.git.changedFiles.slice(0, 8);
  const verificationPresets = dashboard.repoSnapshot.verificationPresets.slice(0, 5);
  const recentCommits = dashboard.repoSnapshot.git.recentCommits.slice(0, 4);
  const quickSuggestions = dashboard.suggestions.slice(0, 3);

  const nightlyItems = [
    { id: "bundle", label: "Bundle", data: dashboard.nightlyOps.bundle },
    { id: "ops", label: "Ops Snapshot", data: dashboard.nightlyOps.opsHealthSnapshot },
    { id: "repo", label: "Repo Sources", data: dashboard.nightlyOps.repoSources },
    { id: "workspace", label: "Workspace Health", data: dashboard.nightlyOps.workspaceHealth },
    { id: "canary", label: "Canary", data: dashboard.nightlyOps.canary },
    { id: "orchestrator", label: "Orchestrator", data: dashboard.nightlyOps.orchestrator },
  ];
  const nightlyHealthyCount = nightlyItems.filter(
    (item) => item.data.available && item.data.stale === false && item.data.ok === true,
  ).length;
  const reliabilityTone = dashboard.reliabilityOps.status === "healthy"
    ? "ok"
    : dashboard.reliabilityOps.status === "degraded"
      ? "fail"
      : "warn";
  const hotspotTone = dashboard.nightlyOpsHotspotHealth.status === "healthy"
    ? "ok"
    : dashboard.nightlyOpsHotspotHealth.status === "warning"
      ? "fail"
      : "warn";
  const followupTone = dashboard.nightlyOpsHotspotFollowUp.questAction?.action === "created"
    || dashboard.nightlyOpsHotspotFollowUp.questAction?.action === "updated"
    ? "warn"
    : dashboard.nightlyOpsHotspotFollowUp.questAction?.action === "suppressed"
      ? "neutral"
      : "ok";
  const repoSyncTone = dashboard.repoSources.summary.blocked > 0
    ? "fail"
    : dashboard.repoSources.summary.updateAvailable > 0
      ? "warn"
      : "ok";

  return (
    <div className="flex h-full w-full overflow-y-auto">
      <div className="matte-page mx-auto flex w-full max-w-7xl px-6 py-8 sm:px-10">
        <section className="matte-panel p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="matte-header-copy">
              <h1 className="matte-hero-title">{dashboard.greeting}</h1>
              <p className="matte-subtitle">
                Focused control room for execution only: health, active work, and repo state.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5 text-xs">
                <span className="matte-chip">{dashboard.project.name}</span>
                <span className="matte-chip">{dashboard.project.relativePath}</span>
                <span className="matte-chip">
                  {dashboard.repoSnapshot.git.branch || "no-branch"}
                </span>
              </div>
            </div>

            <div className="matte-actions">
              <Link
                href={buildPromptPackHref("workspace")}
                className="matte-action-primary"
              >
                <Copy className="h-4 w-4" />
                Generate Task
              </Link>
              <Link href="/dashboard/report" className="matte-action-secondary">
                <ScrollText className="h-4 w-4" />
                Reports
              </Link>
              <Link href="/dashboard/quests" className="matte-action-secondary">
                <Target className="h-4 w-4" />
                Quests
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Open quests"
            value={dashboard.metrics.openQuests}
            detail="Current execution queue"
            href="/dashboard/quests"
            icon={<Target className="h-5 w-5" />}
          />
          <MetricCard
            title="Changed files"
            value={dashboard.metrics.changedFiles}
            detail="Working tree pressure"
            href={buildPromptPackHref("workspace")}
            icon={<FolderKanban className="h-5 w-5" />}
          />
          <MetricCard
            title="Reports"
            value={dashboard.overview.reportCount}
            detail="Runtime + delivery history"
            href="/dashboard/report"
            icon={<ScrollText className="h-5 w-5" />}
          />
          <MetricCard
            title="Knowledge docs"
            value={dashboard.overview.docCount}
            detail="Project memory surface"
            href="/dashboard/docs"
            icon={<FileText className="h-5 w-5" />}
          />
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SignalCard
            title="Runtime Reliability"
            value={dashboard.reliabilityOps.status}
            detail={`timeout ${dashboard.reliabilityOps.timeout_rate}, failover ${dashboard.reliabilityOps.failover_rate}`}
            tone={reliabilityTone}
            href="/dashboard/report"
          />
          <SignalCard
            title="Nightly Hotspots"
            value={dashboard.nightlyOpsHotspotHealth.status}
            detail={`flagged ${dashboard.nightlyOpsHotspotHealth.flaggedCount} of ${dashboard.nightlyOpsHotspotHealth.totalSteps}`}
            tone={hotspotTone}
            href="/api/ops/nightly?view=hotspots&flaggedOnly=true"
          />
          <SignalCard
            title="Hotspot Follow-up"
            value={dashboard.nightlyOpsHotspotFollowUp.questAction?.action || "none"}
            detail={`selected ${dashboard.nightlyOpsHotspotFollowUp.selectedCount} at ${dashboard.nightlyOpsHotspotFollowUp.minSeverity || "n/a"}`}
            tone={followupTone}
            href="/api/ops/nightly?view=hotspot-followup"
          />
          <SignalCard
            title="Repo Sync"
            value={
              dashboard.repoSources.summary.blocked > 0
                ? `${dashboard.repoSources.summary.blocked} blocked`
                : dashboard.repoSources.summary.updateAvailable > 0
                  ? `${dashboard.repoSources.summary.updateAvailable} updates`
                  : "stable"
            }
            detail={`tracked ${dashboard.repoSources.summary.total}, enabled ${dashboard.repoSources.summary.enabled}`}
            tone={repoSyncTone}
            href="/api/ops/repo-sources?view=blocked"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Execution Health"
            subtitle="Runtime stability + nightly health gates in one view."
            actionHref="/dashboard/report"
            actionLabel="Open reports"
          >
            <div className="space-y-3 rounded-xl border border-border bg-bg-panel/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    statusTone(dashboard.reliabilityOps.status),
                  )}
                >
                  Reliability {dashboard.reliabilityOps.status}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    statusTone(dashboard.nightlyOpsHotspotHealth.status),
                  )}
                >
                  Hotspots {dashboard.nightlyOpsHotspotHealth.status}
                </span>
                <span className="rounded-full border border-border bg-bg-panel px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  Follow-up {dashboard.nightlyOpsHotspotFollowUp.questAction?.action || "none"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-panel/40 p-3 text-xs text-text-secondary">
                <div className="flex items-center justify-between gap-2">
                  <span>Timeout rate</span>
                  <span className="font-medium text-text-primary">{dashboard.reliabilityOps.timeout_rate}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Failover rate</span>
                  <span className="font-medium text-text-primary">{dashboard.reliabilityOps.failover_rate}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Nightly gates</span>
                  <span className="font-medium text-text-primary">{nightlyHealthyCount}/{nightlyItems.length}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Flagged steps</span>
                  <span className="font-medium text-text-primary">{dashboard.nightlyOpsHotspotHealth.flaggedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>High alerts</span>
                  <span className="font-medium text-text-primary">{dashboard.nightlyOpsHotspotAlerts.bySeverity.high}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Follow-up selected</span>
                  <span className="font-medium text-text-primary">{dashboard.nightlyOpsHotspotFollowUp.selectedCount}</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {nightlyItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-bg-panel px-3 py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[11px] text-text-secondary">{item.label}</div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                          nightlyTone(item.data),
                        )}
                      >
                        {!item.data.available
                          ? "missing"
                          : item.data.stale
                            ? "stale"
                            : item.data.ok === true
                              ? "ok"
                              : item.data.ok === false
                                ? "fail"
                                : "unknown"}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted">{item.data.detail}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px]">
                <span className="matte-section-title shrink-0">Debug</span>
                <Link href="/api/ops/nightly?view=failing" className="text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
                  nightly failing
                </Link>
                <Link href="/api/ops/nightly?view=hotspot-alerts" className="text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
                  hotspot alerts
                </Link>
                <Link href="/api/ops/nightly?view=hotspot-followup" className="text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
                  hotspot follow-up
                </Link>
                <Link href="/api/ops/health?view=failing" className="text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
                  ops failing
                </Link>
              </div>
            </div>
          </Section>

          <Section
            title="Active Work"
            subtitle="Top suggestions and quest queue for your next execution pass."
            actionHref="/dashboard/quests"
            actionLabel="Open quests"
          >
            <div className="space-y-4 rounded-xl border border-border bg-bg-panel/55 p-4">
              <div className="space-y-2">
                <div className="matte-section-title px-1">Suggestions</div>
                {quickSuggestions.length > 0 ? (
                  <div className="space-y-1.5">
                    {quickSuggestions.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="block rounded-lg border border-border bg-bg-panel px-3 py-2 transition hover:border-text-muted/18 hover:bg-bg-card"
                      >
                        <div className="text-sm font-semibold text-white">{item.title}</div>
                        <div className="mt-1 text-[12px] text-text-muted">{item.description}</div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-[12px] text-text-muted">
                    No prioritized suggestions right now.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="matte-section-title px-1">Active Quests</div>
                {activeQuests.length > 0 ? (
                  <div className="space-y-1.5">
                    {activeQuests.map((quest) => (
                      <div
                        key={quest.id}
                        className="rounded-lg border border-border bg-bg-panel px-3 py-2"
                      >
                        <div className="text-sm font-semibold text-white">{quest.goal}</div>
                        <div className="mt-1 text-[11px] text-text-muted">
                          {quest.difficulty} · {relativeTime(quest.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-[12px] text-text-muted">
                    No active quests.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-panel/40 px-3 py-2 text-[11px] text-text-muted">
                <span className="matte-section-title shrink-0">Today</span>
                <span>
                  {dashboard.todayLog.entryCount > 0
                    ? `${dashboard.todayLog.entryCount} updates logged on ${formatDayLabel(dashboard.todayLog.dayKey)}`
                    : `No updates logged yet for ${formatDayLabel(dashboard.todayLog.dayKey)}`}
                </span>
              </div>
            </div>
          </Section>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
          <Section
            title="Repository Execution State"
            subtitle="What changed, how to verify, and recent commit context."
            actionHref={buildPromptPackHref("workspace")}
            actionLabel="Build handoff"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-bg-panel/58 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Active repo
                    </div>
                    <div className="mt-2 matte-panel-heading">{dashboard.project.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-text-primary">
                      {dashboard.project.relativePath}
                    </div>
                  </div>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-panel text-text-primary">
                    <GitBranch className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 matte-panel-copy">
                  {dashboard.repoSnapshot.git.summary}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Changed Files</div>
                  </div>
                  {changedFiles.length === 0 ? (
                    <div className="matte-panel-copy">Working tree is clean.</div>
                  ) : (
                    <div className="space-y-2">
                      {changedFiles.map((change) => (
                        <div
                          key={`${change.status}-${change.path}`}
                          className="rounded-lg border border-border bg-bg-panel px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[11px] text-text-primary">
                              {trimText(change.path, 46)}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                              {change.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Verification</div>
                  </div>
                  {verificationPresets.length === 0 ? (
                    <div className="matte-panel-copy">
                      No stable verification commands detected yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {verificationPresets.map((preset) => (
                        <div
                          key={preset.command}
                          className="rounded-lg border border-border bg-bg-panel px-3 py-2"
                        >
                          <div className="text-[11px] font-semibold text-white">{preset.label}</div>
                          <div className="mt-1 font-mono text-[11px] text-text-primary">
                            {preset.command}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {recentCommits.length > 0 ? (
                <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Recent Commits</div>
                  </div>
                  <div className="space-y-2">
                    {recentCommits.map((commit) => (
                      <div
                        key={commit.hash}
                        className="rounded-lg border border-border bg-bg-panel px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-white">{commit.subject}</span>
                          <span className="font-mono text-[11px] text-text-muted">{commit.hash}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-text-muted">{commit.date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <div className="space-y-6">
            <Section
              title="Repo Sources"
              subtitle="Track blocked syncs and update targets."
            >
              {!dashboard.repoSources.available ? (
                <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-sm text-text-muted">
                  No repo sync report found yet. Run `npm run ops:repo-sources:check -- --fetch`.
                </div>
              ) : (
                <RepoSourcesPanelClient repoSources={dashboard.repoSources} />
              )}
            </Section>

            <Section
              title="Recent Activity"
              subtitle="Last durable events across docs, reports, notes, and quests."
              actionHref="/dashboard/report"
              actionLabel="Open reports"
            >
              {recentRecords.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-sm text-text-muted">
                  No recent activity.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentRecords.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group flex items-start gap-3 rounded-lg border border-border bg-bg-panel px-3 py-2 transition hover:border-text-muted/18 hover:bg-bg-card"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-panel text-text-secondary">
                        {item.kind === "report" ? (
                          <Activity className="h-4 w-4" />
                        ) : item.kind === "doc" ? (
                          <FileText className="h-4 w-4" />
                        ) : item.kind === "quest" ? (
                          <Target className="h-4 w-4" />
                        ) : (
                          <Clock3 className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{item.title}</span>
                          <span className="text-[11px] text-text-muted">{relativeTime(item.timestamp)}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-text-muted">{trimText(item.description, 120)}</div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:text-white" />
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Assistant Readiness"
              subtitle="Collaboration scaffold quality for this repo."
              actionHref="/dashboard/directive-workspace"
              actionLabel="Open Directive"
            >
              <div className="rounded-xl border border-border bg-bg-panel/58 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Project score
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-white">
                      {dashboard.assistantReadiness.score}
                      <span className="ml-1 text-base text-text-muted">/100</span>
                    </div>
                  </div>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-panel text-text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-sm text-text-muted">
                  {dashboard.assistantReadiness.summary}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/dashboard/docs" className="text-xs text-text-primary underline-offset-2 hover:underline">
                    docs
                  </Link>
                  <Link href="/dashboard/graph" className="text-xs text-text-primary underline-offset-2 hover:underline">
                    graph
                  </Link>
                  <Link href={buildPromptPackHref("workspace")} className="text-xs text-text-primary underline-offset-2 hover:underline">
                    generate task
                  </Link>
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    <Network className="h-3 w-3" />
                    linked surfaces active
                  </span>
                </div>
              </div>
            </Section>
          </div>
        </section>
      </div>
    </div>
  );
}
