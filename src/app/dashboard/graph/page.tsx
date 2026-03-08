"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Network } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import GraphView from "@/components/graph/GraphView";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import type { KnowledgeDocument } from "@/types/document";

function GraphPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const focusedDocumentId = searchParams.get("focus");

  const fetchDocuments = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await axios.get("/api/docs");
      const docs = Array.isArray(response.data?.docs)
        ? response.data.docs
        : [];

      setDocuments(
        docs.map((doc: Partial<KnowledgeDocument>) => ({
          id: String(doc.id || ""),
          title: String(doc.title || ""),
          content: String(doc.content || ""),
          links: Array.isArray(doc.links)
            ? doc.links.map((link) => String(link))
            : [],
        })),
      );
      setError("");
    } catch {
      setError("Unable to load knowledge graph.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchDocuments(true);

    const intervalId = window.setInterval(() => {
      void fetchDocuments(false);
    }, 15000);

    const handleFocus = () => {
      void fetchDocuments(false);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchDocuments(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchDocuments]);

  return (
    <div className="sidebar-shell-transition fixed top-0 right-0 bottom-0 flex w-[calc(100%-var(--sidebar-width))] overflow-hidden bg-bg-base">
      {error && (
        <div className="absolute left-6 top-6 z-20 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error shadow-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-5 py-3 text-sm text-text-secondary shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            Building graph...
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-text-secondary">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-card">
            <Network className="h-7 w-7 text-accent-primary/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">No documents yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Create a document in Docs to populate the knowledge graph.
            </p>
          </div>
        </div>
      ) : (
        <GraphView
          documents={documents}
          onOpenDocument={(documentId) =>
            router.push(`/dashboard/docs?doc=${encodeURIComponent(documentId)}`)
          }
          onBuildPromptPack={(documentId) =>
            router.push(
              documentId
                ? buildPromptPackHref("graph_focus", documentId)
                : buildPromptPackHref("workspace"),
            )
          }
          focusedDocumentId={focusedDocumentId}
        />
      )}
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-5 py-3 text-sm text-text-secondary shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            Building graph...
          </div>
        </div>
      }
    >
      <GraphPageContent />
    </Suspense>
  );
}
