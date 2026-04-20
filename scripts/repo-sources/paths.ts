import path from "node:path";

export function getRepoSourcesScriptPaths() {
  const missionControlRoot = process.cwd();
  const workspaceRoot = path.resolve(missionControlRoot, "..");
  const directiveWorkspaceRoot = path.join(workspaceRoot, "directive-workspace");
  const directiveForgeSourcePacksRoot = path.join(
    directiveWorkspaceRoot,
    "forge",
    "source-packs",
  );
  const registryPath = path.resolve(
    process.env.MISSION_CONTROL_REPO_SOURCES_PATH || path.join(workspaceRoot, "repo-sources.json"),
  );
  const reportsDir = path.join(missionControlRoot, "reports", "ops");
  return {
    missionControlRoot,
    workspaceRoot,
    directiveWorkspaceRoot,
    directiveForgeSourcePacksRoot,
    registryPath,
    reportsDir,
  };
}
