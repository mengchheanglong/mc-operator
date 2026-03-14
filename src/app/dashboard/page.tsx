import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileCode2,
  FileText,
  FolderKanban,
  GitBranch,
  Network,
  ScrollText,
  Sparkles,
  StickyNote,
  Target,
  TerminalSquare,
  Clock3,
} from "lucide-react";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { buildDashboardSnapshot } from "@/server/services/dashboard-service";

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
  if (normalized.length <= maxLength) {
    return normalized;
  }

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

function difficultyTone(difficulty: string) {
  switch (difficulty) {
    case "easy":
    case "hard":
    case "nightmare":
    case "hell":
    case "normal":
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

export default async function DashboardPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const dashboard = await buildDashboardSnapshot(user.id, project);

  const activeQuests = dashboard.activeQuests.slice(0, 3);
  const recentRecords = dashboard.recentActivity.slice(0, 6);
  const changedFiles = dashboard.repoSnapshot.git.changedFiles.slice(0, 6);
  const verificationPresets = dashboard.repoSnapshot.verificationPresets.slice(0, 4);
  const recentCommits = dashboard.repoSnapshot.git.recentCommits.slice(0, 3);

  return (
    <div className="flex h-full w-full overflow-y-auto">
      <div className="matte-page mx-auto flex w-full max-w-7xl px-6 py-8 sm:px-10">
        <section className="matte-panel overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="matte-header-copy">
              <h1 className="matte-hero-title">{dashboard.greeting}</h1>
              <p className="matte-subtitle">
                Keep the active project, current repo state, next work, and agent-task
                inputs in one place before jumping back into the IDE or OpenClaw.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5 text-xs">
                <span className="matte-chip">{dashboard.project.name}</span>
                <span className="matte-chip">{dashboard.project.relativePath}</span>
                <span className="matte-chip">{dashboard.overview.docCount} docs</span>
                <span className="matte-chip">{dashboard.metrics.openQuests} open quests</span>
                <span className="matte-chip">{dashboard.overview.reportCount} reports</span>
                <span className="matte-chip">
                  {dashboard.metrics.changedFiles} changed files
                </span>
                {dashboard.repoSnapshot.git.branch ? (
                  <span className="matte-chip">{dashboard.repoSnapshot.git.branch}</span>
                ) : null}
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
              <Link href="/dashboard/docs" className="matte-action-secondary">
                <FileText className="h-4 w-4" />
                Docs
              </Link>
              <Link href="/dashboard/graph" className="matte-action-secondary">
                <Network className="h-4 w-4" />
                Graph
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Open quests"
            value={dashboard.metrics.openQuests}
            detail="Current work still in motion"
            href="/dashboard/quests"
            icon={<Target className="h-5 w-5" />}
          />
          <MetricCard
            title="Reports"
            value={dashboard.overview.reportCount}
            detail="Durable session and system records"
            href="/dashboard/report"
            icon={<ScrollText className="h-5 w-5" />}
          />
          <MetricCard
            title="Docs"
            value={dashboard.overview.docCount}
            detail="Project knowledge and durable notes"
            href="/dashboard/docs"
            icon={<FileText className="h-5 w-5" />}
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
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Work Summary"
            subtitle="Current quest flow and the areas seeing the most activity."
            actionHref="/dashboard/quests"
            actionLabel="Open quests"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                <div className="matte-section-title">Quest status</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                    <div className="text-xs text-text-muted">Open</div>
                    <div className="mt-1 text-xl font-semibold text-white">{dashboard.workSummary.questStatusCounts.open}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                    <div className="text-xs text-text-muted">In Progress</div>
                    <div className="mt-1 text-xl font-semibold text-white">{dashboard.workSummary.questStatusCounts.inProgress}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                    <div className="text-xs text-text-muted">Blocked</div>
                    <div className="mt-1 text-xl font-semibold text-white">{dashboard.workSummary.questStatusCounts.blocked}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                    <div className="text-xs text-text-muted">Done</div>
                    <div className="mt-1 text-xl font-semibold text-white">{dashboard.workSummary.questStatusCounts.done}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                <div className="matte-section-title">Top areas</div>
                <div className="mt-3 space-y-2">
                  {dashboard.workSummary.questAreas.length === 0 && dashboard.workSummary.reportAreas.length === 0 ? (
                    <div className="matte-panel-copy">No quest or report areas yet.</div>
                  ) : (
                    <>
                      {dashboard.workSummary.questAreas.map((item) => (
                        <div key={`quest-${item.area}`} className="flex items-center justify-between rounded-xl border border-border bg-bg-panel px-3 py-2">
                          <div className="text-sm text-text-primary">{item.area}</div>
                          <div className="text-xs text-text-muted">{item.count} quests</div>
                        </div>
                      ))}
                      {dashboard.workSummary.reportAreas.map((item) => (
                        <div key={`report-${item.area}`} className="flex items-center justify-between rounded-xl border border-border bg-bg-panel px-3 py-2">
                          <div className="text-sm text-text-primary">{item.area}</div>
                          <div className="text-xs text-text-muted">{item.count} reports</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Saved Views"
            subtitle="Jump back into the work slices you use repeatedly."
            actionHref="/dashboard/report"
            actionLabel="Open reports"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Link
                href="/dashboard/quests"
                className="rounded-xl border border-border bg-bg-panel/55 p-4 transition hover:border-text-muted/18 hover:bg-bg-card"
              >
                <div className="matte-panel-heading">Quest views</div>
                <div className="mt-1 matte-panel-copy">
                  Save filtered work slices by area, topic, and status from the Quests page.
                </div>
              </Link>
              <Link
                href="/dashboard/report"
                className="rounded-xl border border-border bg-bg-panel/55 p-4 transition hover:border-text-muted/18 hover:bg-bg-card"
              >
                <div className="matte-panel-heading">Report views</div>
                <div className="mt-1 matte-panel-copy">
                  Reopen linked, area-scoped, or category-scoped report streams without resetting filters.
                </div>
              </Link>
            </div>
          </Section>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
          <div className="space-y-6">
            <Section
              title="What To Resume"
              subtitle="The shortest path back into the current work."
            >
              {dashboard.resumeWork.length === 0 ? (
                <div className="matte-empty text-sm">No recent work to resume yet.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {dashboard.resumeWork.map((item) => {
                    const icon =
                      item.kind === "graph" ? (
                        <Network className="h-4 w-4" />
                      ) : item.kind === "note" ? (
                        <StickyNote className="h-4 w-4" />
                      ) : item.kind === "handoff" ? (
                        <Copy className="h-4 w-4" />
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
                        <div className="text-sm font-semibold text-white">{item.title}</div>
                        <div className="mt-1 matte-panel-copy">{item.description}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section
              title="Active Quest Stack"
              subtitle="Matches the open work shown in Quests."
              actionHref="/dashboard/quests"
              actionLabel="Open quests"
            >
              {activeQuests.length === 0 ? (
                <div className="matte-empty text-sm">
                  No open quests. Add the next objective from Quests.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeQuests.map((quest) => (
                    <div
                      key={quest.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-bg-panel/58 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="matte-panel-heading">{quest.goal}</div>
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
            </Section>

            <Section
              title="Today Work Log"
              subtitle="Today’s documentation and memory slice for this project."
              actionHref="/dashboard/report"
              actionLabel="Open daily log"
            >
              {dashboard.todayLog.entryCount === 0 ? (
                <div className="matte-empty text-sm">
                  No work log entries for {formatDayLabel(dashboard.todayLog.dayKey)} yet.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span className="matte-chip">
                      {formatDayLabel(dashboard.todayLog.dayKey)}
                    </span>
                    <span className="matte-chip">
                      {dashboard.todayLog.entryCount} update
                      {dashboard.todayLog.entryCount === 1 ? "" : "s"}
                    </span>
                    {dashboard.todayLog.areas.slice(0, 3).map((area) => (
                      <span key={area} className="matte-chip">
                        {area}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {dashboard.todayLog.entries.map((entry) => (
                      <Link
                        key={entry.id}
                        href="/dashboard/report"
                        className="group flex items-start gap-3 rounded-xl border border-border bg-bg-panel/55 px-4 py-3 transition hover:border-text-muted/18 hover:bg-bg-card"
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-panel text-text-secondary">
                          <Clock3 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="matte-panel-heading">{entry.title}</span>
                            <span className="text-[11px] text-text-muted">
                              {relativeTime(entry.date)}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                              {entry.status}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">
                            {trimText(entry.content, 120)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
                            <span>{entry.category}</span>
                            {entry.area ? <span>{entry.area}</span> : null}
                            {entry.topics.slice(0, 3).map((topic) => (
                              <span key={topic} className="matte-chip">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:text-white" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section
              title="Recent Records"
              subtitle="The latest durable items from reports, docs, notes, and completed quests."
              actionHref="/dashboard/report"
              actionLabel="Open reports"
            >
              {recentRecords.length === 0 ? (
                <div className="matte-empty text-sm">No recent records yet.</div>
              ) : (
                <div className="space-y-3">
                  {recentRecords.map((item) => {
                    const icon =
                      item.kind === "quest" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : item.kind === "report" ? (
                        <Activity className="h-4 w-4" />
                      ) : item.kind === "note" ? (
                        <StickyNote className="h-4 w-4" />
                      ) : (
                        <FileCode2 className="h-4 w-4" />
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
                            <span className="matte-panel-heading">{item.title}</span>
                            <span className="text-[11px] text-text-muted">
                              {relativeTime(item.timestamp)}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">{item.description}</div>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:text-white" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section
              title="Repo Snapshot"
              subtitle="The current code state that should drive the next brief."
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
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Changed Files</div>
                    </div>
                    {changedFiles.length === 0 ? (
                      <div className="mt-3 matte-panel-copy">Working tree is clean.</div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {changedFiles.map((change) => (
                          <div
                            key={`${change.status}-${change.path}`}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-[11px] text-text-primary">
                                {trimText(change.path, 44)}
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
                      <div className="matte-section-title">Verification</div>
                    </div>
                    {verificationPresets.length === 0 ? (
                      <div className="mt-3 matte-panel-copy">
                        No stable verification commands detected yet.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {verificationPresets.map((preset) => (
                          <div
                            key={preset.command}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="matte-panel-heading">{preset.label}</div>
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
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Recent Commits</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {recentCommits.map((commit) => (
                        <div
                          key={commit.hash}
                          className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="matte-panel-heading">{commit.subject}</span>
                            <span className="font-mono text-[11px] text-text-muted">
                              {commit.hash}
                            </span>
                          </div>
                          <div className="mt-1 matte-panel-copy">{commit.date}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section
              title="Code Context"
              subtitle="Readiness and the next task-generation inputs for OpenClaw or the IDE."
              actionHref="/dashboard/automations"
              actionLabel="Open Automations"
            >
              <div className="space-y-4">
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

                {/*
                <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="matte-panel-heading">CodeGraphContext</div>
                      <div className="mt-1 matte-panel-copy">
                        {dashboard.repoSnapshot.codeIntel.codeGraphContext.summary}
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {dashboard.repoSnapshot.codeIntel.codeGraphContext.status}
                    </span>
                  </div>

                  {dashboard.repoSnapshot.codeIntel.codeGraphContext.statsPreview.length > 0 ? (
                    <div className="mt-3 space-y-1 text-sm text-text-secondary">
                      {dashboard.repoSnapshot.codeIntel.codeGraphContext.statsPreview.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  ) : null}

                  {dashboard.repoSnapshot.codeIntel.codeGraphContext.queryPresets.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {dashboard.repoSnapshot.codeIntel.codeGraphContext.queryPresets
                        .slice(0, 3)
                        .map((item) => (
                          <div
                            key={item.command}
                            className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                              {item.label}
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-text-primary">
                              {item.command}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : null}

                  {dashboard.repoSnapshot.codeIntel.codeGraphContext.source === "cli" ? (
                    <div className="mt-4">
                      <CodeGraphContextIndexButton
                        label={
                          dashboard.repoSnapshot.codeIntel.codeGraphContext.indexed
                            ? "Refresh Repo Index"
                            : "Index Active Repo"
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  ) : null}
                </div>


                {false && (
                  <div className="rounded-xl border border-[#b3956c]/22 bg-[#b3956c]/10 p-4">
                    <div className="flex items-center gap-2 text-[#eadcc8]">
                      <AlertTriangle className="h-4 w-4" />
                      <div className="text-sm font-semibold">Knowledge gaps</div>
                    </div>
                    <div className="mt-2 text-sm text-[#eadcc8]/85">
                      {dashboard.metrics.unresolvedLinks > 0
                        ? `${dashboard.metrics.unresolvedLinks} unresolved links`
                        : "No unresolved links"}
                      {" · "}
                      {dashboard.metrics.orphanDocs > 0
                        ? `${dashboard.metrics.orphanDocs} orphan docs`
                        : "No orphan docs"}
                    </div>
                  </div>
                )}
                */}
              </div>
            </Section>
          </div>
        </section>
      </div>
    </div>
  );
}
