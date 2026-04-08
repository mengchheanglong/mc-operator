import { readdirSync, readFileSync } from "fs";
import path from "path";

type PackageJson = {
  scripts?: Record<string, string>;
};

function findWorkflowScriptCalls(contents: string): string[] {
  const scripts = new Set<string>();
  const regex = /npm\s+run(?:\s+--silent)?\s+([A-Za-z0-9:_-]+)/g;

  let match: RegExpExecArray | null = regex.exec(contents);
  while (match) {
    const scriptName = match[1]?.trim();
    if (scriptName) {
      scripts.add(scriptName);
    }
    match = regex.exec(contents);
  }

  return [...scripts];
}

function main() {
  const root = process.cwd();
  const packageJsonPath = path.join(root, "package.json");
  const workflowsDir = path.join(root, ".github", "workflows");

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
  const definedScripts = new Set(Object.keys(packageJson.scripts || {}));

  const workflowFiles = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  const missing: Array<{ workflow: string; script: string }> = [];
  const calls: Array<{ workflow: string; script: string }> = [];

  for (const workflowFile of workflowFiles) {
    const fullPath = path.join(workflowsDir, workflowFile);
    const raw = readFileSync(fullPath, "utf8");
    const scripts = findWorkflowScriptCalls(raw);

    for (const script of scripts) {
      calls.push({ workflow: workflowFile, script });
      if (!definedScripts.has(script)) {
        missing.push({ workflow: workflowFile, script });
      }
    }
  }

  const output = {
    ok: missing.length === 0,
    checkedWorkflows: workflowFiles.length,
    totalScriptCalls: calls.length,
    calls,
    missing,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (missing.length > 0) {
    process.exit(1);
  }
}

main();
