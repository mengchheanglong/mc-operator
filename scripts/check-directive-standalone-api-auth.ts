import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;

function readJsonFile<T>(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as T;
}

async function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const configPath = path.resolve(standaloneHostRoot, "config.ts");
  const serverPath = path.resolve(standaloneHostRoot, "server.ts");
  const authContractPath = path.resolve(
    directiveRoot,
    "shared",
    "contracts",
    "standalone-host-api-auth-guard.md",
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
  const forgeFollowUpExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-follow-up.example.json",
  );
  const forgeRecordExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-record.example.json",
  );
  const forgeProofExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-proof-bundle.example.json",
  );
  const forgeTransformationProofExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-transformation-proof.example.json",
  );
  const forgeTransformationRecordExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-transformation-record.example.json",
  );
  const forgePromotionExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-promotion-record.example.json",
  );
  const forgeRegistryExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-registry-entry.example.json",
  );

  const issues: string[] = [];
  const requiredPaths = [
    configPath,
    serverPath,
    authContractPath,
    schemaPath,
    queueOnlyExamplePath,
    forgeFollowUpExamplePath,
    forgeRecordExamplePath,
    forgeProofExamplePath,
    forgeTransformationProofExamplePath,
    forgeTransformationRecordExamplePath,
    forgePromotionExamplePath,
    forgeRegistryExamplePath,
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(
      ...missingPaths.map((filePath) =>
        `missing standalone API auth asset: ${filePath}`),
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
      auth: {
        mode: string;
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

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-api-auth-"));
  const runtimeConfigPath = path.resolve(tempRoot, "standalone-host-auth.config.json");
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
        auth: {
          mode: "static_bearer",
          bearerToken: "directive-standalone-secret",
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

  try {
    const config = loadStandaloneHostConfig(runtimeConfigPath);
    if (config.auth.mode !== "static_bearer") {
      issues.push("standalone API auth config must resolve static_bearer mode");
    }

    const handle = await startStandaloneHostServerFromConfig(config);
    try {
      const healthResponse = await fetch(`${handle.origin}/health`);
      const unauthStatusResponse = await fetch(`${handle.origin}/api/runtime/status`);
      const unauthOverviewResponse = await fetch(
        `${handle.origin}/api/discovery/overview?max_entries=4`,
      );
      const unauthSubmitResponse = await fetch(
        `${handle.origin}/api/discovery/submissions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(queueOnlyExamplePath)),
        },
      );
      const unauthForgeOverviewResponse = await fetch(
        `${handle.origin}/api/forge/overview?max_entries=4`,
      );
      const unauthForgeFollowUpResponse = await fetch(
        `${handle.origin}/api/forge/follow-ups`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeFollowUpExamplePath)),
        },
      );
      const unauthForgeRecordResponse = await fetch(
        `${handle.origin}/api/forge/records`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeRecordExamplePath)),
        },
      );
      const unauthForgeProofResponse = await fetch(
        `${handle.origin}/api/forge/proof-bundles`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeProofExamplePath)),
        },
      );
      const unauthForgeTransformationProofResponse = await fetch(
        `${handle.origin}/api/forge/transformation-proofs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(
            readJsonFile<JsonRecord>(forgeTransformationProofExamplePath),
          ),
        },
      );
      const unauthForgeTransformationRecordResponse = await fetch(
        `${handle.origin}/api/forge/transformation-records`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(
            readJsonFile<JsonRecord>(forgeTransformationRecordExamplePath),
          ),
        },
      );
      const unauthForgePromotionResponse = await fetch(
        `${handle.origin}/api/forge/promotion-records`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgePromotionExamplePath)),
        },
      );
      const unauthForgeRegistryResponse = await fetch(
        `${handle.origin}/api/forge/registry-entries`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeRegistryExamplePath)),
        },
      );
      const wrongTokenResponse = await fetch(`${handle.origin}/api/runtime/status`, {
        headers: {
          authorization: "Bearer wrong-token",
        },
      });
      const authHeaders = {
        authorization: "Bearer directive-standalone-secret",
      };
      const authStatusResponse = await fetch(`${handle.origin}/api/runtime/status`, {
        headers: authHeaders,
      });
      const authStatusJson = await authStatusResponse.json() as JsonRecord;
      const authOverviewResponse = await fetch(
        `${handle.origin}/api/discovery/overview?max_entries=4`,
        {
          headers: authHeaders,
        },
      );
      const authForgeOverviewResponse = await fetch(
        `${handle.origin}/api/forge/overview?max_entries=4`,
        {
          headers: authHeaders,
        },
      );
      const authSubmitResponse = await fetch(
        `${handle.origin}/api/discovery/submissions`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...readJsonFile<JsonRecord>(queueOnlyExamplePath),
            candidate_id: "dw-example-queue-only-auth-guard",
          }),
        },
      );
      const authSubmitJson = await authSubmitResponse.json() as JsonRecord;
      const authForgeFollowUpResponse = await fetch(
        `${handle.origin}/api/forge/follow-ups`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeFollowUpExamplePath)),
        },
      );
      const authForgeFollowUpJson = await authForgeFollowUpResponse.json() as JsonRecord;
      const authForgeRecordResponse = await fetch(
        `${handle.origin}/api/forge/records`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeRecordExamplePath)),
        },
      );
      const authForgeRecordJson = await authForgeRecordResponse.json() as JsonRecord;
      const authForgeProofResponse = await fetch(
        `${handle.origin}/api/forge/proof-bundles`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeProofExamplePath)),
        },
      );
      const authForgeProofJson = await authForgeProofResponse.json() as JsonRecord;
      const authForgeTransformationProofResponse = await fetch(
        `${handle.origin}/api/forge/transformation-proofs`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(
            readJsonFile<JsonRecord>(forgeTransformationProofExamplePath),
          ),
        },
      );
      const authForgeTransformationProofJson =
        await authForgeTransformationProofResponse.json() as JsonRecord;
      const authForgeTransformationRecordResponse = await fetch(
        `${handle.origin}/api/forge/transformation-records`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(
            readJsonFile<JsonRecord>(forgeTransformationRecordExamplePath),
          ),
        },
      );
      const authForgeTransformationRecordJson =
        await authForgeTransformationRecordResponse.json() as JsonRecord;
      const authForgePromotionResponse = await fetch(
        `${handle.origin}/api/forge/promotion-records`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgePromotionExamplePath)),
        },
      );
      const authForgePromotionJson = await authForgePromotionResponse.json() as JsonRecord;
      const authForgeRegistryResponse = await fetch(
        `${handle.origin}/api/forge/registry-entries`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(readJsonFile<JsonRecord>(forgeRegistryExamplePath)),
        },
      );
      const authForgeRegistryJson = await authForgeRegistryResponse.json() as JsonRecord;
      const statusArtifact = readJsonFile<JsonRecord>(handle.statusPath);
      const runtimeAuth = statusArtifact.auth as JsonRecord | undefined;

      if (healthResponse.status !== 200) {
        issues.push("standalone API auth guard must keep /health public");
      }
      if (unauthStatusResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/runtime/status");
      }
      if (unauthOverviewResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/discovery/overview");
      }
      if (unauthSubmitResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/discovery/submissions");
      }
      if (unauthForgeOverviewResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/overview");
      }
      if (unauthForgeFollowUpResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/follow-ups");
      }
      if (unauthForgeRecordResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/records");
      }
      if (unauthForgeProofResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/proof-bundles");
      }
      if (unauthForgeTransformationProofResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/transformation-proofs");
      }
      if (unauthForgeTransformationRecordResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/transformation-records");
      }
      if (unauthForgePromotionResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/promotion-records");
      }
      if (unauthForgeRegistryResponse.status !== 401) {
        issues.push("standalone API auth guard must protect /api/forge/registry-entries");
      }
      if (wrongTokenResponse.status !== 401) {
        issues.push("standalone API auth guard must reject wrong bearer tokens");
      }
      if (
        authStatusResponse.status !== 200
        || authStatusJson.ok !== true
        || (authStatusJson.runtime as JsonRecord | undefined)?.auth === undefined
      ) {
        issues.push("standalone API auth guard must allow authorized runtime status requests");
      }
      if (authOverviewResponse.status !== 200) {
        issues.push("standalone API auth guard must allow authorized overview requests");
      }
      if (authForgeOverviewResponse.status !== 200) {
        issues.push("standalone API auth guard must allow authorized Forge overview requests");
      }
      if (
        authSubmitResponse.status !== 200
        || authSubmitJson.status !== "pending"
        || authSubmitJson.record_shape !== "queue_only"
      ) {
        issues.push("standalone API auth guard must allow authorized queue submissions");
      }
      if (
        authForgeFollowUpResponse.status !== 200
        || authForgeFollowUpJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge follow-up writes");
      }
      if (
        authForgeRecordResponse.status !== 200
        || authForgeRecordJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge record writes");
      }
      if (
        authForgeProofResponse.status !== 200
        || authForgeProofJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge proof writes");
      }
      if (
        authForgeTransformationProofResponse.status !== 200
        || authForgeTransformationProofJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge transformation proof writes");
      }
      if (
        authForgeTransformationRecordResponse.status !== 200
        || authForgeTransformationRecordJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge transformation record writes");
      }
      if (
        authForgePromotionResponse.status !== 200
        || authForgePromotionJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge promotion writes");
      }
      if (
        authForgeRegistryResponse.status !== 200
        || authForgeRegistryJson.ok !== true
      ) {
        issues.push("standalone API auth guard must allow authorized Forge registry writes");
      }
      if (
        runtimeAuth?.mode !== "static_bearer"
        || !Array.isArray(runtimeAuth?.protectedRoutePrefixes)
      ) {
        issues.push("standalone API auth guard must persist auth mode and protected routes in status.json");
      }
      if (JSON.stringify(statusArtifact).includes("directive-standalone-secret")) {
        issues.push("standalone API auth guard must not persist the bearer token in status.json");
      }
    } finally {
      await handle.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
