"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ArchitectureCandidate = {
  name: string;
  stage:
    | "adopted"
    | "deferred_or_rejected"
    | "experimenting"
    | "triaged"
    | "intake";
  evidencePath: string | null;
  decisionState:
    | "accept_for_architecture"
    | "route_to_forge_follow_up"
    | "experiment"
    | "monitor"
    | "defer"
    | "reject"
    | "knowledge_only"
    | null;
  adoptionTarget:
    | "Directive Architecture"
    | "Directive Forge follow-up"
    | "Directive Discovery backlog"
    | "Knowledge/reference only"
    | null;
  followUpTarget: "Directive Forge follow-up" | null;
  hasForgeFollowUp: boolean;
};

type ArchitectureOverview = {
  ok: boolean;
  error?: string;
  rootPath: string;
  snapshotAt?: string;
  counts?: {
    intakeCandidates: number;
    triageNotes: number;
    experimentNotes: number;
    adoptedNotes: number;
    deferredNotes: number;
  };
  stageCounts?: {
    adopted: number;
    deferred_or_rejected: number;
    experimenting: number;
    triaged: number;
    intake: number;
  };
  decisionCounts?: {
    accept_for_architecture: number;
    route_to_forge_follow_up: number;
    experiment: number;
    monitor: number;
    defer: number;
    reject: number;
    knowledge_only: number;
    forge_follow_up: number;
    undecided: number;
  };
  latest?: {
    triage: { name: string; path: string } | null;
    experiment: { name: string; path: string } | null;
    adopted: { name: string; path: string } | null;
    deferred: { name: string; path: string } | null;
  };
  workflow?: {
    currentFocus: string;
    adoptedPlannedNext: string[];
    acceptedForArchitecture: string[];
    forgeFollowUp: string[];
    inExperiment: string[];
    monitorOrDefer: string[];
    rejectOrReference: string[];
    pending: string[];
  };
  closure?: {
    path: string | null;
    excerpt: string | null;
  };
  candidates?: ArchitectureCandidate[];
};

type ArchitectureStartResult = {
  created: boolean;
  startRelativePath: string;
};

function decisionBadgeClass(candidate: ArchitectureCandidate) {
  if (candidate.decisionState === "accept_for_architecture") {
    return "border-status-success/50 text-status-success";
  }
  if (
    candidate.decisionState === "experiment" ||
    candidate.decisionState === "route_to_forge_follow_up"
  ) {
    return "border-status-info/50 text-status-info";
  }
  if (
    candidate.decisionState === "monitor" ||
    candidate.decisionState === "defer"
  ) {
    return "border-status-warning/50 text-status-warning";
  }
  if (candidate.decisionState === "reject") {
    return "border-status-error/50 text-status-error";
  }
  if (candidate.decisionState === "knowledge_only") {
    return "border-border text-text-secondary";
  }
  if (candidate.stage === "triaged") return "border-border text-text-secondary";
  return "border-border text-text-muted";
}

function primaryLabel(candidate: ArchitectureCandidate) {
  if (candidate.decisionState === "accept_for_architecture") {
    return "accept for architecture";
  }
  if (candidate.decisionState === "route_to_forge_follow_up") {
    return "route to forge";
  }
  if (candidate.decisionState === "experiment") return "experiment";
  if (candidate.decisionState === "monitor") return "monitor";
  if (candidate.decisionState === "defer") return "defer";
  if (candidate.decisionState === "reject") return "reject";
  if (candidate.decisionState === "knowledge_only") return "knowledge only";
  if (candidate.stage === "triaged") return "triaged";
  return "intake";
}

export default function ArchitectureOverviewPanel() {
  const [data, setData] = useState<ArchitectureOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startBusyPath, setStartBusyPath] = useState<string | null>(null);
  const [startErrors, setStartErrors] = useState<Record<string, string>>({});
  const [startResults, setStartResults] = useState<Record<string, ArchitectureStartResult>>({});

  async function startArchitectureCandidate(candidate: ArchitectureCandidate) {
    if (!candidate.evidencePath) {
      return;
    }

    setStartBusyPath(candidate.evidencePath);
    setStartErrors((current) => {
      const next = { ...current };
      delete next[candidate.evidencePath as string];
      return next;
    });

    try {
      const response = await fetch(
        "/api/directive-workspace/architecture/handoff-start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            handoffPath: candidate.evidencePath,
          }),
        },
      );
      const payload = (await response.json()) as {
        msg?: string;
        start?: {
          created?: boolean;
          startRelativePath?: string;
        };
      };

      if (!response.ok || !payload.start?.startRelativePath) {
        throw new Error(payload.msg || "Failed to open bounded Architecture start.");
      }

      const startRelativePath = payload.start.startRelativePath;
      const created = payload.start.created === true;
      setStartResults((current) => ({
        ...current,
        [candidate.evidencePath as string]: {
          created,
          startRelativePath,
        },
      }));
    } catch (startError) {
      setStartErrors((current) => ({
        ...current,
        [candidate.evidencePath as string]:
          startError instanceof Error
            ? startError.message
            : "Unknown Architecture handoff start error.",
      }));
    } finally {
      setStartBusyPath(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const response = await fetch(
          "/api/directive-workspace/architecture/overview",
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as {
          architecture?: ArchitectureOverview;
          msg?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.msg || "Failed to load Directive Architecture view.",
          );
        }

        if (!cancelled) {
          setData(payload.architecture || null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown Directive Architecture load error.",
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
        Loading Directive Architecture overview...
      </section>
    );
  }

  if (error) {
    return (
      <section className="matte-panel p-6 text-sm text-status-error">
        {error}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="matte-panel p-6 text-sm text-text-secondary">
        No Directive Architecture data available.
      </section>
    );
  }

  if (!data.ok) {
    return (
      <section className="matte-panel p-6 text-sm text-status-warning">
        Directive Architecture source not available at:{" "}
        <span className="font-mono">{data.rootPath}</span>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="matte-panel p-6">
        <h2 className="matte-panel-heading">Directive Architecture</h2>
        <div className="mt-2 text-xs text-text-secondary">
          Standalone Directive Architecture queue for framework improvement.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">intake candidates</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.counts?.intakeCandidates ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">accept for architecture</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.decisionCounts?.accept_for_architecture ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">Forge follow-up</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.decisionCounts?.forge_follow_up ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">in experiment</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {data.decisionCounts?.experiment ?? 0}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">monitor / defer</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {(data.decisionCounts?.monitor ?? 0) + (data.decisionCounts?.defer ?? 0)}
            </div>
          </div>
          <div className="matte-panel p-3">
            <div className="text-xs text-text-muted">reject / reference</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {(data.decisionCounts?.reject ?? 0) + (data.decisionCounts?.knowledge_only ?? 0)}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-text-secondary">
          Focus: {data.workflow?.currentFocus || "n/a"}
        </div>
      </section>

      <section className="matte-panel p-6">
        <h3 className="matte-panel-heading">Directive Architecture queue</h3>
        <div className="mt-3 grid gap-2 text-xs text-text-secondary md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">accept for architecture</div>
            {(data.workflow?.acceptedForArchitecture || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.acceptedForArchitecture.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">Forge follow-up</div>
            {(data.workflow?.forgeFollowUp || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.forgeFollowUp.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">in experiment</div>
            {(data.workflow?.inExperiment || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.inExperiment.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">monitor / defer</div>
            {(data.workflow?.monitorOrDefer || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.monitorOrDefer.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
            <div className="text-text-muted">reject / reference</div>
            {(data.workflow?.rejectOrReference || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.rejectOrReference.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
        </div>
        {(data.workflow?.pending || []).length > 0 ? (
          <div className="mt-3 rounded-lg border border-border bg-bg-panel px-3 py-2 text-xs text-text-secondary">
            <div className="text-text-muted">queued for triage</div>
            {(data.workflow?.pending || []).length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.workflow!.pending.map((item) => (
                  <li key={item} className="truncate" title={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-text-muted">none</div>
            )}
          </div>
        ) : null}
      </section>

      <section className="matte-panel p-6">
        <h3 className="matte-panel-heading">Directive Architecture candidates</h3>
        <div className="mt-3 space-y-2">
          {(data.candidates || []).map((candidate) => (
            <div
              key={candidate.name}
              className="rounded-xl border border-border bg-bg-panel/55 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">{candidate.name}</span>
                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                    decisionBadgeClass(candidate),
                  ].join(" ")}
                >
                  {primaryLabel(candidate)}
                </span>
                {candidate.adoptionTarget ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                    {candidate.adoptionTarget}
                  </span>
                ) : null}
                {candidate.followUpTarget ? (
                  <span className="rounded-full border border-status-info/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-status-info">
                    {candidate.followUpTarget}
                  </span>
                ) : null}
              </div>
              {candidate.evidencePath ? (
                <div
                  className="mt-1 max-w-full truncate font-mono text-[11px] text-text-muted"
                  title={candidate.evidencePath}
                >
                  {candidate.evidencePath}
                </div>
              ) : null}
              {candidate.evidencePath
              && candidate.decisionState === "accept_for_architecture"
              && candidate.evidencePath.endsWith("-engine-handoff.md") ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startArchitectureCandidate(candidate)}
                    disabled={startBusyPath === candidate.evidencePath}
                    className="rounded-lg border border-status-info/40 px-2.5 py-1 text-[11px] font-medium text-status-info transition hover:border-status-info/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {startBusyPath === candidate.evidencePath
                      ? "Opening..."
                      : "Open bounded start"}
                  </button>
                  {startResults[candidate.evidencePath] ? (
                    <span className="text-[11px] text-text-secondary">
                      {startResults[candidate.evidencePath]?.created ? "created" : "opened"}{" "}
                      <span className="font-mono">
                        {startResults[candidate.evidencePath]?.startRelativePath}
                      </span>
                    </span>
                  ) : null}
                  {startErrors[candidate.evidencePath] ? (
                    <span className="text-[11px] text-status-error">
                      {startErrors[candidate.evidencePath]}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
