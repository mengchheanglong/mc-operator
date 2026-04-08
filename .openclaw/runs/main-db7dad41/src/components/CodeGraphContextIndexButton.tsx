"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Network } from "lucide-react";

interface IndexPayload {
  success?: boolean;
  message?: string;
  output?: string;
}

interface CodeGraphContextIndexButtonProps {
  className?: string;
  disabled?: boolean;
  label?: string;
}

export default function CodeGraphContextIndexButton({
  className,
  disabled = false,
  label = "Index Active Repo",
}: CodeGraphContextIndexButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [lastRunAt, setLastRunAt] = useState("");

  async function handleClick() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      setOutput("");
      setExpanded(false);

      const response = await fetch("/api/code-graph/index", {
        method: "POST",
      });
      const payload = (await response.json()) as IndexPayload;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.output || payload.message || "Unable to index the active repo.",
        );
      }

      setMessage(payload.message || "Active repo indexed.");
      setOutput(payload.output || "");
      setLastRunAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (indexError) {
      setError(
        indexError instanceof Error
          ? indexError.message
          : "Unable to index the active repo.",
      );
      setLastRunAt(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || loading}
        className={className}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Network className="h-4 w-4" />
        )}
        {loading ? "Indexing Repo..." : label}
      </button>
      {message ? (
        <div className="rounded-lg border border-border bg-bg-panel/60 px-3 py-2 text-xs text-text-secondary">
          <div className="flex items-center gap-2 text-text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{message}</span>
          </div>
          {lastRunAt ? <div className="mt-1 text-text-muted">Last run {lastRunAt}</div> : null}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-status-error/25 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
          {lastRunAt ? <div className="mt-1 text-text-muted">Last run {lastRunAt}</div> : null}
        </div>
      ) : null}
      {output ? (
        <div className="rounded-lg border border-border bg-bg-panel/50">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] uppercase tracking-[0.14em] text-text-muted transition hover:text-text-primary"
          >
            <span>Indexer output</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expanded ? (
            <div className="border-t border-border px-3 py-3 font-mono text-[11px] text-text-primary">
              {output}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
