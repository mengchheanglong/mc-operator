import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function listEntries(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [] as fs.Dirent[];
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const architectureIntakeRoot = path.join(directiveRoot, "architecture", "00-intake");
  const architectureDeferredRoot = path.join(
    directiveRoot,
    "architecture",
    "04-deferred-or-rejected",
  );
  const sourceIntakeRoot = path.join(directiveRoot, "sources", "intake");
  const sourceDeferredRoot = path.join(
    directiveRoot,
    "sources",
    "deferred-or-rejected",
  );

  const intakeEntries = listEntries(architectureIntakeRoot);
  const deferredEntries = listEntries(architectureDeferredRoot);

  const intakeDirectories = intakeEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const intakeUnexpectedFiles = intakeEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== ".gitkeep" &&
        entry.name !== "README.md",
    )
    .map((entry) => entry.name);
  const deferredDirectories = deferredEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const deferredUnexpectedFiles = deferredEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== ".gitkeep" &&
        entry.name !== "README.md" &&
        !entry.name.toLowerCase().endsWith(".md"),
    )
    .map((entry) => entry.name);

  const checks: Check[] = [
    {
      id: "directive-sources-intake-root-exists",
      ok: fs.existsSync(sourceIntakeRoot),
      reason: fs.existsSync(sourceIntakeRoot)
        ? null
        : `missing source intake root: ${sourceIntakeRoot}`,
    },
    {
      id: "directive-sources-deferred-root-exists",
      ok: fs.existsSync(sourceDeferredRoot),
      reason: fs.existsSync(sourceDeferredRoot)
        ? null
        : `missing source deferred root: ${sourceDeferredRoot}`,
    },
    {
      id: "architecture-00-intake-has-no-raw-source-directories",
      ok: intakeDirectories.length === 0,
      reason:
        intakeDirectories.length === 0
          ? null
          : `raw source directories still under architecture/00-intake: ${intakeDirectories.join(", ")}`,
    },
    {
      id: "architecture-00-intake-has-only-placeholder-files",
      ok: intakeUnexpectedFiles.length === 0,
      reason:
        intakeUnexpectedFiles.length === 0
          ? null
          : `unexpected files under architecture/00-intake: ${intakeUnexpectedFiles.join(", ")}`,
    },
    {
      id: "architecture-04-deferred-has-no-raw-source-directories",
      ok: deferredDirectories.length === 0,
      reason:
        deferredDirectories.length === 0
          ? null
          : `raw source directories still under architecture/04-deferred-or-rejected: ${deferredDirectories.join(", ")}`,
    },
    {
      id: "architecture-04-deferred-has-only-markdown-records",
      ok: deferredUnexpectedFiles.length === 0,
      reason:
        deferredUnexpectedFiles.length === 0
          ? null
          : `unexpected non-markdown files under architecture/04-deferred-or-rejected: ${deferredUnexpectedFiles.join(", ")}`,
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      architectureIntakeEntries: intakeEntries.length,
      architectureDeferredEntries: deferredEntries.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
