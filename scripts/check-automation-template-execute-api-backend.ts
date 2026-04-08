import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function startFakeN8nServer() {
  const requests: Array<{ url: string; body: string }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      requests.push({
        url: String(req.url || ""),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, received: true }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve fake n8n server address.");
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function run() {
  const fakeN8n = await startFakeN8nServer();
  try {
    await withBackendTestEnv(
      {
        port: 3214,
        tempPrefix: "mission-control-automation-template-execute-api-",
        sqliteFilename: "automation-template-execute-api.sqlite",
        setup: (tempDir) => ({
          OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace"),
          N8N_BASE_URL: fakeN8n.baseUrl,
        }),
      },
      async (ctx) => {
        const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
        const executeRoute = await import(
          "../src/app/api/automation/templates/[id]/execute/route.ts"
        );
        const runsRoute = await import("../src/app/api/automation/templates/[id]/runs/route.ts");

        const { POST: createTemplate } = templatesRoute;
        const { POST: executeTemplate } = executeRoute;
        const { GET: listTemplateRuns } = runsRoute;

        const createResponse = await createTemplate(
          new Request("http://localhost/api/automation/templates?projectId=mission-control", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "Execute backend check",
              prompt: "Dispatch this template through fake n8n and return concise status.",
              executor: "n8n",
              executionEnv: "worktree",
              webhookPath: "/webhook/check-backend-execute",
              topics: ["automation", "backend"],
            }),
          }),
        );
        assert.equal(createResponse.status, 200, "expected create template status 200");
        const createJson = (await createResponse.json()) as {
          template?: { id?: string; executor?: string };
        };
        const templateId = String(createJson.template?.id || "").trim();
        assert.ok(templateId, "expected template id from create");
        assert.equal(createJson.template?.executor, "n8n", "expected n8n executor");

        const executeResponse = await executeTemplate(
          new Request(
            `http://localhost/api/automation/templates/${templateId}/execute?projectId=mission-control`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ deepMode: false }),
            },
          ),
          { params: Promise.resolve({ id: templateId }) },
        );
        assert.equal(executeResponse.status, 200, "expected execute status 200");
        const executeJson = (await executeResponse.json()) as {
          msg?: string;
          run?: {
            summary?: string;
            reportId?: string;
            reportHref?: string;
            executorPayload?: { idempotencyKey?: string };
          };
          template?: { lastRunStatus?: string | null };
        };
        assert.equal(executeJson.msg, "Automation dispatched.");
        assert.ok(String(executeJson.run?.reportId || "").trim(), "expected run reportId");
        assert.ok(String(executeJson.run?.reportHref || "").trim(), "expected run reportHref");
        assert.ok(
          String(executeJson.run?.executorPayload?.idempotencyKey || "").trim(),
          "expected executor payload idempotency key",
        );
        assert.equal(
          String(executeJson.template?.lastRunStatus || ""),
          "dispatched",
          "expected template last run status dispatched",
        );

        const runsResponse = await listTemplateRuns(
          new Request(
            `http://localhost/api/automation/templates/${templateId}/runs?projectId=mission-control`,
            { method: "GET" },
          ),
          { params: Promise.resolve({ id: templateId }) },
        );
        assert.equal(runsResponse.status, 200, "expected runs status 200");
        const runsJson = (await runsResponse.json()) as {
          runs?: Array<{ status?: string; mode?: string }>;
        };
        const latestRun = Array.isArray(runsJson.runs) ? runsJson.runs[0] : null;
        assert.equal(latestRun?.mode, "execute", "expected latest run mode execute");
        assert.equal(latestRun?.status, "dispatched", "expected latest run status dispatched");

        assert.ok(fakeN8n.requests.length >= 1, "expected fake n8n to receive at least one request");

        process.stdout.write(
          `${JSON.stringify(
            {
              ok: true,
              templateId,
              executeMessage: executeJson.msg || null,
              latestRunStatus: latestRun?.status || null,
              n8nRequests: fakeN8n.requests.length,
            },
            null,
            2,
          )}\n`,
        );
      },
    );
  } finally {
    await new Promise<void>((resolve) => {
      fakeN8n.server.close(() => resolve());
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
