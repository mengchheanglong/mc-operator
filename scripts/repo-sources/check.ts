import { runRepoSourcesSync } from "./lib";
import { getRepoSourcesScriptPaths } from "./paths";

function main() {
  const fetch = process.argv.includes("--fetch");
  const paths = getRepoSourcesScriptPaths();
  const result = runRepoSourcesSync({
    apply: false,
    fetch,
    registryPath: paths.registryPath,
    workspaceRoot: paths.workspaceRoot,
    reportsDir: paths.reportsDir,
  });

  const ok = result.summary.blocked === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        apply: result.apply,
        fetch: result.fetch,
        registryPath: result.registryPath,
        summary: result.summary,
        countsByState: result.countsByState,
        reports: result.reports,
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) process.exit(1);
}

main();
