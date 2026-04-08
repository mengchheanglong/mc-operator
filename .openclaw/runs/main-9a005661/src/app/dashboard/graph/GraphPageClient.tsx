"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Network } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import GraphView, { type GraphNodeLink } from "@/components/graph/GraphView";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { extractLinks } from "@/lib/parser/extractLinks";
import {
  deriveTopicGraphModel,
  type TopicGraphDocumentRecord,
  type TopicGraphQuestRecord,
  type TopicGraphReportRecord,
  type TopicGraphWorkflowRecord,
  type TopicGraphWorkspaceProjectRecord,
} from "@/lib/graph/deriveTopicGraph";
import type { KnowledgeGraphEntity, KnowledgeGraphModel } from "@/types/document";

interface RawDoc {
  id?: string;
  _id?: string;
  title?: string;
  content?: string;
  links?: unknown[];
  tags?: unknown[];
  updatedAt?: string;
  createdAt?: string;
}

interface RawQuest {
  id?: string;
  _id?: string;
  goal?: string;
  topics?: unknown[];
  completed?: boolean;
  date?: string;
}

interface RawReport {
  id?: string;
  _id?: string;
  title?: string;
  content?: string;
  topics?: unknown[];
  category?: string;
  status?: string;
  source?: string;
  date?: string;
  metadata?: {
    topics?: unknown[];
  };
}

interface ActiveProjectResponse {
  activeProject?: {
    id?: string;
    name?: string;
    isControlPlane?: boolean;
  };
  projects?: Array<{
    id?: string;
    name?: string;
    relativePath?: string;
    category?: "root" | "studyspace" | "projects" | "archive" | "tools";
    isControlPlane?: boolean;
    hasGit?: boolean;
    hasPackageJson?: boolean;
  }>;
}

interface N8nStatusResponse {
  automation?: {
    baseUrl?: string | null;
    workflows?: Array<{
      id?: string;
      name?: string;
      active?: boolean;
      tags?: string[];
    }>;
  };
}

interface GraphPageClientProps {
  initialModel: KnowledgeGraphModel;
  initialN8nBaseUrl: string | null;
}

function GraphPageContent({ initialModel, initialN8nBaseUrl }: GraphPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [model, setModel] = useState<KnowledgeGraphModel>(initialModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [n8nBaseUrl, setN8nBaseUrl] = useState<string | null>(initialN8nBaseUrl);
  const focusedDocumentId = searchParams.get("focus");

  const fetchGraphData = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const [docsResponse, questsResponse, reportsResponse, projectResponse, n8nResponse] =
        await Promise.all([
          axios.get("/api/docs"),
          axios.get("/api/quests?limit=100"),
          axios.get("/api/reports?limit=60"),
          axios.get("/api/projects/graph"),
          axios.get("/api/automation/n8n/status").catch(() => ({ data: {} })),
        ]);

      const docs = Array.isArray(docsResponse.data?.docs) ? docsResponse.data.docs : [];
      const quests = Array.isArray(questsResponse.data) ? questsResponse.data : [];
      const reports = Array.isArray(reportsResponse.data) ? reportsResponse.data : [];
      const activeProjectName =
        String((projectResponse.data as ActiveProjectResponse)?.activeProject?.name || "").trim() ||
        "Project";
      const activeProjectIsControlPlane = Boolean(
        (projectResponse.data as ActiveProjectResponse)?.activeProject?.isControlPlane,
      );
      const workspaceProjects: TopicGraphWorkspaceProjectRecord[] = activeProjectIsControlPlane
        ? (((projectResponse.data as ActiveProjectResponse)?.projects || [])
            .filter((project) => !project.isControlPlane)
            .filter((project) => project.category !== "archive")
            .map((project) => ({
              id: String(project.id || ""),
              name: String(project.name || ""),
              relativePath: String(project.relativePath || ""),
              category: (project.category || "projects") as TopicGraphWorkspaceProjectRecord["category"],
              hasGit: Boolean(project.hasGit),
              hasPackageJson: Boolean(project.hasPackageJson),
              isControlPlane: Boolean(project.isControlPlane),
            })))
        : [];
      const workflows = Array.isArray((n8nResponse.data as N8nStatusResponse)?.automation?.workflows)
        ? (n8nResponse.data as N8nStatusResponse).automation?.workflows || []
        : [];
      setN8nBaseUrl(
        String((n8nResponse.data as N8nStatusResponse)?.automation?.baseUrl || "").trim() || null,
      );

      const normalizedDocs: TopicGraphDocumentRecord[] = docs.map((doc: RawDoc) => ({
        id: String(doc.id || doc._id || ""),
        title: String(doc.title || ""),
        content: String(doc.content || ""),
        links: Array.isArray(doc.links)
          ? doc.links.map((link) => String(link))
          : extractLinks(String(doc.content || "")),
        tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag)) : [],
        updatedAt: String(doc.updatedAt || ""),
        createdAt: String(doc.createdAt || ""),
      }));

      const normalizedQuests: TopicGraphQuestRecord[] = quests.map((quest: RawQuest) => ({
        id: String(quest.id || quest._id || ""),
        goal: String(quest.goal || ""),
        topics: Array.isArray(quest.topics)
          ? quest.topics.map((topic) => String(topic))
          : [],
        completed: Boolean(quest.completed),
        date: String(quest.date || ""),
      }));

      const normalizedReports: TopicGraphReportRecord[] = reports.map((report: RawReport) => ({
        id: String(report.id || report._id || ""),
        title: String(report.title || ""),
        content: String(report.content || ""),
        topics: Array.isArray(report.topics)
          ? report.topics.map((topic) => String(topic))
          : Array.isArray(report.metadata?.topics)
            ? report.metadata?.topics.map((topic) => String(topic)) || []
            : [],
        category: String(report.category || ""),
        status: String(report.status || ""),
        source: String(report.source || ""),
        date: String(report.date || ""),
      }));

      const normalizedWorkflows: TopicGraphWorkflowRecord[] = workflows.map((workflow) => ({
        id: String(workflow.id || workflow.name || ""),
        name: String(workflow.name || ""),
        tags: Array.isArray(workflow.tags)
          ? workflow.tags.map((tag) => String(tag))
          : [],
        active: Boolean(workflow.active),
      }));

      setModel(
        deriveTopicGraphModel({
          projectTitle: activeProjectName,
          docs: normalizedDocs,
          quests: normalizedQuests,
          reports: normalizedReports,
          workflows: normalizedWorkflows,
          workspaceProjects,
        }),
      );
      setError("");
    } catch {
      setError("Unable to load project map.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      void fetchGraphData(false);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchGraphData(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchGraphData]);

  return (
    <div className="relative flex h-screen min-h-screen w-full overflow-hidden bg-bg-base">
      {error && (
        <div className="absolute left-6 top-6 z-20 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error shadow-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-full flex-1 items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-5 py-3 text-sm text-text-secondary shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            Building project map...
          </div>
        </div>
      ) : model.entities.length === 0 ? (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 text-text-secondary">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-card">
            <Network className="h-7 w-7 text-accent-primary/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">No graph data yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Add docs, quests, or reports to seed topics and documents.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1">
          <GraphView
            model={model}
            resolveNodeLinks={(entity: KnowledgeGraphEntity): GraphNodeLink[] => {
            if (entity.kind === "document") {
              return [
                {
                  id: "open-doc",
                  label: "Open doc",
                  href: `/dashboard/docs?doc=${encodeURIComponent(entity.id)}`,
                },
                {
                  id: "build-doc-pack",
                  label: "Build doc pack",
                  href: buildPromptPackHref("graph_focus", entity.id),
                },
              ];
            }

            if (entity.kind === "topic") {
              const tag = entity.metadata?.topicTag;
              const search = entity.metadata?.searchQuery;
              const encoded = encodeURIComponent(tag || search || entity.title);
              const links: GraphNodeLink[] = [
                {
                  id: "open-topic-docs",
                  label: "Docs",
                  href: tag
                    ? `/dashboard/docs?tag=${encodeURIComponent(tag)}`
                    : `/dashboard/docs?search=${encoded}`,
                },
                {
                  id: "open-topic-quests",
                  label: "Quests",
                  href: `/dashboard/quests?topic=${encoded}`,
                },
                {
                  id: "open-topic-reports",
                  label: "Reports",
                  href: `/dashboard/report?topic=${encoded}`,
                },
              ];

              if ((entity.metadata?.workflowCount || 0) > 0 && n8nBaseUrl) {
                links.push({
                  id: "open-n8n-workflows",
                  label: "n8n",
                  href: `${n8nBaseUrl}/home/workflows`,
                  external: true,
                });
              }

              return links;
            }

            if (entity.kind === "workspace-project") {
              const projectId = entity.metadata?.projectId;
              const links: GraphNodeLink[] = [];

              if (projectId) {
                const encodedProjectId = encodeURIComponent(projectId);
                links.push(
                  {
                    id: "switch-project",
                    label: "Open project",
                    href: `/api/projects/activate?projectId=${encodedProjectId}&next=${encodeURIComponent("/dashboard")}`,
                  },
                  {
                    id: "switch-project-pack",
                    label: "Automations",
                    href: `/api/projects/activate?projectId=${encodedProjectId}&next=${encodeURIComponent(buildPromptPackHref("workspace"))}`,
                  },
                );
              }

              return links;
            }

            const links: GraphNodeLink[] = [
              {
                id: "open-dashboard",
                label: "Dashboard",
                href: "/dashboard",
              },
              {
                id: "open-docs",
                label: "Docs",
                href: "/dashboard/docs",
              },
              {
                id: "open-quests",
                label: "Quests",
                href: "/dashboard/quests",
              },
              {
                id: "open-reports",
                label: "Reports",
                href: "/dashboard/report",
              },
            ];

            if (n8nBaseUrl) {
              links.push({
                id: "open-n8n-home",
                label: "n8n",
                href: `${n8nBaseUrl}/home/workflows`,
                external: true,
              });
            }

            return links;
            }}
            onBuildPromptPack={(documentId) =>
              router.push(
                documentId
                  ? buildPromptPackHref("graph_focus", documentId)
                  : buildPromptPackHref("workspace"),
              )
            }
            focusedDocumentId={focusedDocumentId}
          />
        </div>
      )}
    </div>
  );
}

export default function GraphPageClient(props: GraphPageClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-5 py-3 text-sm text-text-secondary shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            Building project map...
          </div>
        </div>
      }
    >
      <GraphPageContent {...props} />
    </Suspense>
  );
}
