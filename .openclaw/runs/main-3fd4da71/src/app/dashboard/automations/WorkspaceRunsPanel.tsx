"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, RefreshCw, XCircle } from "lucide-react";

interface WorkspaceRunRow {
  id: string;
  branch: string;
  worktreePath: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  metadata: Record<string, unknown>;
}

interface RunSummary {
  lastDispatch: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    reportId: string | null;
    failureClass: string | null;
  } | null;
  verificationArtifacts: {
    reportId: string | null;
    reportHref: string | null;
    lastCommandStatus: string | null;
    artifactPath: string | null;
  };
}

export default function WorkspaceRunsPanel({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<WorkspaceRunRow[]>([]);
  const [staleRuns, setStaleRuns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, RunSummary>>({});

  async function refresh() {
    setLoading(true);
    try {
      const response = await axios.get("/api/automation/runs", { params: { projectId } });
      setRuns(Array.isArray(response.data?.runs) ? response.data.runs : []);
      setStaleRuns(Array.isArray(response.data?.staleRuns) ? response.data.staleRuns : []);
    } finally {
      setLoading(false);
    }
  }

  async function closeRun(runId: string, reason: "manual" | "stale" | "error-recovery" = "manual") {
    setBusyRunId(runId);
    try {
      await axios.post(`/api/automation/runs/${runId}/close`, { reason, archive: false, projectId });
      await refresh();
    } finally {
      setBusyRunId(null);
    }
  }

  async function loadSummary(runId: string) {
    const response = await axios.get(`/api/automation/runs/${runId}/summary`, { params: { projectId } });
    if (response.data?.summary) {
      setSummaries((current) => ({ ...current, [runId]: response.data.summary as RunSummary }));
    }
  }

  useEffect(() => {
    void refresh();
  }, [projectId]);

  return (
    <section className="matte-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="matte-panel-heading">Workspace Runs</h2>
          <p className="mt-1 text-sm text-text-secondary">Run status, close action, and last dispatch telemetry.</p>
        </div>
        <button type="button" className="matte-action-secondary" onClick={() => void refresh()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {runs.length === 0 ? <div className="matte-empty">No workspace runs yet.</div> : null}
        {runs.map((run) => {
          const summary = summaries[run.id];
          const stale = staleRuns.includes(run.id);
          return (
            <div key={run.id} className="rounded-xl border border-border bg-bg-panel/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-text-secondary">
                  <span className="matte-chip">{run.status}</span> <span className="matte-chip">{run.branch}</span>
                  {stale ? <span className="matte-chip">stale</span> : null}
                  <div className="mt-1 break-all">{run.worktreePath}</div>
                </div>
                <div className="flex gap-2">
                  <button className="matte-action-secondary" onClick={() => void loadSummary(run.id)}>Summary</button>
                  {run.status === "active" ? (
                    <button
                      className="matte-action-secondary"
                      disabled={busyRunId === run.id}
                      onClick={() => void closeRun(run.id, stale ? "stale" : "manual")}
                    >
                      {busyRunId === run.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Close
                    </button>
                  ) : null}
                </div>
              </div>
              {summary ? (
                <div className="mt-2 text-xs text-text-muted">
                  last dispatch: {summary.lastDispatch?.status || "none"}
                  {summary.lastDispatch?.failureClass ? ` (${summary.lastDispatch.failureClass})` : ""}
                  {summary.verificationArtifacts.reportHref ? (
                    <a className="ml-2 underline" href={summary.verificationArtifacts.reportHref}>report</a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
