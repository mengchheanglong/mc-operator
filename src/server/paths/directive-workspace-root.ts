import path from "node:path";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";

type ResolveDirectiveWorkspaceRootOptions = {
  directiveRoot?: string | null;
};

type ResolveDirectiveQueuePathOptions = ResolveDirectiveWorkspaceRootOptions & {
  queuePath?: string | null;
};

function normalizeOptionalPath(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed ? path.resolve(trimmed) : "";
}

export function resolveDirectiveWorkspaceRoot(
  options: ResolveDirectiveWorkspaceRootOptions = {},
) {
  const explicitRoot = normalizeOptionalPath(options.directiveRoot);
  if (explicitRoot) {
    return explicitRoot;
  }

  const configuredRoot =
    normalizeOptionalPath(process.env.DIRECTIVE_WORKSPACE_ROOT)
    || normalizeOptionalPath(process.env.DIRECTIVE_WORKSPACE_ROOT_OVERRIDE);
  if (configuredRoot) {
    return configuredRoot;
  }

  return path.join(getWorkspaceRootPath(), "directive-workspace");
}

export function resolveDirectiveQueuePath(
  options: ResolveDirectiveQueuePathOptions = {},
) {
  const explicitQueuePath =
    normalizeOptionalPath(options.queuePath)
    || normalizeOptionalPath(process.env.DIRECTIVE_QUEUE_PATH)
    || normalizeOptionalPath(process.env.DIRECTIVE_QUEUE_PATH_OVERRIDE);
  if (explicitQueuePath) {
    return explicitQueuePath;
  }

  return path.join(
    resolveDirectiveWorkspaceRoot({ directiveRoot: options.directiveRoot }),
    "discovery",
    "intake-queue.json",
  );
}
