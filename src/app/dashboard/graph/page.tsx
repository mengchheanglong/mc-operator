import GraphPageClient from "./GraphPageClient";
import { extractLinks } from "@/lib/parser/extractLinks";
import { resolveProjectContext } from "@/server/context/project-context";
import { listWorkspaceGraphProjects } from "@/server/projects/workspace-projects";
import { resolveUserContext } from "@/server/context/user-context";
import { listDocs } from "@/server/repositories/docs-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { listReports } from "@/server/repositories/reports-repo";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";
import {
  deriveTopicGraphModel,
  type TopicGraphDocumentRecord,
  type TopicGraphQuestRecord,
  type TopicGraphReportRecord,
  type TopicGraphWorkflowRecord,
} from "@/lib/graph/deriveTopicGraph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();

  const [docs, quests, reports, automation] = await Promise.all([
    Promise.resolve(listDocs(user.id, project.id)),
    Promise.resolve(listQuests(user.id, project.id, { limit: 100 })),
    Promise.resolve(listReports(user.id, project.id, { limit: 60 })),
    buildN8nAutomationSnapshot(project),
  ]);
  const workspaceProjects = project.isControlPlane
    ? listWorkspaceGraphProjects()
        .filter((item) => !item.isControlPlane)
        .map((item) => ({
          id: item.id,
          name: item.name,
          relativePath: item.relativePath,
          category: item.category,
          hasGit: item.hasGit,
          hasPackageJson: item.hasPackageJson,
          isControlPlane: item.isControlPlane,
        }))
    : [];

  const normalizedDocs: TopicGraphDocumentRecord[] = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    links: extractLinks(doc.content),
    tags: doc.tags,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  }));

  const normalizedQuests: TopicGraphQuestRecord[] = quests.map((quest) => ({
    id: quest.id,
    goal: quest.goal,
    topics: quest.topics,
    completed: quest.completed,
    date: quest.date,
  }));

  const normalizedReports: TopicGraphReportRecord[] = reports.map((report) => ({
    id: report.id,
    title: report.title,
    content: report.content,
    topics: report.topics,
    category: report.category,
    status: report.status,
    source: report.source,
    date: report.date,
  }));

  const normalizedWorkflows: TopicGraphWorkflowRecord[] = automation.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    tags: workflow.tags,
    active: workflow.active,
  }));

  const model = deriveTopicGraphModel({
    projectTitle: project.name || "Project",
    docs: normalizedDocs,
    quests: normalizedQuests,
    reports: normalizedReports,
    workflows: normalizedWorkflows,
    workspaceProjects,
  });

  return (
    <GraphPageClient
      initialModel={model}
      initialN8nBaseUrl={automation.baseUrl ?? null}
    />
  );
}
