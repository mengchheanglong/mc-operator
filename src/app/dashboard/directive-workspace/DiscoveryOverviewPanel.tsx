"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DiscoverySubmissionPanel from "./DiscoverySubmissionPanel";

type TrackFile = {
  name: string;
  path: string;
};

type DiscoveryOverview = {
  ok: boolean;
  error?: string;
  rootPath: string;
  snapshotAt?: string;
  counts?: {
    intake: number;
    triage: number;
    routing: number;
    monitor: number;
    deferredOrRejected: number;
    reference: number;
  };
  latest?: {
    intake: TrackFile | null;
    triage: TrackFile | null;
    routing: TrackFile | null;
  };
  workflow?: {
    currentFocus: string;
  };
  queues?: {
    intake: string[];
    triage: string[];
    routing: string[];
    monitor: string[];
    deferredOrRejected: string[];
    reference: string[];
  };
  recentEntries?: Array<{
    candidateId: string;
    candidateName: string;
    sourceType: string;
    sourceReference: string;
    receivedAt: string;
    status: string;
    routingTarget: string | null;
    missionAlignment: string | null;
    capabilityGapId: string | null;
    fastPathRecordPath: string | null;
    routingRecordPath: string | null;
    resultRecordPath: string | null;
    routedAt: string | null;
    completedAt: string | null;
    notes: string | null;
  }>;
};

export default function DiscoveryOverviewPanel() {
  const [data, setData] = useState<DiscoveryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const response = await fetch("/api/directive-workspace/discovery/overview", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          discovery?: DiscoveryOverview;
          msg?: string;
        };

        if (!response.ok) {
          throw new Error(payload.msg || "Failed to load Directive Discovery view.");
        }

        if (!cancelled) {
          setData(payload.discovery || null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown Directive Discovery load error.",
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
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="matte-panel flex items-center gap-3 p-6 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        Loading Directive Discovery overview...
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
        No Directive Discovery data available.
      </section>
    );
  }

  if (!data.ok) {
    return (
      <section className="matte-panel p-6 text-sm text-status-warning">
        Directive Discovery source not available at:{" "}
        <span className="font-mono">{data.rootPath}</span>
      </section>
    );
  }

  const queueGroups: Array<{ label: string; items: string[] }> = [
    { label: "intake", items: data.queues?.intake || [] },
    { label: "triage", items: data.queues?.triage || [] },
    { label: "routing", items: data.queues?.routing || [] },
    { label: "monitor", items: data.queues?.monitor || [] },
    { label: "defer/reject", items: data.queues?.deferredOrRejected || [] },
    { label: "reference", items: data.queues?.reference || [] },
  ];

  return (
    <div className="space-y-6">
      <section className="matte-panel p-6">
        <h2 className="matte-panel-heading">Directive Discovery</h2>
        <div className="mt-2 text-xs text-text-secondary">
          Standalone front door for intake, first-pass triage, routing, and holding states.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">intake</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.intake ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">triage</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.triage ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">routing</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.routing ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">monitor</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.monitor ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">defer/reject</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.deferredOrRejected ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">reference</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.reference ?? 0}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-text-secondary">
          Focus: {data.workflow?.currentFocus || "n/a"}
        </div>
      </section>

      <DiscoverySubmissionPanel onSubmitted={() => setRefreshKey((value) => value + 1)} />

      <section className="matte-panel p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="matte-panel-heading">Recent discovery cases</h3>
          <div className="text-xs text-text-muted">
            {data.recentEntries?.length ?? 0} recent queue entr
            {(data.recentEntries?.length ?? 0) === 1 ? "y" : "ies"}
          </div>
        </div>
        {data.recentEntries && data.recentEntries.length > 0 ? (
          <div className="space-y-3">
            {data.recentEntries.map((entry) => (
              <div
                key={entry.candidateId}
                className="rounded-xl border border-border bg-bg-panel/55 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {entry.candidateName}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-text-muted">
                      {entry.candidateId}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {entry.status}
                    </span>
                    {entry.routingTarget && (
                      <span className="rounded-full border border-border px-2 py-0.5">
                        {entry.routingTarget}
                      </span>
                    )}
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {entry.sourceType}
                    </span>
                  </div>
                </div>
                <div
                  className="mt-2 truncate font-mono text-[11px] text-text-secondary"
                  title={entry.sourceReference}
                >
                  {entry.sourceReference}
                </div>
                <div className="mt-3 grid gap-3 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-text-muted">received</div>
                    <div className="mt-1 text-white">{entry.receivedAt}</div>
                  </div>
                  <div>
                    <div className="text-text-muted">routed</div>
                    <div className="mt-1 text-white">{entry.routedAt || "n/a"}</div>
                  </div>
                  <div>
                    <div className="text-text-muted">completed</div>
                    <div className="mt-1 text-white">{entry.completedAt || "n/a"}</div>
                  </div>
                  <div>
                    <div className="text-text-muted">capability gap</div>
                    <div className="mt-1 text-white">{entry.capabilityGapId || "n/a"}</div>
                  </div>
                </div>
                {(entry.missionAlignment || entry.notes) && (
                  <div className="mt-3 grid gap-3 text-xs text-text-secondary md:grid-cols-2">
                    <div>
                      <div className="text-text-muted">mission alignment</div>
                      <div className="mt-1 text-white">
                        {entry.missionAlignment || "n/a"}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">notes</div>
                      <div className="mt-1 text-white">{entry.notes || "n/a"}</div>
                    </div>
                  </div>
                )}
                <div className="mt-3 space-y-1 text-[11px] text-text-muted">
                  <div>fast-path: {entry.fastPathRecordPath || "n/a"}</div>
                  <div>routing: {entry.routingRecordPath || "n/a"}</div>
                  <div>result: {entry.resultRecordPath || "n/a"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            No recent discovery queue entries yet.
          </div>
        )}
      </section>

      <section className="matte-panel p-6">
        <h3 className="matte-panel-heading">Discovery queues</h3>
        <div className="mt-3 grid gap-2 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-3">
          {queueGroups.map(({ label, items }) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-bg-panel px-3 py-2"
            >
              <div className="text-text-muted">{label}</div>
              {items.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {items.map((item) => (
                    <li key={item} className="truncate" title={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-text-muted">none</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="matte-panel p-6">
        <h3 className="matte-panel-heading">Latest Discovery artifacts</h3>
        <div className="mt-3 space-y-2 text-xs text-text-secondary">
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">latest intake</div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">
              {data.latest?.intake?.path || "none"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">latest triage</div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">
              {data.latest?.triage?.path || "none"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">latest routing</div>
            <div className="mt-1 font-mono text-[11px] text-text-secondary">
              {data.latest?.routing?.path || "none"}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
