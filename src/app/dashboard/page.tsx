import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  FolderKanban,
  GitBranch,
  Network,
  ScrollText,
  Sparkles,
  StickyNote,
  Tag,
  Target,
  Copy,
  TerminalSquare,
} from "lucide-react";
import { buildDashboardSnapshot } from "@/server/services/dashboard-service";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import BootstrapWorkspaceButton from "@/components/BootstrapWorkspaceButton";

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

function difficultyTone(difficulty: string) {
  switch (difficulty) {
    case "easy":
    case "hard":
    case "nightmare":
    case "hell":
    default:
      return "border-border bg-bg-panel text-text-secondary";
  }
}

function activityTone(tone: "default" | "success" | "warning" | undefined) {
  if (tone === "success" || tone === "warning") {
    return "border-border bg-bg-panel/72 text-text-primary";
  }

  return "border-border bg-bg-panel/55 text-text-secondary";
}

function metricTone(tone: "primary" | "warning" | "graph") {
  switch (tone) {
    case "warning":
    case "graph":
    default:
      return "border-border bg-bg-panel text-text-primary";
  }
}

function DashboardPanel({
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
          {subtitle ? (
            <p className="mt-1 matte-panel-copy">{subtitle}</p>
          ) : null}
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
  tone,
}: {
  title: string;
  value: number;
  detail: string;
  href: string;
  icon: ReactNode;
  tone: "primary" | "warning" | "graph";
}) {
  return (
    <Link
      href={href}
      className="matte-panel group p-5 transition duration-200 hover:border-text-muted/18 hover:bg-bg-card"
    >
      <div className="mb-5 flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border transition group-hover:scale-105",
            metricTone(tone),
          )}
        >
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

export default async function DashboardPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const dashboard = await buildDashboardSnapshot(user.id, project);

  return (
    <div className="flex h-full w-full overflow-y-auto">
      <div className="matte-page mx-auto flex w-full max-w-7xl px-6 py-8 sm:px-10">
        <section className="matte-panel overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="matte-header-copy">
              <h1 className="matte-hero-title">
                {dashboard.greeting}
              </h1>
              <p className="matte-subtitle">
                Mission Control is tracking the active project, current repo
                state, and the next work that is worth resuming across Docs,
                Graph, Quests, Notes, Reports, and Prompt Pack.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5 text-xs">
                <span className="matte-chip">
                  {dashboard.project.name}
                </span>
                <span className="matte-chip">
                  {dashboard.project.relativePath}
                </span>
                <span className="matte-chip">
                  {dashboard.overview.docCount} docs
                </span>
                <span className="matte-chip">
                  {dashboard.overview.decisionCount} decisions
                </span>
                <span className="matte-chip">
                  {dashboard.overview.connectionCount} graph connections
                </span>
                <span className="matte-chip">
                  {dashboard.metrics.changedFiles} changed files
                </span>
                <span className="matte-chip">
                  {dashboard.overview.reportCount} reports
                </span>
                {dashboard.repoSnapshot.git.branch ? (
                  <span className="matte-chip">
                    {dashboard.repoSnapshot.git.branch}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="matte-actions">
              <Link
                href={buildPromptPackHref("workspace")}
                className="matte-action-primary"
              >
                <Copy className="h-4 w-4" />
                Build Prompt Pack
              </Link>
              <Link
                href="/dashboard/docs"
                className="matte-action-secondary"
              >
                <FileText className="h-4 w-4" />
                Open Docs
              </Link>
              <Link
                href="/dashboard/graph"
                className="matte-action-secondary"
              >
                <Network className="h-4 w-4" />
                View Graph
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Open quests"
            value={dashboard.metrics.openQuests}
            detail="Current work still in motion"
            href="/dashboard/quests"
            icon={<Target className="h-5 w-5" />}
            tone="primary"
          />
          <MetricCard
            title="Pending notes"
            value={dashboard.metrics.pendingNotes}
            detail="Notes waiting for completion"
            href="/dashboard/notes"
            icon={<StickyNote className="h-5 w-5" />}
            tone="primary"
          />
          <MetricCard
            title="Unresolved links"
            value={dashboard.metrics.unresolvedLinks}
            detail="Knowledge gaps still pointing nowhere"
            href="/dashboard/docs"
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="warning"
          />
          <MetricCard
            title="Orphan docs"
            value={dashboard.metrics.orphanDocs}
            detail="Notes disconnected from the graph"
            href="/dashboard/graph"
            icon={<GitBranch className="h-5 w-5" />}
            tone="graph"
          />
          <MetricCard
            title="Changed files"
            value={dashboard.metrics.changedFiles}
            detail={
              dashboard.repoSnapshot.git.available
                ? dashboard.repoSnapshot.git.summary
                : "Git metadata unavailable for this repo"
            }
            href={buildPromptPackHref("workspace")}
            icon={<FolderKanban className="h-5 w-5" />}
            tone="primary"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
          <div className="space-y-6">
            <DashboardPanel
              title="Resume Work"
              subtitle="Pick up the latest note, graph node, or document focus."
            >
              {dashboard.resumeWork.length === 0 ? (
                <div className="matte-empty text-sm">
                  No recent work to resume yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {dashboard.resumeWork.map((item) => {
                    const icon =
                      item.kind === "graph" ? (
                        <Network className="h-4 w-4" />
                      ) : item.kind === "note" ? (
                        <StickyNote className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      );

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group rounded-xl border border-border bg-bg-panel/58 p-4 transition hover:border-text-muted/18 hover:bg-bg-card"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-panel text-text-secondary">
                            {icon}
                          </div>
                          <ArrowRight className="h-4 w-4 text-text-muted transition group-hover:text-white" />
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {item.title}
                        </div>
                        <div className="mt-1 matte-panel-copy">
                          {item.description}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel
              title="Active Quest Stack"
              subtitle="The first quests that still need movement."
              actionHref="/dashboard/quests"
              actionLabel="Open board"
            >
              {dashboard.activeQuests.length === 0 ? (
                <div className="matte-empty text-sm">
                  No open quests. Queue up the next objective from Docs or build a fresh Prompt Pack.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.activeQuests.map((quest) => (
                    <div
                      key={quest.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-bg-panel/58 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="matte-panel-heading">
                          {quest.goal}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 font-semibold uppercase tracking-[0.18em]",
                              difficultyTone(quest.difficulty),
                            )}
                          >
                            {quest.difficulty}
                          </span>
                          <span>Created {relativeTime(quest.date)}</span>
                        </div>
                      </div>
                      <Link
                        href="/dashboard/quests"
                        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-text-muted transition hover:text-white"
                      >
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel
              title="Recent Activity"
              subtitle="A merged feed of docs, notes, quests, and reports."
              actionHref="/dashboard/report"
              actionLabel="Open reports"
            >
              {dashboard.recentActivity.length === 0 ? (
                <div className="matte-empty text-sm">
                  No recent activity yet. Add a doc, note, quest, or report to seed the workspace.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.recentActivity.map((item) => {
                    const icon =
                      item.kind === "quest" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : item.kind === "report" ? (
                        <Activity className="h-4 w-4" />
                      ) : item.kind === "note" ? (
                        <StickyNote className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      );

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group flex items-start gap-3 rounded-xl border border-border bg-bg-panel/55 px-4 py-3 transition hover:border-text-muted/18 hover:bg-bg-card"
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                            activityTone(item.tone),
                          )}
                        >
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="matte-panel-heading">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-text-muted">
                              {relativeTime(item.timestamp)}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">
                            {item.description}
                          </div>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:text-white" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </DashboardPanel>
          </div>

          <div className="space-y-6">
            <DashboardPanel
              title="Knowledge Health"
              subtitle="Where the graph is strongest, weakest, and newest."
              actionHref="/dashboard/graph"
              actionLabel="Open graph"
            >
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link
                    href={
                      dashboard.health.mostConnectedDoc
                        ? `/dashboard/docs?doc=${encodeURIComponent(
                            dashboard.health.mostConnectedDoc.id,
                          )}`
                        : "/dashboard/docs"
                    }
                    className="rounded-xl border border-border bg-bg-panel/58 p-4 transition hover:border-text-muted/18 hover:bg-bg-card"
                  >
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Most connected
                    </div>
                    <div className="matte-panel-heading">
                      {dashboard.health.mostConnectedDoc?.title || "No connected docs yet"}
                    </div>
                    <div className="mt-1 matte-panel-copy">
                      {dashboard.health.mostConnectedDoc
                        ? `Degree ${dashboard.health.mostConnectedDoc.degree} - ${dashboard.health.mostConnectedDoc.outgoingCount} out / ${dashboard.health.mostConnectedDoc.incomingCount} in`
                        : "Link notes together to build the graph."}
                    </div>
                  </Link>

                  <Link
                    href={
                      dashboard.health.recentlyUpdatedDoc
                        ? `/dashboard/docs?doc=${encodeURIComponent(
                            dashboard.health.recentlyUpdatedDoc.id,
                          )}`
                        : "/dashboard/docs"
                    }
                    className="rounded-xl border border-border bg-bg-panel/58 p-4 transition hover:border-text-muted/18 hover:bg-bg-card"
                  >
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Recently updated
                    </div>
                    <div className="matte-panel-heading">
                      {dashboard.health.recentlyUpdatedDoc?.title || "No recent doc updates"}
                    </div>
                    <div className="mt-1 matte-panel-copy">
                      {dashboard.health.recentlyUpdatedDoc
                        ? `Updated ${relativeTime(dashboard.health.recentlyUpdatedDoc.updatedAt)}`
                        : "Open Docs to start building the knowledge base."}
                    </div>
                  </Link>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Unresolved references
                  </div>
                  {dashboard.health.unresolvedTargets.length === 0 ? (
                    <div className="matte-empty text-sm">
                      No unresolved doc links. The knowledge base is internally closed.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dashboard.health.unresolvedTargets.map((target) => (
                        <div
                          key={target.title}
                          className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="matte-panel-heading">
                              {target.title}
                            </span>
                            <span className="rounded-full border border-[#b3956c]/24 bg-[#b3956c]/12 px-2 py-0.5 text-[11px] font-semibold text-[#eadcc8]">
                              {target.count}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">
                            Referenced by{" "}
                            {target.sources.map((source) => source.title).join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Orphan docs
                  </div>
                  {dashboard.health.orphanDocs.length === 0 ? (
                    <div className="matte-empty text-sm">
                      No orphan docs. Everything is linked into the graph.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dashboard.health.orphanDocs.map((document) => (
                        <Link
                          key={document.id}
                          href={`/dashboard/docs?doc=${encodeURIComponent(document.id)}`}
                          className="flex items-center justify-between rounded-xl border border-border bg-bg-panel/55 px-4 py-3 transition hover:border-text-muted/18 hover:bg-bg-card"
                        >
                          <div>
                            <div className="matte-panel-heading">
                              {document.title}
                            </div>
                            <div className="mt-1 matte-panel-copy">
                              No incoming or outgoing connections yet
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-text-muted" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Top tags
                  </div>
                  {dashboard.health.topTags.length === 0 ? (
                    <div className="matte-empty text-sm">
                      No tags assigned to documents yet.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dashboard.health.topTags.map((entry) => (
                        <Link
                          key={entry.tag}
                          href="/dashboard/docs"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-panel/58 px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-text-muted/18 hover:text-white"
                        >
                          <Tag className="h-3 w-3 text-text-primary" />
                          {entry.tag}
                          <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-bold text-text-muted">
                            {entry.count}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {dashboard.health.staleDocs.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Stale docs
                    </div>
                    <div className="space-y-2">
                      {dashboard.health.staleDocs.map((document) => (
                        <Link
                          key={document.id}
                          href={`/dashboard/docs?doc=${encodeURIComponent(document.id)}`}
                          className="flex items-center justify-between rounded-xl border border-[#b3956c]/22 bg-[#b3956c]/10 px-4 py-3 transition hover:bg-[#b3956c]/14"
                        >
                          <div>
                            <div className="matte-panel-heading">
                              {document.title}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[0.72rem] text-[#eadcc8]/80">
                              <Clock className="h-3 w-3" />
                              Last updated {relativeTime(document.updatedAt)} - Degree {document.degree}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-[#eadcc8]/50" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Session Handoff"
              subtitle="Use the current git state and verification commands to frame the next IDE session."
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
                      <div className="mt-2 matte-panel-heading">
                        {dashboard.project.name}
                      </div>
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
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Changed Files</div>
                    </div>
                    {dashboard.repoSnapshot.git.changedFiles.length === 0 ? (
                      <div className="mt-3 matte-panel-copy">
                        Working tree is clean.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {dashboard.repoSnapshot.git.changedFiles.map((change) => (
                          <div
                            key={`${change.status}-${change.path}`}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-[11px] text-text-primary">
                                {change.path}
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
                    <div className="flex items-center gap-2">
                      <TerminalSquare className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Verification Commands</div>
                    </div>
                    {dashboard.repoSnapshot.verificationPresets.length === 0 ? (
                      <div className="mt-3 matte-panel-copy">
                        No stable verification commands detected yet.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {dashboard.repoSnapshot.verificationPresets.map((preset) => (
                          <div
                            key={preset.command}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="matte-panel-heading">
                              {preset.label}
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-text-primary">
                              {preset.command}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {dashboard.repoSnapshot.git.recentCommits.length > 0 ? (
                  <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Recent Commits</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {dashboard.repoSnapshot.git.recentCommits.map((commit) => (
                        <div
                          key={commit.hash}
                          className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="matte-panel-heading">
                              {commit.subject}
                            </span>
                            <span className="font-mono text-[11px] text-text-muted">
                              {commit.hash}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">
                            {commit.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Codex Readiness"
              subtitle="How prepared this project is for repeatable IDE collaboration."
              actionHref="/dashboard/prompt-pack"
              actionLabel="Open Prompt Pack"
            >
              <div className="space-y-5">
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
                  <div className="mt-3 matte-panel-copy">
                    {dashboard.assistantReadiness.summary}
                  </div>
                </div>

                <div className="space-y-2">
                  {dashboard.assistantReadiness.checks.map((check) => (
                    <Link
                      key={check.id}
                      href={check.href}
                      className="flex items-start gap-3 rounded-xl border border-border bg-bg-panel/55 px-4 py-3 transition hover:border-text-muted/18 hover:bg-bg-card"
                    >
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 rounded-full",
                          check.ready ? "bg-[#8ab886]" : "bg-[#b3956c]",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="matte-panel-heading">{check.label}</div>
                        <div className="mt-1 matte-panel-copy">{check.detail}</div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                    </Link>
                  ))}
                </div>

                <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Repo Shape</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dashboard.repoSnapshot.stack.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-text-secondary"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Surfaces
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-text-secondary">
                        {dashboard.repoSnapshot.dashboardSurfaces.slice(0, 5).map((surface) => (
                          <div key={surface}>{surface}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Scripts
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-text-secondary">
                        {dashboard.repoSnapshot.scripts.slice(0, 4).map((script) => (
                          <div key={script.name}>
                            <span className="font-medium text-white">{script.name}</span>
                            {" - "}
                            {script.command}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {dashboard.repoSnapshot.hotspots.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Hotspots
                      </div>
                      <div className="mt-2 space-y-2 text-sm text-text-secondary">
                        {dashboard.repoSnapshot.hotspots.map((hotspot) => (
                          <div
                            key={hotspot.path}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="font-mono text-[11px] text-text-primary">
                              {hotspot.path}
                            </div>
                            <div className="mt-1 matte-panel-copy">
                              {hotspot.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Code Intelligence
                    </div>
                    <div className="mt-2 rounded-xl border border-border bg-bg-panel px-3 py-3">
                      <div className="matte-panel-heading">
                        {dashboard.repoSnapshot.codeIntel.summary}
                      </div>
                      <div className="mt-2 font-mono text-[11px] text-text-primary">
                        {dashboard.repoSnapshot.codeIntel.overrideFilePath}
                      </div>
                      {dashboard.repoSnapshot.codeIntel.overrideError ? (
                        <div className="mt-2 text-xs text-[#eadcc8]">
                          Override error: {dashboard.repoSnapshot.codeIntel.overrideError}
                        </div>
                      ) : null}
                      {dashboard.repoSnapshot.codeIntel.tools.length === 0 ? (
                        <div className="mt-1 matte-panel-copy">
                          No language-specific semantic tooling was detected yet.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {dashboard.repoSnapshot.codeIntel.tools.map((tool) => (
                            <div
                              key={`${tool.language}-${tool.server}`}
                              className="rounded-xl border border-border bg-bg-base px-3 py-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="matte-panel-heading">
                                  {tool.language}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                    tool.status === "ready"
                                      ? "border-border bg-bg-panel text-text-secondary"
                                      : tool.status === "partial"
                                        ? "border-[#6f7694]/22 bg-[#6f7694]/10 text-text-primary"
                                        : "border-[#b3956c]/22 bg-[#b3956c]/10 text-[#eadcc8]",
                                  )}
                                >
                                  {tool.status}
                                </span>
                              </div>
                              <div className="mt-1 matte-panel-copy">
                                {tool.detail}
                              </div>
                              <div className="mt-2 text-[11px] text-text-muted">
                                {tool.server} - {tool.source}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {dashboard.repoSnapshot.codeIntel.notes.length > 0 ? (
                        <div className="mt-3 space-y-1 text-sm text-text-secondary">
                          {dashboard.repoSnapshot.codeIntel.notes.map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      ) : null}
                      {dashboard.repoSnapshot.codeIntel.suggestions.length > 0 ? (
                        <div className="mt-3 space-y-1 text-sm text-text-secondary">
                          {dashboard.repoSnapshot.codeIntel.suggestions.map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {dashboard.assistantReadiness.status !== "ready" ? (
                  <BootstrapWorkspaceButton
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                ) : null}
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Next Actions"
              subtitle="Workspace suggestions that can be turned into a focused Prompt Pack."
              actionHref={buildPromptPackHref("workspace")}
              actionLabel="Open Prompt Pack"
            >
              {dashboard.suggestions.length === 0 ? (
                <div className="matte-empty text-sm">
                  No suggested prompt packs yet. Build a workspace pack to start the first IDE brief.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.suggestions.map((suggestion) => (
                    <Link
                      key={suggestion.id}
                      href={suggestion.href}
                      className={cn(
                        "block rounded-xl border p-4 transition",
                        suggestion.tone === "warning"
                          ? "border-[#b3956c]/22 bg-[#b3956c]/10 hover:bg-[#b3956c]/14"
                          : suggestion.tone === "primary"
                            ? "border-border bg-bg-elevated hover:bg-bg-card"
                            : "border-[#6f7694]/22 bg-[#6f7694]/10 hover:bg-[#6f7694]/14",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-panel/75 text-text-primary">
                          <ScrollText className="h-4 w-4" />
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                          {suggestion.cta}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="matte-panel-heading">
                        {suggestion.title}
                      </div>
                      <div className="mt-1 matte-panel-copy">
                        {suggestion.description}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </DashboardPanel>
          </div>
        </section>
      </div>
    </div>
  );
}

