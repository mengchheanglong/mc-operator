import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3217,
      tempPrefix: "mission-control-automation-health-api-",
      sqliteFilename: "automation-health-api.sqlite",
      setup: (tempDir) => {
        const workspaceRoot = path.join(tempDir, "workspace");
        mkdirSync(workspaceRoot, { recursive: true });
        return {
          OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
          N8N_BASE_URL: "",
          N8N_WEBHOOK_BASE_URL: "",
          N8N_API_KEY: "",
        };
      },
    },
    async (ctx) => {
      const openclawHealthRoute = await import(
        "../src/app/api/automation/openclaw/health/route.ts"
      );
      const n8nStatusRoute = await import(
        "../src/app/api/automation/n8n/status/route.ts"
      );

      const { GET: getOpenclawHealth } = openclawHealthRoute;
      const { GET: getN8nStatus } = n8nStatusRoute;

      const openclawResponse = await getOpenclawHealth(
        new Request(
          "http://localhost/api/automation/openclaw/health?projectId=mission-control",
          { method: "GET" },
        ),
      );
      assert.ok(
        [200, 503].includes(openclawResponse.status),
        "expected openclaw health status 200 or 503",
      );
      const openclawJson = (await openclawResponse.json()) as {
        ok?: boolean;
        status?: number;
        body?: string;
        command?: string;
        args?: string[];
        agentId?: string;
      };
      assert.equal(typeof openclawJson.ok, "boolean", "expected health ok boolean");
      assert.equal(
        typeof openclawJson.command,
        "string",
        "expected health command string",
      );
      assert.ok(
        Array.isArray(openclawJson.args),
        "expected health command args array",
      );
      assert.equal(
        typeof openclawJson.agentId,
        "string",
        "expected health agentId string",
      );

      const n8nResponse = await getN8nStatus(
        new Request(
          "http://localhost/api/automation/n8n/status?projectId=mission-control",
          { method: "GET" },
        ),
      );
      assert.equal(n8nResponse.status, 200, "expected n8n status 200");
      const n8nJson = (await n8nResponse.json()) as {
        success?: boolean;
        automation?: {
          provider?: string;
          status?: string;
          suggestions?: string[];
          missionControl?: {
            projectId?: string;
            tokenHeader?: string;
          };
        };
      };
      assert.equal(n8nJson.success, true, "expected n8n success true");
      assert.equal(n8nJson.automation?.provider, "n8n", "expected n8n provider");
      assert.ok(
        ["missing", "configured", "connected", "error"].includes(
          String(n8nJson.automation?.status || ""),
        ),
        "expected valid n8n status",
      );
      assert.ok(
        Array.isArray(n8nJson.automation?.suggestions),
        "expected n8n suggestions array",
      );
      assert.equal(
        n8nJson.automation?.missionControl?.projectId,
        "mission-control",
        "expected projectId in missionControl payload",
      );
      assert.equal(
        n8nJson.automation?.missionControl?.tokenHeader,
        "x-openclaw-automation-token",
        "expected automation token header name",
      );

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            openclaw: {
              status: openclawResponse.status,
              ok: openclawJson.ok ?? null,
              agentId: openclawJson.agentId ?? null,
            },
            n8n: {
              status: n8nResponse.status,
              provider: n8nJson.automation?.provider ?? null,
              mode: n8nJson.automation?.status ?? null,
            },
          },
          null,
          2,
        )}\n`,
      );
    },
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
