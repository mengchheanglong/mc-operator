import Link from "next/link";
import { readDirectiveEngineRunDetail } from "@/server/services/directive-engine-run-read-service";

export const dynamic = "force-dynamic";

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

function renderList(items: string[]) {
  if (items.length === 0) {
    return <div className="text-text-muted">n/a</div>;
  }

  return (
    <div className="space-y-1 text-white">
      {items.map((item) => (
        <div key={item}>{item}</div>
      ))}
    </div>
  );
}

export default async function DirectiveEngineRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const resolvedParams = await params;
  const runId = decodeURIComponent(resolvedParams.runId || "");
  const detail = readDirectiveEngineRunDetail({ runId });

  if (!detail.ok || !detail.record) {
    return (
      <div className="space-y-6">
        <section className="matte-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="matte-panel-heading">Directive Engine run detail</h1>
              <div className="mt-1 text-xs text-text-secondary">
                Mission Control read-only detail surface for one persisted Engine run.
              </div>
            </div>
            <Link
              href="/dashboard/directive-workspace"
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
            >
              Back to overview
            </Link>
          </div>
          <div className="mt-4 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
            Engine run not found for <span className="font-mono">{runId || "missing run id"}</span>
          </div>
          <div className="mt-3 text-xs text-text-muted">
            Artifact root: <span className="font-mono">{detail.engineRunsRoot}</span>
          </div>
        </section>
      </div>
    );
  }

  const { record } = detail;

  return (
    <div className="space-y-6">
      <section className="matte-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-text-muted">
              Directive Engine run detail
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {record.candidate.candidateName}
            </h1>
            <div className="mt-2 font-mono text-[11px] text-text-muted">{record.runId}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/directive-workspace"
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
            >
              Back to overview
            </Link>
            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                badgeClass(record.selectedLane.laneId),
              ].join(" ")}
            >
              {record.selectedLane.laneId}
            </span>
            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                badgeClass(record.candidate.usefulnessLevel),
              ].join(" ")}
            >
              {record.candidate.usefulnessLevel}
            </span>
            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                badgeClass(record.decision.decisionState),
              ].join(" ")}
            >
              {record.decision.decisionState}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">received</div>
            <div className="mt-1 text-white">{record.receivedAt}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">source type</div>
            <div className="mt-1 text-white">{record.source.sourceType}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">proof kind</div>
            <div className="mt-1 text-white">{record.proofPlan.proofKind}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">integration mode</div>
            <div className="mt-1 text-white">
              {record.integrationProposal.integrationMode}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">confidence</div>
            <div className="mt-1 text-white">{record.candidate.confidence}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">human review</div>
            <div className="mt-1 text-white">
              {record.candidate.requiresHumanReview || record.decision.requiresHumanApproval
                ? "required"
                : "not required"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">host dependence</div>
            <div className="mt-1 text-white">
              {record.integrationProposal.hostDependence}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3">
            <div className="text-text-muted">valuable without host runtime</div>
            <div className="mt-1 text-white">
              {record.integrationProposal.valuableWithoutHostRuntime ? "yes" : "no"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-xs text-text-secondary">
          <div className="text-text-muted">source reference</div>
          <div className="mt-1 font-mono text-[11px] text-white">{record.source.sourceRef}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="matte-panel p-6">
          <h2 className="matte-panel-heading">Analysis</h2>
          <div className="mt-4 space-y-4 text-sm text-text-secondary">
            <div>
              <div className="text-xs text-text-muted">mission fit</div>
              <div className="mt-1 text-white">{record.analysis.missionFitSummary}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">usefulness rationale</div>
              <div className="mt-1 text-white">{record.analysis.usefulnessRationale}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">primary adoption question</div>
              <div className="mt-1 text-white">
                {record.analysis.primaryAdoptionQuestion}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">routing rationale</div>
              <div className="mt-1">{renderList(record.candidate.rationale)}</div>
            </div>
          </div>
        </div>

        <div className="matte-panel p-6">
          <h2 className="matte-panel-heading">Decision</h2>
          <div className="mt-4 space-y-4 text-sm text-text-secondary">
            <div>
              <div className="text-xs text-text-muted">decision summary</div>
              <div className="mt-1 text-white">{record.decision.summary}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">decision rationale</div>
              <div className="mt-1">{renderList(record.decision.rationale)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">next action</div>
              <div className="mt-1 text-white">
                {record.integrationProposal.nextAction}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">report summary</div>
              <div className="mt-1 text-white">{record.reportPlan.summary}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="matte-panel p-6">
        <h2 className="matte-panel-heading">Artifacts</h2>
        <div className="mt-4 grid gap-4 text-xs text-text-secondary md:grid-cols-2">
          <div>
            <div className="text-text-muted">run record path</div>
            <div className="mt-1 font-mono text-[11px] text-white">
              {detail.recordPath || "none"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Markdown report path</div>
            <div className="mt-1 font-mono text-[11px] text-white">
              {detail.reportPath || "none"}
            </div>
          </div>
        </div>

        {detail.reportContent && (
          <div className="mt-4">
            <div className="text-xs text-text-muted">paired Markdown report</div>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg-panel/55 p-4 text-xs text-white">
              {detail.reportContent}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
