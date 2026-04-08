import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveDirectiveWorkspaceRoot } from "@/server/paths/directive-workspace-root";

export type DirectiveEngineBoundaryPayload = {
  source: unknown;
  mission: unknown;
  gaps: unknown;
  receivedAt: string;
};

export async function processDirectiveEngineSource(input: {
  directiveRoot?: string | null;
  payload: DirectiveEngineBoundaryPayload;
}) {
  const directiveRoot = resolveDirectiveWorkspaceRoot({
    directiveRoot: input.directiveRoot,
  });
  const runnerPath = path.resolve(
    process.cwd(),
    "scripts",
    "run-directive-engine-boundary.ts",
  );
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "directive-engine-boundary-"),
  );
  const inputPath = path.join(tempDir, "engine-input.json");

  fs.writeFileSync(
    inputPath,
    `${JSON.stringify(input.payload, null, 2)}\n`,
    "utf8",
  );

  try {
    const output = execFileSync(
      "node",
      [
        "--no-warnings=MODULE_TYPELESS_PACKAGE_JSON",
        "--experimental-strip-types",
        runnerPath,
        "--directive-root",
        directiveRoot,
        "--input-json-path",
        inputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    return JSON.parse(output) as {
      record: any;
      adapterResults?: unknown;
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
