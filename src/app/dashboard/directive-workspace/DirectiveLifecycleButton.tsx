"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle, ShieldCheck } from "lucide-react";
import {
  parseDirectiveIntegrationProof,
  type DirectiveIntegrationProof,
} from "@/lib/directive-workspace/v0";

interface DirectiveLifecycleButtonProps {
  capabilityId: string;
  initialProof?: unknown;
}

interface LifecycleResponse {
  lifecycle?: {
    created?: {
      decisionId?: string | null;
    };
    verification?: {
      skippedBecauseDecisionExists?: boolean;
    };
  };
  msg?: string;
}

interface ProofResponse {
  integrationProof?: unknown;
  msg?: string;
}

function lifecycleStatusText(payload: LifecycleResponse) {
  if (payload.lifecycle?.verification?.skippedBecauseDecisionExists) {
    return "Already decided";
  }
  if (payload.lifecycle?.created?.decisionId) {
    return "Lifecycle recorded";
  }
  return "Lifecycle checked";
}

const SUCCESS_MESSAGES = new Set([
  "Proof recorded",
  "Lifecycle recorded",
  "Already decided",
  "Lifecycle checked",
]);

function messageClass(msg: string): string {
  if (SUCCESS_MESSAGES.has(msg)) return "text-status-success";
  if (msg === "Run proof first.") return "text-text-muted";
  return "text-status-error";
}

export function DirectiveLifecycleButton({
  capabilityId,
  initialProof,
}: DirectiveLifecycleButtonProps) {
  const router = useRouter();
  const [proof, setProof] = useState<DirectiveIntegrationProof | null>(
    parseDirectiveIntegrationProof(initialProof),
  );
  const [proofRunning, setProofRunning] = useState(false);
  const [lifecycleRunning, setLifecycleRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runProof() {
    setProofRunning(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "dashboard-proof",
            reference: `dashboard/directive-workspace/${capabilityId}/proof`,
            summary: "Dashboard-triggered integration proof run.",
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as ProofResponse;
      if (!response.ok) {
        throw new Error(payload.msg || "Failed to create proof.");
      }

      const nextProof = parseDirectiveIntegrationProof(payload.integrationProof);
      if (!nextProof) {
        throw new Error("Proof payload missing required fields.");
      }
      setProof(nextProof);
      setMessage("Proof recorded");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proof run failed.");
    } finally {
      setProofRunning(false);
    }
  }

  async function runLifecycle() {
    if (!proof) {
      setMessage("Run proof first.");
      return;
    }

    setLifecycleRunning(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/lifecycle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "dashboard.directive-workspace",
            integrationProof: proof,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as LifecycleResponse;
      if (!response.ok) {
        throw new Error(payload.msg || "Failed to run lifecycle.");
      }

      setMessage(lifecycleStatusText(payload));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lifecycle run failed.");
    } finally {
      setLifecycleRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="matte-action-secondary text-xs disabled:opacity-50"
        disabled={proofRunning || lifecycleRunning}
        onClick={() => void runProof()}
      >
        {proofRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        Run proof
      </button>
      <button
        type="button"
        className={[
          proof ? "matte-action-primary" : "matte-action-secondary",
          "text-xs disabled:opacity-50",
        ].join(" ")}
        disabled={proofRunning || lifecycleRunning}
        onClick={() => void runLifecycle()}
      >
        {lifecycleRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        Run lifecycle
      </button>
      {proof ? <span className="text-[11px] text-status-success">proof ready</span> : null}
      {message ? (
        <span className={["text-[11px]", messageClass(message)].join(" ")}>{message}</span>
      ) : null}
    </div>
  );
}

export default DirectiveLifecycleButton;
