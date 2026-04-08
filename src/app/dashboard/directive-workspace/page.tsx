import Link from "next/link";
import {
  DIRECTIVE_WORKSPACE_V0,
  parseDirectiveIntegrationProof,
  type DirectiveFrameworkStatus,
} from "@/lib/directive-workspace/v0";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { listDirectiveWorkspaceRegistry } from "@/server/services/directive-workspace-read-service";
import ArchitectureOverviewPanel from "./ArchitectureOverviewPanel";
import DiscoveryOverviewPanel from "./DiscoveryOverviewPanel";
import { DirectiveLifecycleButton } from "./DirectiveLifecycleButton";
import EngineRunsOverviewPanel from "./EngineRunsOverviewPanel";
import WorkspaceTracksOverviewPanel from "./WorkspaceTracksOverviewPanel";

export const dynamic = "force-dynamic";

type DirectiveRegistryRow = ReturnType<typeof listDirectiveWorkspaceRegistry>[number];

function countByStatus(
  statuses: DirectiveFrameworkStatus[],
  target: DirectiveFrameworkStatus,
) {
  return statuses.filter((status) => status === target).length;
}

function trimText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function getLatestIntegrationProof(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return null;
  return parseDirectiveIntegrationProof(
    (metadata as Record<string, unknown>).latestIntegrationProof,
  );
}

function hasPromotionContract(row: DirectiveRegistryRow) {
  const latestIntegration = row.integrations[0];
  if (!latestIntegration) return false;
  return (
    Boolean(latestIntegration.owner) &&
    Boolean(latestIntegration.dueAt) &&
    Boolean(latestIntegration.targetRuntimeSurface) &&
    latestIntegration.requiredGates.length > 0 &&
    Boolean(latestIntegration.rollbackPlan)
  );
}

function isOverdue(row: DirectiveRegistryRow, nowMs: number) {
  const latestIntegration = row.integrations[0];
  if (!latestIntegration?.dueAt) return false;
  const dueAt = new Date(latestIntegration.dueAt).getTime();
  if (Number.isNaN(dueAt)) return false;
  return row.capability.runtimeStatus !== "callable" && dueAt < nowMs;
}

function formatDecisionLabel(decision: string | null | undefined) {
  if (decision === "adopt") return "framework-adopted";
  if (decision === "reject") return "rejected";
  if (decision === "defer") return "deferred";
  if (decision === "monitor") return "monitoring";
  return "no decision";
}

function formatRuntimeStatusLabel(status: string | null | undefined) {
  if (status === "callable") return "runtime-callable";
  if (status === "none") return "not-planned";
  return status || "unknown";
}

export default async function DirectiveWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const modeParam = Array.isArray(resolvedSearchParams.mode)
    ? resolvedSearchParams.mode[0]
    : resolvedSearchParams.mode;
  const mode =
    modeParam === "architecture"
      ? "architecture"
      : modeParam === "discovery"
        ? "discovery"
        : "directive";
  const architectureMode = mode === "architecture";
  const discoveryMode = mode === "discovery";
  const forgeMode = mode === "directive";
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const registry = listDirectiveWorkspaceRegistry({
    userId: user.id,
    projectId: project.id,
  });

  const frameworkStatuses = registry.map(
    (row) =>
      (row.capability.frameworkStatus ||
        (row.capability.status === "integrated" ? "decided" : row.capability.status) ||
        "intake") as DirectiveFrameworkStatus,
  );
  const intake = countByStatus(frameworkStatuses, "intake");
  const analyzed = countByStatus(frameworkStatuses, "analyzed");
  const experimenting = countByStatus(frameworkStatuses, "experimenting");
  const evaluated = countByStatus(frameworkStatuses, "evaluated");
  const decided = countByStatus(frameworkStatuses, "decided");
  const frameworkAdopted = registry.filter(
    (row) => row.latestDecision?.decision === "adopt",
  ).length;
  const runtimeCallable = registry.filter(
    (row) => row.capability.runtimeStatus === "callable",
  ).length;
  const adoptedMissingContract = registry.filter((row) => {
    if (row.latestDecision?.decision !== "adopt") return false;
    if (row.capability.runtimeStatus === "callable") return false;
    return !hasPromotionContract(row);
  }).length;
  const nowMs = Date.now();
  const overduePromotion = registry.filter((row) => isOverdue(row, nowMs)).length;
  const runtimeCallableMissingProof = registry.filter((row) => {
    if (row.capability.runtimeStatus !== "callable") return false;
    return !getLatestIntegrationProof(row.capability.metadata);
  }).length;
  const avgAdoptToCallableLeadTimeHours = (() => {
    const values = registry
      .map((row) => row.adoptToCallableLeadTimeHours)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.round(avg * 100) / 100;
  })();

  const frameworkMetrics = [
    { label: "intake", value: intake },
    { label: "analyzed", value: analyzed },
    { label: "experimenting", value: experimenting },
    { label: "evaluated", value: evaluated },
    { label: "decided", value: decided },
  ];

  const runtimeMetrics: Array<{
    label: string;
    value: string | number;
    alert?: "warning" | "error";
  }> = [
    { label: "framework-adopted", value: frameworkAdopted },
    { label: "runtime-callable", value: runtimeCallable },
    {
      label: "framework-adopted missing contract",
      value: adoptedMissingContract,
      alert: adoptedMissingContract > 0 ? "warning" : undefined,
    },
    {
      label: "promotion overdue",
      value: overduePromotion,
      alert: overduePromotion > 0 ? "error" : undefined,
    },
    {
      label: "avg adopt-to-callable",
      value:
        avgAdoptToCallableLeadTimeHours != null
          ? `${avgAdoptToCallableLeadTimeHours}h`
          : "n/a",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="matte-panel p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="inline-flex rounded-xl border border-border bg-bg-panel/55 p-1 text-xs">
            <Link
              href="/dashboard/directive-workspace?mode=directive"
              className={[
                "rounded-lg px-3 py-1.5 transition",
                forgeMode
                  ? "bg-bg-elevated text-white"
                  : "text-text-secondary hover:text-white",
              ].join(" ")}
            >
              Directive Forge
            </Link>
            <Link
              href="/dashboard/directive-workspace?mode=architecture"
              className={[
                "rounded-lg px-3 py-1.5 transition",
                architectureMode
                  ? "bg-bg-elevated text-white"
                  : "text-text-secondary hover:text-white",
              ].join(" ")}
            >
              Directive Architecture
            </Link>
            <Link
              href="/dashboard/directive-workspace?mode=discovery"
              className={[
                "rounded-lg px-3 py-1.5 transition",
                discoveryMode
                  ? "bg-bg-elevated text-white"
                  : "text-text-secondary hover:text-white",
              ].join(" ")}
            >
              Directive Discovery
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="matte-chip">
              <span className="text-text-muted">forge</span>
              <span className="mx-0.5 text-border">.</span>
              <span>runtime conversion + transformation</span>
            </span>
            <span className="matte-chip">
              <span className="text-text-muted">architecture</span>
              <span className="mx-0.5 text-border">.</span>
              <span>operating-code improvement</span>
            </span>
            <span className="matte-chip">
              <span className="text-text-muted">discovery</span>
              <span className="mx-0.5 text-border">.</span>
              <span>mission-aware intake + routing</span>
            </span>
            <span className="matte-chip text-text-muted">
              framework-adopted != runtime-callable
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="matte-hero-title">Directive Workspace</h1>
            <p className="matte-subtitle">
              {architectureMode
                ? "Directive Architecture: improve Directive Workspace itself through reusable operating code, routing logic, and adaptation mechanisms."
                : discoveryMode
                  ? "Directive Discovery: mission-aware source intake, filtering, capability-gap interpretation, and routing."
                  : "Directive Forge: convert extracted value into bounded runtime capability and behavior-preserving transformations."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="matte-chip">
                {architectureMode
                  ? "architecture view"
                  : discoveryMode
                    ? "discovery view"
                    : "forge view"}
              </span>
              <span className="matte-chip">public name: Directive Workspace</span>
              <span className="matte-chip">internal lanes: v0/v1/v2</span>
              <span className="matte-chip">Directive Discovery active front door</span>
              <span className="matte-chip">
                target: {DIRECTIVE_WORKSPACE_V0.primaryMetricTargetHours}h decision lead time
              </span>
              <span className="matte-chip">
                {DIRECTIVE_WORKSPACE_V0.supportedSourceTypes.join(", ")}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/60 p-4 text-xs text-text-secondary">
            <div className="font-semibold text-text-primary">Core commands</div>
            {architectureMode ? (
              <>
                <div className="mt-2 font-mono">npm run check:directive-workspace-health</div>
                <div className="mt-1 font-mono">npm run check:ops-stack</div>
                <div className="mt-1 font-mono">directive-workspace/architecture/02-experiments/*</div>
              </>
            ) : discoveryMode ? (
              <>
                <div className="mt-2 font-mono">directive-workspace/discovery/intake/*</div>
                <div className="mt-1 font-mono">directive-workspace/discovery/triage/*</div>
                <div className="mt-1 font-mono">directive-workspace/discovery/routing-log/*</div>
              </>
            ) : (
              <>
                <div className="mt-2 font-mono">npm run directive:seed:candidates</div>
                <div className="mt-1 font-mono">npm run check:directive-workspace-v0</div>
                <div className="mt-1 font-mono">npm run check:directive-workspace-health</div>
              </>
            )}
          </div>
        </div>

        {forgeMode && (
          <div className="mt-4 rounded-xl border border-border bg-bg-panel/40 px-4 py-2.5 text-xs text-text-muted">
            <span className="font-semibold text-text-secondary">Boundary: </span>
            Directive Forge covers intake -&gt; analysis -&gt; experiment -&gt; evaluation
            -&gt; decision -&gt; framework-adopted -&gt; promotion contract. Host runtime covers
            implementation -&gt; runtime-callable. Directive Architecture improves the framework
            itself and does not create callable runtime by default. Directive Discovery is
            the active intake, triage, and routing front door for both Forge and
            Architecture.
          </div>
        )}

        {forgeMode && runtimeCallableMissingProof > 0 && (
          <div className="mt-3 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
            {runtimeCallableMissingProof} runtime-callable capabilit
            {runtimeCallableMissingProof === 1 ? "y is" : "ies are"} missing proof. Run{" "}
            <span className="font-mono">npm run directive:backfill:proof</span> or use{" "}
            <span className="font-semibold">Run proof</span> per row.
          </div>
        )}
      </section>

      <WorkspaceTracksOverviewPanel />
      <EngineRunsOverviewPanel />

      {architectureMode ? (
        <ArchitectureOverviewPanel />
      ) : discoveryMode ? (
        <DiscoveryOverviewPanel />
      ) : (
        <>
          <section className="space-y-2">
            <div className="matte-section-title px-1">Framework stages</div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {frameworkMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="matte-panel flex min-h-[6rem] flex-col justify-between p-4"
                >
                  <div className="min-h-[2rem] text-xs text-text-muted">{metric.label}</div>
                  <div className="text-2xl font-semibold leading-none text-white">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="matte-section-title px-1">Adoption and runtime</div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {runtimeMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className={[
                    "matte-panel flex min-h-[6rem] flex-col justify-between p-4",
                    metric.alert === "error" ? "border-status-error/40" : "",
                    metric.alert === "warning" ? "border-status-warning/40" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="min-h-[2rem] text-xs text-text-muted">{metric.label}</div>
                  <div
                    className={[
                      "text-2xl font-semibold leading-none",
                      metric.alert === "error"
                        ? "text-status-error"
                        : metric.alert === "warning"
                          ? "text-status-warning"
                          : "text-white",
                    ].join(" ")}
                  >
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="matte-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="matte-panel-heading">Directive Forge registry</h2>
              <div className="text-xs text-text-muted">
                {registry.length} record{registry.length === 1 ? "" : "s"}
              </div>
            </div>

            {registry.length === 0 ? (
              <div className="matte-empty py-8 text-center">
                <div className="text-sm text-text-secondary">No capabilities yet.</div>
                <div className="mt-1.5 font-mono text-xs text-text-muted">
                  npm run directive:seed:candidates
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {registry.map((row) => {
                  const proof = getLatestIntegrationProof(row.capability.metadata);
                  const latestIntegration = row.integrations[0];
                  const proofMissing =
                    row.capability.runtimeStatus === "callable" && !proof;
                  const contractMissing =
                    row.latestDecision?.decision === "adopt" &&
                    row.capability.runtimeStatus !== "callable" &&
                    !hasPromotionContract(row);
                  const overdue = isOverdue(row, nowMs);

                  return (
                    <div
                      key={row.capability.id}
                      className={[
                        "rounded-xl border bg-bg-panel/55 p-4",
                        overdue
                          ? "border-status-error/40"
                          : contractMissing || proofMissing
                            ? "border-status-warning/30"
                            : "border-border",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-white">
                          {row.capability.title}
                        </div>
                        {(proofMissing || contractMissing || overdue) && (
                          <div className="flex flex-wrap gap-1.5">
                            {proofMissing && (
                              <span className="rounded-full border border-status-warning/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-status-warning">
                                proof missing
                              </span>
                            )}
                            {contractMissing && (
                              <span className="rounded-full border border-status-warning/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-status-warning">
                                contract missing
                              </span>
                            )}
                            {overdue && (
                              <span className="rounded-full border border-status-error/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-status-error">
                                overdue
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                            fw
                          </span>
                          <span
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted"
                            title="Framework status"
                          >
                            {row.capability.frameworkStatus || "unknown"}
                          </span>
                          {row.latestDecision && (
                            <span
                              className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted"
                              title="Latest decision"
                            >
                              {formatDecisionLabel(row.latestDecision.decision)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                            rt
                          </span>
                          <span
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted"
                            title="Runtime status"
                          >
                            {formatRuntimeStatusLabel(row.capability.runtimeStatus)}
                          </span>
                          {latestIntegration?.integrationMode && (
                            <span
                              className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted"
                              title="Integration mode"
                            >
                              {latestIntegration.integrationMode}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="mt-2 max-w-full truncate font-mono text-xs text-text-muted"
                        title={row.capability.sourceRef ?? undefined}
                      >
                        {row.capability.sourceRef}
                      </div>

                      <div className="mt-2 text-sm text-text-secondary">
                        {trimText(
                          row.capability.analysisSummary || "No analysis summary yet.",
                          180,
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                        <span>
                          {row.experiments.length} exp . {row.evaluations.length} eval .{" "}
                          {row.decisions.length} dec . {row.integrations.length} promotions
                        </span>
                        <span>owner: {latestIntegration?.owner || "unassigned"}</span>
                        <span>
                          due:{" "}
                          {latestIntegration?.dueAt
                            ? new Date(latestIntegration.dueAt).toISOString().slice(0, 10)
                            : "unset"}
                        </span>
                        <span>gates: {latestIntegration?.requiredGates?.length ?? 0}</span>
                        <span>
                          decision lead:{" "}
                          {row.decisionLeadTimeHours != null
                            ? `${row.decisionLeadTimeHours}h`
                            : "pending"}
                        </span>
                        <span>
                          callable lead:{" "}
                          {row.adoptToCallableLeadTimeHours != null
                            ? `${row.adoptToCallableLeadTimeHours}h`
                            : "pending"}
                        </span>
                      </div>

                      <div className="mt-3 border-t border-border/50 pt-3">
                        <DirectiveLifecycleButton
                          capabilityId={row.capability.id}
                          initialProof={proof}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="matte-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="matte-panel-heading">Directive Forge API entry points</h2>
              <Link
                href="/dashboard/report"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
              >
                Decision reports
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-text-muted">
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                GET /capabilities
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                POST /capabilities
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                GET /registry
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                GET /discovery/overview
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                GET /architecture/overview
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                POST /capabilities/[id]/proof
              </span>
              <span className="rounded-lg border border-border bg-bg-panel px-2.5 py-1">
                POST /capabilities/[id]/lifecycle
              </span>
            </div>
            <div className="mt-2 text-[10px] text-text-muted">
              Base: /api/directive-workspace
            </div>
          </section>
        </>
      )}
    </div>
  );
}
