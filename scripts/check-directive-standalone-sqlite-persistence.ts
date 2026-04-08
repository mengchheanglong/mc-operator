import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;

function readJsonFile<T>(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as T;
}

function readCount(sqlite: DatabaseSync, tableName: string) {
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as { count: number };
  return Number(row.count);
}

async function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const configPath = path.resolve(standaloneHostRoot, "config.ts");
  const persistencePath = path.resolve(standaloneHostRoot, "persistence.ts");
  const serverPath = path.resolve(standaloneHostRoot, "server.ts");
  const contractPath = path.resolve(
    directiveRoot,
    "shared",
    "contracts",
    "standalone-host-sqlite-persistence-profile.md",
  );
  const schemaPath = path.resolve(
    directiveRoot,
    "shared",
    "schemas",
    "standalone-host-config.schema.json",
  );
  const queueOnlyExamplePath = path.resolve(
    directiveRoot,
    "hosts",
    "integration-kit",
    "examples",
    "discovery-submission-queue-only.json",
  );
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  const requiredPaths = [
    configPath,
    persistencePath,
    serverPath,
    contractPath,
    schemaPath,
    queueOnlyExamplePath,
    cliPath,
    tsxPath,
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(
      ...missingPaths.map((filePath) =>
        `missing standalone SQLite persistence asset: ${filePath}`),
    );
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const { loadStandaloneHostConfig } = await import(
    pathToFileURL(configPath).href
  ) as {
    loadStandaloneHostConfig: (configPath: string) => {
      directiveRoot: string;
      persistence: {
        mode: string;
        sqlitePath: string | null;
      };
    };
  };
  const { startStandaloneHostServerFromConfig } = await import(
    pathToFileURL(serverPath).href
  ) as {
    startStandaloneHostServerFromConfig: (
      config: ReturnType<typeof loadStandaloneHostConfig>,
    ) => Promise<{
      origin: string;
      statusPath: string;
      close(): Promise<void>;
    }>;
  };

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-sqlite-"));
  const runtimeConfigPath = path.resolve(tempRoot, "standalone-host-sqlite.config.json");
  const runtimeDirectiveRoot = path.resolve(tempRoot, "directive-runtime");
  fs.writeFileSync(
    runtimeConfigPath,
    `${JSON.stringify(
      {
        mode: "standalone_reference_api_host",
        directiveRoot: "./directive-runtime",
        receivedAt: "2026-03-23",
        server: {
          host: "127.0.0.1",
          port: 0,
        },
        runtimeArtifacts: {
          relativeRoot: "runtime/standalone-host",
          writeStatusFile: true,
          writeAccessLog: true,
          writeBootLog: true,
        },
        persistence: {
          mode: "filesystem_and_sqlite",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  let sqlitePath: string | null = null;
  let runtimeSessions = 0;
  let runtimeRequests = 0;
  let runtimeEvents = 0;
  let queueSnapshots = 0;
  let artifactWrites = 0;

  try {
    const loadedConfig = loadStandaloneHostConfig(runtimeConfigPath);
    sqlitePath = loadedConfig.persistence.sqlitePath;

    if (loadedConfig.persistence.mode !== "filesystem_and_sqlite") {
      issues.push("standalone SQLite persistence config must resolve filesystem_and_sqlite mode");
    }
    if (!sqlitePath) {
      issues.push("standalone SQLite persistence config must resolve a SQLite path");
    } else if (
      !sqlitePath.endsWith("/runtime/standalone-host/standalone-host.sqlite")
    ) {
      issues.push("standalone SQLite persistence config must default the canonical SQLite path");
    }

    const cliSubmitOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-submit --config '${runtimeConfigPath}' --input-json-path '${queueOnlyExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as JsonRecord;

    if (
      cliSubmitOutput.ok !== true
      || cliSubmitOutput.status !== "pending"
      || cliSubmitOutput.record_shape !== "queue_only"
    ) {
      issues.push("standalone SQLite persistence discovery-submit --config must preserve queue_only submissions");
    }

    const handle = await startStandaloneHostServerFromConfig(loadedConfig);
    try {
      const healthResponse = await fetch(`${handle.origin}/health`);
      const statusResponse = await fetch(`${handle.origin}/api/runtime/status`);
      const statusJson = await statusResponse.json() as JsonRecord;
      const submitResponse = await fetch(
        `${handle.origin}/api/discovery/submissions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...readJsonFile<JsonRecord>(queueOnlyExamplePath),
            candidate_id: "dw-example-queue-only-sqlite",
          }),
        },
      );
      const submitJson = await submitResponse.json() as JsonRecord;
      const overviewResponse = await fetch(
        `${handle.origin}/api/discovery/overview?max_entries=4`,
      );
      const overviewJson = await overviewResponse.json() as JsonRecord;

      if (healthResponse.status !== 200) {
        issues.push("standalone SQLite persistence host must keep /health available");
      }
      if (
        statusResponse.status !== 200
        || statusJson.ok !== true
        || ((statusJson.runtime as JsonRecord | undefined)?.persistence as JsonRecord | undefined)?.mode
          !== "filesystem_and_sqlite"
      ) {
        issues.push("standalone SQLite persistence runtime status must expose filesystem_and_sqlite mode");
      }
      if (
        submitResponse.status !== 200
        || submitJson.status !== "pending"
        || submitJson.record_shape !== "queue_only"
      ) {
        issues.push("standalone SQLite persistence host must accept queue_only submissions");
      }
      if (
        overviewResponse.status !== 200
        || overviewJson.ok !== true
        || Number(
          ((overviewJson.overview as JsonRecord | undefined)?.totalEntries ?? 0),
        ) < 2
      ) {
        issues.push("standalone SQLite persistence overview must reflect both submitted queue entries");
      }
    } finally {
      await handle.close();
    }

    const statusArtifact = readJsonFile<JsonRecord>(
      path.resolve(runtimeDirectiveRoot, "runtime", "standalone-host", "status.json"),
    );
    const persistedRuntime = statusArtifact.persistence as JsonRecord | undefined;
    if (
      persistedRuntime?.mode !== "filesystem_and_sqlite"
      || typeof persistedRuntime.sqlitePath !== "string"
      || persistedRuntime.experimentalRuntime !== true
    ) {
      issues.push("standalone SQLite persistence status.json must persist the enabled persistence profile");
    }

    if (!sqlitePath || !fs.existsSync(sqlitePath)) {
      issues.push("standalone SQLite persistence must materialize the SQLite database file");
    } else {
      const sqlite = new DatabaseSync(sqlitePath);
      try {
        runtimeSessions = readCount(sqlite, "runtime_sessions");
        runtimeRequests = readCount(sqlite, "runtime_request_log");
        runtimeEvents = readCount(sqlite, "runtime_events");
        queueSnapshots = readCount(sqlite, "discovery_queue_snapshots");
        artifactWrites = readCount(sqlite, "artifact_writes");

        const startedEvents = readCount(
          sqlite,
          "(SELECT * FROM runtime_events WHERE event_type = 'started')",
        );
        const stoppedEvents = readCount(
          sqlite,
          "(SELECT * FROM runtime_events WHERE event_type = 'stopped')",
        );

        if (runtimeSessions < 1) {
          issues.push("standalone SQLite persistence must record at least one runtime session");
        }
        if (runtimeRequests < 4) {
          issues.push("standalone SQLite persistence must record served request rows");
        }
        if (runtimeEvents < 2 || startedEvents < 1 || stoppedEvents < 1) {
          issues.push("standalone SQLite persistence must record start and stop runtime events");
        }
        if (queueSnapshots < 2) {
          issues.push("standalone SQLite persistence must record discovery queue snapshots");
        }
        if (artifactWrites < 3) {
          issues.push("standalone SQLite persistence must record artifact writes for queue/status activity");
        }
      } finally {
        sqlite.close();
      }
    }
  } catch (error) {
    issues.push(
      `standalone SQLite persistence flow failed: ${String((error as Error).message || error)}`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        standaloneHostRoot,
        sqlitePath,
        metrics: {
          requiredAssets: requiredPaths.length,
          missingAssets: missingPaths.length,
          runtimeSessions,
          runtimeRequests,
          runtimeEvents,
          queueSnapshots,
          artifactWrites,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

void main();
