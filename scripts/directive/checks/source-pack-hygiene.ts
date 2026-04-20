import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

const DISALLOWED_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  "htmlcov",
  ".nyc_output",
  "lcov-report",
]);

function walkForDisallowedDirectories(rootPath: string) {
  const offenders: string[] = [];
  if (!fs.existsSync(rootPath)) return offenders;

  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(current, entry.name);
      if (DISALLOWED_DIR_NAMES.has(entry.name)) {
        offenders.push(fullPath);
        continue;
      }
      stack.push(fullPath);
    }
  }

  return offenders.sort();
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const sourcePacksRoot = path.join(directiveRoot, "forge", "source-packs");
  const readmePath = path.join(sourcePacksRoot, "README.md");
  const gitignorePath = path.join(sourcePacksRoot, ".gitignore");
  const readme = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, "utf8")
    : null;
  const gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : null;
  const offenders = walkForDisallowedDirectories(sourcePacksRoot);

  const checks: Check[] = [
    {
      id: "directive-source-packs-gitignore-exists",
      ok: Boolean(gitignore),
      reason: gitignore ? null : `missing source-pack hygiene ignore file: ${gitignorePath}`,
    },
    {
      id: "directive-source-packs-gitignore-covers-generated-dependencies",
      ok:
        Boolean(gitignore) &&
        gitignore!.includes("**/node_modules/") &&
        gitignore!.includes("**/.next/") &&
        gitignore!.includes("**/.turbo/") &&
        gitignore!.includes("**/.cache/") &&
        gitignore!.includes("**/htmlcov/") &&
        gitignore!.includes("**/.nyc_output/"),
      reason:
        gitignore &&
        gitignore.includes("**/node_modules/") &&
        gitignore.includes("**/.next/") &&
        gitignore.includes("**/.turbo/") &&
        gitignore.includes("**/.cache/") &&
        gitignore.includes("**/htmlcov/") &&
        gitignore.includes("**/.nyc_output/")
          ? null
          : "source-pack .gitignore is missing one or more generated-artifact patterns",
    },
    {
      id: "directive-source-pack-readme-documents-hygiene-rule",
      ok:
        Boolean(readme) &&
        readme!.includes("generated dependency trees") &&
        readme!.includes("bounded build output is allowed only") &&
        readme!.includes("source packs must stay curated and reproducible"),
      reason:
        readme &&
        readme.includes("generated dependency trees") &&
        readme.includes("bounded build output is allowed only") &&
        readme.includes("source packs must stay curated and reproducible")
          ? null
          : `missing hygiene terms in source-packs README: ${readmePath}`,
    },
    {
      id: "directive-source-packs-have-no-generated-dependency-or-cache-directories",
      ok: offenders.length === 0,
      reason:
        offenders.length === 0
          ? null
          : `disallowed generated directories under forge/source-packs: ${offenders.join(", ")}`,
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      offenderCount: offenders.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
