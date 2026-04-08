import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { serverError } from "@/server/http/api-response";
import { createDoc, listDocs } from "@/server/repositories/docs-repo";
import { createQuest, listQuests } from "@/server/repositories/quests-repo";
import {
  buildBootstrapTemplates,
  buildCodeIntelOverrideTemplate,
  buildRepoSnapshot,
  getCodeIntelOverridePath,
  type BootstrapTemplate,
} from "@/server/services/workspace-intel-service";
import {
  writeDashboardContextFiles,
  writeDocContextFile,
} from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

function docMatchesTemplate(
  doc: { title: string; tags: string[] },
  template: BootstrapTemplate,
) {
  const haystack = `${doc.title} ${doc.tags.join(" ")}`.toLowerCase();
  return template.matchKeywords.some((keyword) => haystack.includes(keyword));
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const repoSnapshot = buildRepoSnapshot(project);
    const templates = buildBootstrapTemplates(repoSnapshot);
    const existingDocs = listDocs(user.id, project.id);
    const codeIntelOverridePath = getCodeIntelOverridePath(project);
    const hasCodeIntelOverride = fs.existsSync(codeIntelOverridePath);

    const createdDocs: Array<{ id: string; title: string }> = [];

    for (const template of templates) {
      const alreadyCovered = existingDocs.some((doc) =>
        docMatchesTemplate(doc, template),
      );

      if (alreadyCovered) {
        continue;
      }

      const createdDoc = createDoc(user.id, project.id, {
        title: template.title,
        content: template.content,
        tags: template.tags,
        fileType: ".md",
      });

      createdDocs.push({ id: createdDoc.id, title: createdDoc.title });
      existingDocs.push(createdDoc);
    }

    let createdQuest:
      | {
          id: string;
          goal: string;
        }
      | undefined;

    const openQuests = listQuests(user.id, project.id).filter((quest) => !quest.completed);
    if (openQuests.length === 0 && createdDocs.length > 0) {
      const quest = createQuest(
        user.id,
        project.id,
        "Customize the collaboration starter docs for this project",
        "easy",
      );
      createdQuest = { id: quest.id, goal: quest.goal };
    }

    if (createdDocs.length === 0 && !createdQuest) {
      if (!hasCodeIntelOverride) {
        fs.mkdirSync(path.dirname(codeIntelOverridePath), { recursive: true });
        fs.writeFileSync(
          codeIntelOverridePath,
          buildCodeIntelOverrideTemplate(repoSnapshot),
          "utf8",
        );
      }

      return NextResponse.json({
        msg: "The workspace already has the core collaboration scaffold.",
        createdDocs: [],
        createdQuest: null,
        firstDocId: null,
      });
    }

    await writeDashboardContextFiles(user.id, project);

    if (createdDocs[0]) {
      await writeDocContextFile(user.id, project, createdDocs[0].id);
    }

    if (!hasCodeIntelOverride) {
      fs.mkdirSync(path.dirname(codeIntelOverridePath), { recursive: true });
      fs.writeFileSync(
        codeIntelOverridePath,
        buildCodeIntelOverrideTemplate(repoSnapshot),
        "utf8",
      );
    }

    return NextResponse.json({
      msg: "Workspace bootstrap complete.",
      createdDocs,
      createdQuest,
      firstDocId: createdDocs[0]?.id || null,
    });
  } catch (error) {
    return serverError(error, "Workspace bootstrap error");
  }
}
