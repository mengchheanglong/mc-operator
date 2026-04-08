import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;

function readJsonFile<T>(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as T;
}

function readJsonLines(filePath: string) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

async function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const configLoaderPath = path.resolve(standaloneHostRoot, "config.ts");
  const serverPath = path.resolve(standaloneHostRoot, "server.ts");
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
  const exampleConfigPath = path.resolve(
    standaloneHostRoot,
    "standalone-host.config.example.json",
  );
  const schemaPath = path.resolve(
    directiveRoot,
    "shared",
    "schemas",
    "standalone-host-config.schema.json",
  );
  const contractPath = path.resolve(
    directiveRoot,
    "shared",
    "contracts",
    "standalone-host-runtime-profile.md",
  );
  const queueOnlyExamplePath = path.resolve(
    directiveRoot,
    "hosts",
    "integration-kit",
    "examples",
    "discovery-submission-queue-only.json",
  );
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  const requiredPaths = [
    configLoaderPath,
    serverPath,
    cliPath,
    exampleConfigPath,
    schemaPath,
    contractPath,
    queueOnlyExamplePath,
    tsxPath,
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(
      ...missingPaths.map((filePath) =>
        `missing standalone runtime profile asset: ${filePath}`),
    );
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const { loadStandaloneHostConfig } = await import(
    pathToFileURL(configLoaderPath).href
  ) as {
    loadStandaloneHostConfig: (configPath: string) => {
      directiveRoot: string;
      runtimeArtifacts: {
        root: string;
        relativeRoot: string;
      };
      mode: string;
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
      accessLogPath: string;
      bootLogPath: string;
      runtimeArtifactsRoot: string;
      close(): Promise<void>;
    }>;
  };

  let exampleConfigLoaded = false;
  try {
    const loadedExampleConfig = loadStandaloneHostConfig(exampleConfigPath);
    exampleConfigLoaded =
      loadedExampleConfig.mode === "standalone_reference_api_host"
      && loadedExampleConfig.runtimeArtifacts.relativeRoot === "runtime/standalone-host";
  } catch (error) {
    issues.push(
      `standalone host example config must load: ${String((error as Error).message || error)}`,
    );
  }

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "dw-standalone-runtime-profile-check-"),
  );
  const runtimeConfigPath = path.resolve(tempRoot, "standalone-host.config.json");
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
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  let cliSubmitOutput: JsonRecord | null = null;
  let cliOverviewOutput: JsonRecord | null = null;
  let runningStatusJson: JsonRecord | null = null;
  let stoppedStatusJson: JsonRecord | null = null;
  let accessLogLines: JsonRecord[] = [];
  let bootLogLines: JsonRecord[] = [];
  let stoppedBootLogLines: JsonRecord[] = [];

  try {
    cliSubmitOutput = JSON.parse(
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

    cliOverviewOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-overview --config '${runtimeConfigPath}' --max-entries 4`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as JsonRecord;

    const loadedConfig = loadStandaloneHostConfig(runtimeConfigPath);
    const handle = await startStandaloneHostServerFromConfig(loadedConfig);

    try {
      const runtimeSubmitRequest = {
        ...readJsonFile<JsonRecord>(queueOnlyExamplePath),
        candidate_id: "dw-example-queue-only-runtime-profile",
      };
      const healthResponse = await fetch(`${handle.origin}/health`);
      const healthJson = await healthResponse.json() as JsonRecord;
      const runtimeStatusResponse = await fetch(`${handle.origin}/api/runtime/status`);
      const runtimeStatusJson = await runtimeStatusResponse.json() as JsonRecord;
      const submitResponse = await fetch(
        `${handle.origin}/api/discovery/submissions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(runtimeSubmitRequest),
        },
      );
      const submitJson = await submitResponse.json() as JsonRecord;
      const overviewResponse = await fetch(
        `${handle.origin}/api/discovery/overview?max_entries=4`,
      );
      const overviewJson = await overviewResponse.json() as JsonRecord;

      if (
        healthResponse.status !== 200
        || healthJson.ok !== true
        || healthJson.runtime_artifacts_root !== handle.runtimeArtifactsRoot
      ) {
        issues.push("standalone runtime profile health endpoint must expose the runtime artifacts root");
      }
      if (
        runtimeStatusResponse.status !== 200
        || runtimeStatusJson.ok !== true
        || (runtimeStatusJson.runtime as JsonRecord | undefined)?.lifecycle !== "running"
      ) {
        issues.push("standalone runtime profile status endpoint must report a running lifecycle");
      }
      if (
        submitResponse.status !== 200
        || submitJson.status !== "pending"
        || submitJson.record_shape !== "queue_only"
      ) {
        issues.push("standalone runtime profile submission endpoint must still create a pending queue_only entry");
      }
      if (
        overviewResponse.status !== 200
        || overviewJson.ok !== true
        || Number(
          ((overviewJson.overview as JsonRecord | undefined)?.totalEntries ?? 0),
        ) < 1
      ) {
        issues.push("standalone runtime profile overview endpoint must report queue entries");
      }

      runningStatusJson = readJsonFile<JsonRecord>(handle.statusPath);
      accessLogLines = readJsonLines(handle.accessLogPath);
      bootLogLines = readJsonLines(handle.bootLogPath);

      await handle.close();

      stoppedStatusJson = readJsonFile<JsonRecord>(handle.statusPath);
      stoppedBootLogLines = readJsonLines(handle.bootLogPath);
    } catch (error) {
      issues.push(
        `standalone runtime profile server flow failed: ${String((error as Error).message || error)}`,
      );
    }
  } catch (error) {
    issues.push(
      `standalone runtime profile CLI config flow failed: ${String((error as Error).message || error)}`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (!exampleConfigLoaded) {
    issues.push("standalone host example config must resolve under the canonical loader");
  }

  if (!cliSubmitOutput || cliSubmitOutput.ok !== true) {
    issues.push("standalone runtime profile discovery-submit --config must succeed");
  } else if (
    cliSubmitOutput.status !== "pending"
    || cliSubmitOutput.record_shape !== "queue_only"
  ) {
    issues.push("standalone runtime profile discovery-submit --config must preserve queue_only pending submissions");
  }

  if (!cliOverviewOutput || cliOverviewOutput.ok !== true) {
    issues.push("standalone runtime profile discovery-overview --config must succeed");
  } else {
    const overview = cliOverviewOutput.overview as JsonRecord | undefined;
    if (Number(overview?.totalEntries ?? 0) < 1) {
      issues.push("standalone runtime profile discovery-overview --config must see the submitted queue entry");
    }
  }

  if (!runningStatusJson) {
    issues.push("standalone runtime profile must write a running status.json artifact");
  } else {
    const metrics = runningStatusJson.metrics as JsonRecord | undefined;
    if (runningStatusJson.lifecycle !== "running") {
      issues.push("standalone runtime profile status.json must record running lifecycle before shutdown");
    }
    if (Number(metrics?.requestCount ?? 0) < 4) {
      issues.push("standalone runtime profile status.json must count served API requests");
    }
  }

  if (accessLogLines.length < 4) {
    issues.push("standalone runtime profile must append access-log.jsonl entries for served requests");
  } else {
    const routeIds = accessLogLines.map((line) => String(line.routeId ?? ""));
    if (!routeIds.includes("health")) {
      issues.push("standalone runtime profile access log must include the health route");
    }
    if (!routeIds.includes("runtime_status")) {
      issues.push("standalone runtime profile access log must include the runtime status route");
    }
    if (!routeIds.includes("discovery_submit")) {
      issues.push("standalone runtime profile access log must include the discovery submission route");
    }
    if (!routeIds.includes("discovery_overview")) {
      issues.push("standalone runtime profile access log must include the discovery overview route");
    }
  }

  if (bootLogLines.length < 1 || bootLogLines[0]?.event !== "started") {
    issues.push("standalone runtime profile boot-log.jsonl must record the start event");
  }

  if (!stoppedStatusJson || stoppedStatusJson.lifecycle !== "stopped") {
    issues.push("standalone runtime profile must persist stopped lifecycle after shutdown");
  }

  if (
    stoppedBootLogLines.length < 2
    || stoppedBootLogLines.at(-1)?.event !== "stopped"
  ) {
    issues.push("standalone runtime profile boot-log.jsonl must record the stop event");
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        standaloneHostRoot,
        metrics: {
          requiredAssets: requiredPaths.length,
          missingAssets: missingPaths.length,
          accessLogEntries: accessLogLines.length,
          bootLogEntries: stoppedBootLogLines.length || bootLogLines.length,
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
