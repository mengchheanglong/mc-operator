"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  relativePath: string;
  category: "root" | "projects" | "archive";
  isControlPlane: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
}

interface ProjectsPayload {
  activeProject: ProjectOption;
  projects: ProjectOption[];
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ProjectsPayload | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const data = (await response.json()) as ProjectsPayload;
        if (!response.ok) {
          throw new Error("Unable to load projects.");
        }

        if (!cancelled) {
          setPayload(data);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load projects.");
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleProjectChange(nextProjectId: string) {
    if (!payload || nextProjectId === payload.activeProject.id) {
      return;
    }

    const response = await fetch("/api/projects/active", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId: nextProjectId }),
    });

    if (!response.ok) {
      setError("Unable to switch projects.");
      return;
    }

    const updated = (await response.json()) as {
      project: ProjectOption;
    };

    setPayload((current) =>
      current
        ? {
            ...current,
            activeProject: updated.project,
          }
        : current,
    );
    setError("");

    startTransition(() => {
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className="px-2">
        <div
          className="flex h-10 items-center justify-center rounded-xl border border-border bg-bg-panel/55 text-text-secondary"
          title={payload?.activeProject?.name || "Project"}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4" />}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <div className="rounded-2xl border border-border bg-bg-panel/55 px-3 py-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-text-secondary" />
          <div className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Active Project
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-bg-base px-3 py-3">
          <select
            value={payload?.activeProject.id || ""}
            onChange={(event) => {
              void handleProjectChange(event.target.value);
            }}
            disabled={!payload || isPending}
            className="w-full bg-transparent text-sm text-white outline-none disabled:text-text-muted"
          >
            {payload?.projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} - {project.relativePath}
              </option>
            ))}
          </select>
          {isPending ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" />
          ) : null}
        </div>

        <div className="mt-2 text-[11px] text-text-muted">
          {payload?.activeProject.relativePath || "Loading project metadata..."}
        </div>

        {error ? (
          <div className="mt-2 text-[11px] text-[#eadcc8]">{error}</div>
        ) : null}

        {payload?.activeProject ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              {payload.activeProject.category}
            </span>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                payload.activeProject.hasGit
                  ? "border-border bg-bg-panel text-text-secondary"
                  : "border-[#b3956c]/22 bg-[#b3956c]/10 text-[#eadcc8]",
              )}
            >
              {payload.activeProject.hasGit ? "git" : "no git"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
