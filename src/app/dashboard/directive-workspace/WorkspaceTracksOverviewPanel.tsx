"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type TrackFile = {
  name: string;
  path: string;
};

type WorkspaceOverview = {
  ok: boolean;
  error?: string;
  rootPath: string;
  snapshotAt?: string;
  discovery?: {
    rootPath: string;
    counts: {
      intake: number;
      triage: number;
      routing: number;
      monitor: number;
      deferredOrRejected: number;
      reference: number;
    };
    latest: {
      intake: TrackFile | null;
      triage: TrackFile | null;
      routing: TrackFile | null;
    };
    workflow: {
      currentFocus: string;
    };
  };
  forge?: {
    rootPath: string;
    counts: {
      followUp: number;
      records: number;
      promotionRecords: number;
      registry: number;
      coreModules: number;
    };
    lifecycleArtifacts?: {
      strictRequiredCapabilities: number;
      strictBoundCapabilities: number;
      strictMissingCapabilities: number;
      strictValidCapabilities: number;
      strictInvalidCapabilities: number;
      strictCoveragePercent: number;
      strictValidCoveragePercent: number;
    };
    latest: {
      followUp: TrackFile | null;
      record: TrackFile | null;
      promotion: TrackFile | null;
      registry: TrackFile | null;
    };
    workflow: {
      currentFocus: string;
      host: string;
      runtimeHosted: boolean;
    };
  };
  architecture?: {
    rootPath: string;
    error?: string;
    counts?: {
      intakeCandidates: number;
      triageNotes: number;
      experimentNotes: number;
      adoptedNotes: number;
      deferredNotes: number;
    };
    decisionCounts?: {
      accept_for_architecture: number;
      forge_follow_up: number;
      experiment: number;
      monitor: number;
      defer: number;
      reject: number;
      knowledge_only: number;
    };
    workflow?: {
      currentFocus: string;
    };
  };
};

function latestLabel(file: TrackFile | null | undefined) {
  return file?.name || "none";
}

export default function WorkspaceTracksOverviewPanel() {
  const [data, setData] = useState<WorkspaceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const response = await fetch("/api/directive-workspace/workspace/overview", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          workspace?: WorkspaceOverview;
          msg?: string;
        };

        if (!response.ok) {
          throw new Error(payload.msg || "Failed to load workspace overview.");
        }

        if (!cancelled) {
          setData(payload.workspace || null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown workspace overview error.",
          );
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="matte-panel flex items-center gap-3 p-6 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        Loading standalone Directive Workspace tracks...
      </section>
    );
  }

  if (error) {
    return (
      <section className="matte-panel p-6 text-sm text-status-error">{error}</section>
    );
  }

  if (!data) {
    return (
      <section className="matte-panel p-6 text-sm text-text-secondary">
        No standalone Directive Workspace data available.
      </section>
    );
  }

  if (!data.ok) {
    return (
      <section className="matte-panel p-6 text-sm text-status-warning">
        Standalone Directive Workspace source not available at:{" "}
        <span className="font-mono">{data.rootPath}</span>
      </section>
    );
  }

  return (
    <section className="matte-panel p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="matte-panel-heading">Standalone track state</h2>
        <div className="text-xs text-text-muted">{data.snapshotAt || "n/a"}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
          <div className="text-sm font-semibold text-white">Directive Discovery</div>
          <div className="mt-1 text-xs text-text-secondary">
            {data.discovery?.workflow.currentFocus || "n/a"}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">intake</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.intake ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">triage</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.triage ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">routing</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.routing ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">monitor</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.monitor ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">defer/reject</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.deferredOrRejected ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">reference</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.discovery?.counts.reference ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-text-muted">
            <div>latest intake: {latestLabel(data.discovery?.latest.intake)}</div>
            <div>latest triage: {latestLabel(data.discovery?.latest.triage)}</div>
            <div>latest routing: {latestLabel(data.discovery?.latest.routing)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
          <div className="text-sm font-semibold text-white">Directive Forge</div>
          <div className="mt-1 text-xs text-text-secondary">
            {data.forge?.workflow.currentFocus || "n/a"}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">follow-up</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.counts.followUp ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">records</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.counts.records ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">promotion</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.counts.promotionRecords ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">registry</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.counts.registry ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-border bg-bg-panel px-3 py-2 text-xs">
            <div className="text-text-muted">canonical core modules</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {data.forge?.counts.coreModules ?? 0}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">strict required</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.lifecycleArtifacts?.strictRequiredCapabilities ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">strict bound</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.lifecycleArtifacts?.strictBoundCapabilities ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">strict missing</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.forge?.lifecycleArtifacts?.strictMissingCapabilities ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-border bg-bg-panel px-3 py-2 text-xs">
            <div className="text-text-muted">strict lifecycle coverage</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {data.forge?.lifecycleArtifacts?.strictCoveragePercent ?? 0}%
            </div>
            <div className="mt-1 text-[11px] text-text-secondary">
              valid coverage: {data.forge?.lifecycleArtifacts?.strictValidCoveragePercent ?? 0}
              %
            </div>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-text-muted">
            <div>host: {data.forge?.workflow.host || "n/a"}</div>
            <div>latest follow-up: {latestLabel(data.forge?.latest.followUp)}</div>
            <div>latest promotion: {latestLabel(data.forge?.latest.promotion)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-panel/55 p-4">
          <div className="text-sm font-semibold text-white">Directive Architecture</div>
          <div className="mt-1 text-xs text-text-secondary">
            {data.architecture?.workflow?.currentFocus ||
              data.architecture?.error ||
              "n/a"}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">intake</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.architecture?.counts?.intakeCandidates ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">experiments</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.architecture?.counts?.experimentNotes ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">accepted</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.architecture?.decisionCounts?.accept_for_architecture ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">Forge follow-up</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {data.architecture?.decisionCounts?.forge_follow_up ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">monitor/defer</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {(data.architecture?.decisionCounts?.monitor ?? 0) +
                  (data.architecture?.decisionCounts?.defer ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
              <div className="text-text-muted">reject/reference</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {(data.architecture?.decisionCounts?.reject ?? 0) +
                  (data.architecture?.decisionCounts?.knowledge_only ?? 0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
