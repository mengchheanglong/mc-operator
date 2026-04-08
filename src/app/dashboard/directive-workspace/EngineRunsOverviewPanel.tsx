import Link from "next/link";
import { readDirectiveEngineRunsOverview } from "@/server/services/directive-engine-run-read-service";

function badgeClass(value: string) {
  if (value === "forge" || value === "direct" || value === "route_to_forge_follow_up") {
    return "border-status-info/50 text-status-info";
  }
  if (
    value === "architecture"
    || value === "meta"
    || value === "accept_for_architecture"
  ) {
    return "border-status-success/50 text-status-success";
  }
  if (value === "discovery" || value === "hold_in_discovery" || value === "structural") {
    return "border-status-warning/50 text-status-warning";
  }
  return "border-border text-text-secondary";
}

function trimText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export default async function EngineRunsOverviewPanel() {
  const overview = readDirectiveEngineRunsOverview({ maxRuns: 5 });

  if (!overview.ok) {
    return (
      <section className="matte-panel p-6">
        <h2 className="matte-panel-heading">Directive Engine runs</h2>
        <div className="mt-2 text-xs text-text-secondary">
          Mission Control read-only consumer for persisted standalone-host Engine artifacts.
        </div>
        <div className="mt-4 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
          No persisted Engine runs found yet at{" "}
          <span className="font-mono">{overview.engineRunsRoot}</span>
        </div>
        <div className="mt-3 text-xs text-text-muted">
          Use the standalone host Discovery front door with{" "}
          <span className="font-mono">--process-with-engine</span> to materialize
          run artifacts first.
        </div>
      </section>
    );
  }

  return (
    <section className="matte-panel p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="matte-panel-heading">Directive Engine runs</h2>
          <div className="mt-1 text-xs text-text-secondary">
            Mission Control reads persisted standalone-host Engine run records and paired
            Markdown reports directly, without remapping them into legacy capability CRUD.
          </div>
        </div>
        <div className="text-xs text-text-muted">{overview.snapshotAt}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">total runs</div>
          <div className="mt-1 text-xl font-semibold text-white">{overview.totalRuns}</div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">Discovery lane</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {overview.counts.discovery}
          </div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">Architecture lane</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {overview.counts.architecture}
          </div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">Forge lane</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {overview.counts.forge}
          </div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">direct usefulness</div>
          <div className="mt-1 text-xl font-semibold text-white">{overview.counts.direct}</div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">structural usefulness</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {overview.counts.structural}
          </div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">meta usefulness</div>
          <div className="mt-1 text-xl font-semibold text-white">{overview.counts.meta}</div>
        </div>
        <div className="matte-panel p-3">
          <div className="text-xs text-text-muted">human review</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {overview.counts.humanReview}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
          <div className="text-text-muted">hold in Discovery</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {overview.counts.holdInDiscovery}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
          <div className="text-text-muted">route to Forge</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {overview.counts.routeToForge}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
          <div className="text-text-muted">accept for Architecture</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {overview.counts.acceptForArchitecture}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
          <div className="text-text-muted">invalid artifacts skipped</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {overview.invalidArtifacts}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
        <div className="text-text-muted">artifact root</div>
        <div className="mt-1 font-mono text-[11px] text-text-secondary">
          {overview.engineRunsRoot}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-text-muted">latest run record</div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">
              {overview.latest.recordPath || "none"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">latest Markdown report</div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">
              {overview.latest.reportPath || "none"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {overview.recentRuns.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-sm text-text-secondary">
            No persisted Engine run artifacts yet.
          </div>
        ) : (
          overview.recentRuns.map((run) => (
            <div
              key={run.record.runId}
              className="rounded-xl border border-border bg-bg-panel/55 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {run.record.candidate.candidateName}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-text-muted">
                    {run.record.runId}
                  </div>
                </div>
                <Link
                  href={`/dashboard/directive-workspace/engine-runs/${encodeURIComponent(run.record.runId)}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-secondary transition hover:bg-bg-card hover:text-white"
                >
                  Open detail
                </Link>
                <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
                  <span
                    className={[
                      "rounded-full border px-2 py-0.5",
                      badgeClass(run.record.selectedLane.laneId),
                    ].join(" ")}
                  >
                    {run.record.selectedLane.laneId}
                  </span>
                  <span
                    className={[
                      "rounded-full border px-2 py-0.5",
                      badgeClass(run.record.candidate.usefulnessLevel),
                    ].join(" ")}
                  >
                    {run.record.candidate.usefulnessLevel}
                  </span>
                  <span
                    className={[
                      "rounded-full border px-2 py-0.5",
                      badgeClass(run.record.decision.decisionState),
                    ].join(" ")}
                  >
                    {run.record.decision.decisionState}
                  </span>
                </div>
              </div>

              <div
                className="mt-2 truncate font-mono text-[11px] text-text-secondary"
                title={run.record.source.sourceRef}
              >
                {run.record.source.sourceRef}
              </div>

              <div className="mt-3 grid gap-3 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-text-muted">received</div>
                  <div className="mt-1 text-white">{run.record.receivedAt}</div>
                </div>
                <div>
                  <div className="text-text-muted">source type</div>
                  <div className="mt-1 text-white">{run.record.source.sourceType}</div>
                </div>
                <div>
                  <div className="text-text-muted">proof kind</div>
                  <div className="mt-1 text-white">{run.record.proofPlan.proofKind}</div>
                </div>
                <div>
                  <div className="text-text-muted">integration mode</div>
                  <div className="mt-1 text-white">
                    {run.record.integrationProposal.integrationMode}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-xs text-text-secondary md:grid-cols-2">
                <div>
                  <div className="text-text-muted">usefulness rationale</div>
                  <div className="mt-1 text-white">
                    {trimText(run.record.analysis.usefulnessRationale, 220)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">report-backed summary</div>
                  <div className="mt-1 text-white">
                    {trimText(run.reportExcerpt || run.record.reportPlan.summary, 220)}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[11px] text-text-muted">
                <div className="font-mono">record: {run.recordPath}</div>
                <div className="font-mono">report: {run.reportPath || "none"}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
