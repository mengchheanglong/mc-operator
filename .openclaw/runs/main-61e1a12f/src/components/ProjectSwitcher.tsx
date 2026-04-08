"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import type { ProjectsPayload } from "@/types/projects";

export default function ProjectSwitcher({
  collapsed,
  initialPayload,
}: {
  collapsed: boolean;
  initialPayload: ProjectsPayload;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ProjectsPayload>(initialPayload);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = (await response.json()) as ProjectsPayload;
      if (!response.ok) {
        throw new Error("Unable to load projects.");
      }
      setPayload(data);
      setError("");
    } catch {
      setError("Unable to load projects.");
    }
  }, []);

  useEffect(() => {
    setPayload(initialPayload);
  }, [initialPayload]);

  useEffect(() => {
    const handleFocus = () => {
      void loadProjects();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadProjects]);

  function handleProjectChange(nextProjectId: string) {
    if (!payload || nextProjectId === payload.activeProject.id) {
      return;
    }

    startTransition(() => {
      setPayload((current) => ({
        ...current,
        activeProject:
          current.projects.find((project) => project.id === nextProjectId) ||
          current.activeProject,
      }));

      const query = searchParams.toString();
      const nextPath = query ? `${pathname}?${query}` : pathname;
      window.location.assign(
        `/api/projects/activate?projectId=${encodeURIComponent(nextProjectId)}&next=${encodeURIComponent(nextPath)}`,
      );
    });
  }

  if (collapsed) {
    return (
      <div className="px-2 py-3">
        <div
          className="flex h-10 items-center justify-center rounded-2xl border border-border bg-bg-panel/55 text-text-secondary"
          title={payload.activeProject?.name || "Project"}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderKanban className="h-4 w-4" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-2">
      <div className="rounded-[1.2rem] border border-border/85 bg-bg-panel/40 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 text-text-secondary" />
          <div className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Active Project
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2 rounded-[1rem] border border-border bg-bg-base/92 px-3 py-2">
          <select
            value={payload.activeProject.id || ""}
            onChange={(event) => {
              handleProjectChange(event.target.value);
            }}
            disabled={isPending}
            className="project-switcher-select w-full truncate bg-transparent pr-2 text-[0.88rem] font-medium tracking-[-0.025em] text-white outline-none disabled:text-text-muted"
          >
            {payload.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {isPending ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" />
          ) : null}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-3 text-[10px] text-text-muted">
          <div
            className="min-w-0 truncate uppercase tracking-[0.16em]"
            title={payload.activeProject.relativePath}
          >
            {payload.activeProject.relativePath}
          </div>
          <div className="shrink-0 uppercase tracking-[0.16em]">
            {payload.activeProject.isControlPlane
              ? "control"
              : `${payload.activeProject.category}${payload.activeProject.hasGit ? " · git" : ""}`}
          </div>
        </div>

        {error ? <div className="mt-2 text-[11px] text-[#eadcc8]">{error}</div> : null}
      </div>
    </div>
  );
}
