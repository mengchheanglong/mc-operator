import path from "path";
import { readdir, readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { findAgentById } from "@/server/repositories/agents-repo";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function safeWithinWorkspace(targetPath: string) {
  const workspaceRoot = path.resolve(getWorkspaceRootPath());
  const normalized = path.resolve(targetPath);
  const relative = path.relative(workspaceRoot, normalized);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Agent ID is required.");
    }

    const agent = findAgentById(user.id, project.id, id);
    if (!agent) {
      return notFound("Agent not found.");
    }

    const previews = await Promise.all(
      agent.packAssets.slice(0, 8).map(async (asset) => {
        if (!safeWithinWorkspace(asset.path)) {
          return { ...asset, preview: "Path is outside workspace and cannot be previewed." };
        }

        try {
          if (asset.kind === "directory") {
            const entries = await readdir(asset.path);
            return {
              ...asset,
              preview: entries.slice(0, 20).join("\n") || "(empty directory)",
            };
          }

          const content = await readFile(asset.path, "utf8");
          return {
            ...asset,
            preview: content.slice(0, 4000),
          };
        } catch (error) {
          return {
            ...asset,
            preview: `Unable to load preview: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }),
    );

    return NextResponse.json({ assets: previews });
  } catch (error) {
    return serverError(error, "Agent pack assets error", "Failed to preview agent pack assets.");
  }
}
