"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface BootstrapPayload {
  msg?: string;
  firstDocId?: string | null;
}

interface BootstrapWorkspaceButtonProps {
  className?: string;
  label?: string;
}

export default function BootstrapWorkspaceButton({
  className,
  label = "Bootstrap Collaboration Docs",
}: BootstrapWorkspaceButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/workspace/bootstrap", {
        method: "POST",
      });
      const payload = (await response.json()) as BootstrapPayload;

      if (!response.ok) {
        throw new Error(payload.msg || "Unable to bootstrap the workspace.");
      }

      const targetHref = payload.firstDocId
        ? `/dashboard/docs?doc=${encodeURIComponent(payload.firstDocId)}`
        : "/dashboard/docs";

      window.location.assign(targetHref);
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Unable to bootstrap the workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className={className}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {loading ? "Bootstrapping" : label}
      </button>
      {error ? <div className="text-xs text-status-error">{error}</div> : null}
    </div>
  );
}
