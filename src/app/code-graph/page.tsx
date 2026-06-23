'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Network, RefreshCw } from 'lucide-react';
import GraphView, { type GraphNodeLink } from '@/components/graph/GraphView';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, Surface } from '@/components/ui/primitives';
import { automation } from '@/features/automation/api';
import { codeGraph } from '@/features/code-graph/api';
import { docs } from '@/features/docs/api';
import { projects } from '@/features/projects/api';
import { quests } from '@/features/quests/api';
import { reports } from '@/features/reports/api';
import { deriveTopicGraphModel } from '@/lib/graph/deriveTopicGraph';
import { extractLinks } from '@/lib/parser/extractLinks';
import type {
  TopicGraphDocumentRecord,
  TopicGraphQuestRecord,
  TopicGraphReportRecord,
  TopicGraphWorkflowRecord,
  TopicGraphWorkspaceProjectRecord,
} from '@/lib/graph/deriveTopicGraph';
import type { KnowledgeGraphEntity } from '@/types/document';

interface ProjectGraphPayload {
  activeProject?: {
    id?: string;
    name?: string;
    isControlPlane?: boolean;
    projectType?: 'personal' | 'github' | 'external';
  };
  projects?: Array<{
    id?: string;
    name?: string;
    relativePath?: string;
    category?: 'root' | 'studyspace' | 'projects' | 'archive' | 'tools';
    isControlPlane?: boolean;
    hasGit?: boolean;
    hasPackageJson?: boolean;
    projectType?: 'personal' | 'github' | 'external';
  }>;
}

interface N8nStatusPayload {
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

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildNodeLinks(entity: KnowledgeGraphEntity, n8nBaseUrl: string | null): GraphNodeLink[] {
  if (entity.kind === 'document') {
    return [
      {
        id: 'open-docs',
        label: 'Docs',
        href: `/docs?search=${encodeURIComponent(entity.title)}`,
      },
    ];
  }

  if (entity.kind === 'topic') {
    const tag = entity.metadata?.topicTag;
    const search = entity.metadata?.searchQuery;
    const encoded = encodeURIComponent(tag || search || entity.title);
    const links: GraphNodeLink[] = [
      { id: 'topic-docs', label: 'Docs', href: `/docs?search=${encoded}` },
      { id: 'topic-quests', label: 'Quests', href: `/quests?topic=${encoded}` },
      { id: 'topic-reports', label: 'Reports', href: `/reports?topic=${encoded}` },
    ];

    if ((entity.metadata?.workflowCount || 0) > 0 && n8nBaseUrl) {
      links.push({
        id: 'topic-n8n',
        label: 'n8n',
        href: `${n8nBaseUrl}/home/workflows`,
        external: true,
      });
    }

    return links;
  }

  if (entity.kind === 'workspace-project') {
    return [{ id: 'open-projects', label: 'Projects', href: '/projects' }];
  }

  const links: GraphNodeLink[] = [
    { id: 'project-docs', label: 'Docs', href: '/docs' },
    { id: 'project-quests', label: 'Quests', href: '/quests' },
    { id: 'project-reports', label: 'Reports', href: '/reports' },
  ];

  if (n8nBaseUrl) {
    links.push({
      id: 'project-n8n',
      label: 'n8n',
      href: `${n8nBaseUrl}/home/workflows`,
      external: true,
    });
  }

  return links;
}

export default function CodeGraphPage() {
  const [indexing, setIndexing] = useState(false);

  const graphQuery = useQuery({
    queryKey: ['code-graph', 'project-map'],
    queryFn: async () => {
      const [docsPayload, questsPayload, reportsPayload, projectsPayload, n8nPayload] =
        await Promise.all([
          docs.list({ limit: '100' }),
          quests.list({ limit: '100' }),
          reports.list({ limit: '100' }),
          projects.graph() as Promise<ProjectGraphPayload>,
          automation.n8nStatus().catch(() => ({}) as N8nStatusPayload),
        ]);

      return {
        docs: docsPayload.docs ?? [],
        quests: questsPayload.quests ?? [],
        reports: asArray<any>((reportsPayload as any)?.reports),
        projects: projectsPayload,
        n8n: n8nPayload as N8nStatusPayload,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const handleIndex = async () => {
    setIndexing(true);
    try {
      await codeGraph.index();
      await graphQuery.refetch();
    } finally {
      setIndexing(false);
    }
  };

  const model = useMemo(() => {
    const payload = graphQuery.data;
    if (!payload) {
      return null;
    }

    const projectName = payload.projects.activeProject?.name || 'Mission Control';
    const activeProjectIsControlPlane = Boolean(payload.projects.activeProject?.isControlPlane);
    const workspaceProjects: TopicGraphWorkspaceProjectRecord[] = activeProjectIsControlPlane
      ? (payload.projects.projects || [])
          .filter((project) => !project.isControlPlane)
          .filter((project) => project.category !== 'archive')
          .map((project) => ({
            id: String(project.id || ''),
            name: String(project.name || project.id || ''),
            relativePath: String(project.relativePath || project.id || ''),
            category: project.category || 'projects',
            hasGit: Boolean(project.hasGit),
            hasPackageJson: Boolean(project.hasPackageJson),
            isControlPlane: Boolean(project.isControlPlane),
          }))
          .filter((project) => project.id && project.name)
      : [];

    const graphDocs: TopicGraphDocumentRecord[] = payload.docs.map((doc) => ({
      id: String(doc.id || ''),
      title: String(doc.title || ''),
      content: String(doc.content || ''),
      links: extractLinks(String(doc.content || '')),
      tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag)) : [],
      updatedAt: String(doc.updatedAt || ''),
      createdAt: String(doc.createdAt || ''),
    }));

    const graphQuests: TopicGraphQuestRecord[] = payload.quests.map((quest) => ({
      id: String(quest.id || quest._id || ''),
      goal: String(quest.goal || ''),
      topics: Array.isArray(quest.topics) ? quest.topics.map((topic) => String(topic)) : [],
      completed: Boolean(quest.completed),
      date: String(quest.date || ''),
    }));

    const graphReports: TopicGraphReportRecord[] = payload.reports.map((report) => ({
      id: String(report.id || report._id || ''),
      title: String(report.title || ''),
      content: String(report.content || ''),
      topics: Array.isArray(report.topics)
        ? report.topics.map((topic: unknown) => String(topic))
        : Array.isArray(report.metadata?.topics)
          ? report.metadata.topics.map((topic: unknown) => String(topic))
          : [],
      category: String(report.category || ''),
      status: String(report.status || ''),
      source: String(report.source || ''),
      date: String(report.date || ''),
    }));

    const workflows = payload.n8n.automation?.workflows || [];
    const graphWorkflows: TopicGraphWorkflowRecord[] = workflows.map((workflow) => ({
      id: String(workflow.id || workflow.name || ''),
      name: String(workflow.name || ''),
      tags: Array.isArray(workflow.tags) ? workflow.tags.map((tag) => String(tag)) : [],
      active: Boolean(workflow.active),
    }));

    return deriveTopicGraphModel({
      projectTitle: projectName,
      docs: graphDocs,
      quests: graphQuests,
      reports: graphReports,
      workflows: graphWorkflows,
      workspaceProjects,
    });
  }, [graphQuery.data]);

  const n8nBaseUrl =
    String(graphQuery.data?.n8n.automation?.baseUrl || '').trim() || null;

  if (graphQuery.isLoading) {
    return <LoadingState label="Building project graph..." />;
  }

  if (graphQuery.error) {
    return <ErrorState title="Failed to load project graph" message={graphQuery.error.message} />;
  }

  return (
    <div className="space-y-5">
      <Surface>
        <div className="px-5 py-5">
          <PageHeader
            eyebrow="Graph"
            title="Code Graph"
            description="A visual project map built from docs, quests, reports, workspace projects, and automation workflow tags."
            actions={
              <>
                <Button
                  icon={RefreshCw}
                  tone="secondary"
                  onClick={() => graphQuery.refetch()}
                  disabled={graphQuery.isFetching}
                >
                  Refresh
                </Button>
                <Button icon={Database} onClick={handleIndex} disabled={indexing}>
                  {indexing ? 'Indexing...' : 'Trigger Index'}
                </Button>
              </>
            }
          />
        </div>

        <div className="h-[calc(100vh-17rem)] min-h-[520px] border-t border-white/8 bg-[#07080b]">
          {model && model.entities.length > 0 ? (
            <GraphView
              model={model}
              resolveNodeLinks={(entity) => buildNodeLinks(entity, n8nBaseUrl)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={Network}
                title="No graph data yet"
                description="Add docs, quests, or reports to seed the project map."
              />
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
