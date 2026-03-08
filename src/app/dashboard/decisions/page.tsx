import Link from "next/link";
import { ArrowRight, FileText, Scale, ScrollText } from "lucide-react";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { listDocs } from "@/server/repositories/docs-repo";

export const dynamic = "force-dynamic";

function relativeTime(dateValue: string) {
  const deltaSeconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000),
  );

  if (deltaSeconds < 60) return "just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export default async function DecisionsPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const decisionDocs = listDocs(user.id, project.id)
    .filter((doc) =>
      doc.tags.some((tag) => ["decision", "adr"].includes(tag.toLowerCase())),
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );

  return (
    <div className="matte-page mx-auto flex h-full w-full max-w-6xl overflow-y-auto px-6 py-8 lg:px-10">
      <section className="matte-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="matte-header-copy">
            <div className="matte-kicker">
              <Scale className="h-3.5 w-3.5" />
              Decision Log
            </div>
            <h1 className="matte-hero-title">Track durable architecture choices.</h1>
            <p className="matte-subtitle">
              Use tagged docs to preserve decisions, tradeoffs, and consequences for{" "}
              {project.name}. This keeps important technical choices out of transient chat history.
            </p>
          </div>
          <div className="matte-actions">
            <Link href="/dashboard/docs" className="matte-action-secondary">
              <FileText className="h-4 w-4" />
              Open Docs
            </Link>
            <Link
              href={buildPromptPackHref("workspace")}
              className="matte-action-primary"
            >
              <ScrollText className="h-4 w-4" />
              Build Prompt Pack
            </Link>
          </div>
        </div>
      </section>

      {decisionDocs.length === 0 ? (
        <section className="matte-panel p-6">
          <div className="matte-empty">
            No decision docs yet. Create a document in Docs tagged `decision` or `adr`
            to start the log for this project.
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          {decisionDocs.map((doc) => (
            <Link
              key={doc.id}
              href={`/dashboard/docs?doc=${encodeURIComponent(doc.id)}`}
              className="matte-panel group p-5 transition hover:border-text-muted/18 hover:bg-bg-card"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="matte-panel-heading">{doc.title}</h2>
                    <span className="rounded-full border border-border bg-bg-panel px-2 py-0.5 text-[11px] text-text-muted">
                      {relativeTime(doc.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 matte-panel-copy">
                    {trimText(doc.content, 220) || "No details written yet."}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition group-hover:text-white">
                  Open decision
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
