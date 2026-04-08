import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { execSync, spawn, type ChildProcess } from "node:child_process";

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`backend health check timed out: ${baseUrl}/health`);
}

async function run() {
  const tempDir = mkdtempSync(
    path.join(os.tmpdir(), "mission-control-directive-workspace-"),
  );
  process.env.SQLITE_PATH = path.join(tempDir, "directive-workspace-v0.sqlite");

  const backendPort = 3206;
  const backendBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
  process.env.MISSION_CONTROL_BACKEND_BASE_URL = backendBaseUrl;

  let backendProcess: ChildProcess | null = null;

  try {
    execSync("npm --prefix ./backend run build", { stdio: "pipe" });
    backendProcess = spawn(process.execPath, [path.join("dist", "main.js")], {
      cwd: path.join(process.cwd(), "backend"),
      env: {
        ...process.env,
        SQLITE_PATH: process.env.SQLITE_PATH,
        MISSION_CONTROL_BACKEND_PORT: String(backendPort),
        MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForHealth(backendBaseUrl, 20_000);

    const { POST: createCapability, GET: listCapabilities } = await import(
      "../src/app/api/directive-workspace/capabilities/route.ts"
    );
    const { POST: recordAnalysis } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/analysis/route.ts"
    );
    const { POST: createExperiment } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/experiments/route.ts"
    );
    const { POST: recordEvaluation } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/evaluations/route.ts"
    );
    const { POST: recordDecision } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/decision/route.ts"
    );
    const { POST: runLifecycle } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/lifecycle/route.ts"
    );
    const { GET: getLifecycle } = await import(
      "../src/app/api/directive-workspace/capabilities/[id]/route.ts"
    );
    const { GET: getRegistry } = await import(
      "../src/app/api/directive-workspace/registry/route.ts"
    );

    const projectId = "mission-control";
    const sourceRef = `directive://workflow/source-adaptation-check-${Date.now()}`;

    const createReq = new Request(
      `http://localhost/api/directive-workspace/capabilities?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "workflow-writeup",
          sourceRef,
          title: "source-adaptation-check",
          userIntent:
            "Evaluate whether the source-adaptation engine handles non-repo candidates cleanly.",
          notes: [
            "candidate from directive discovery",
            "bounded source-adaptation v0 check",
          ],
        }),
      },
    );
    const createRes = await createCapability(createReq);
    assert.equal(createRes.status, 201, "expected capability create 201");
    const createJson = (await createRes.json()) as {
      capability?: { id?: string; status?: string };
    };
    const capabilityId = createJson.capability?.id;
    assert.ok(capabilityId, "expected capability id");

    const analysisReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}/analysis?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisSummary:
            "Workflow writeup fits the source-adaptation engine and proves the system is not locked to GitHub repo intake.",
          category: "workflow-pattern",
          problemFit: "source-adaptation",
          overlapNotes:
            "Overlaps with doctrine docs but gives the runtime lifecycle a non-repo source candidate.",
          riskNotes:
            "Keep the slice bounded and verify the same lifecycle contract still works for broader source types.",
          recommendation: "test",
        }),
      },
    );
    const analysisRes = await recordAnalysis(analysisReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(analysisRes.status, 200, "expected analysis 200");

    const experimentReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}/experiments?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hypothesis:
            "A bounded non-repo intake flow will prove the canonical source model matches the doctrine-level source-adaptation engine.",
          plan: "Create one non-repo candidate, record one experiment, and capture one explicit decision.",
          successCriteria: [
            "candidate stored",
            "evaluation recorded",
            "decision stored with rollback notes",
          ],
          status: "running",
        }),
      },
    );
    const experimentRes = await createExperiment(experimentReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(experimentRes.status, 201, "expected experiment 201");
    const experimentJson = (await experimentRes.json()) as {
      experiment?: { id?: string };
    };
    const experimentId = experimentJson.experiment?.id;
    assert.ok(experimentId, "expected experiment id");

    const evaluationReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}/evaluations?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experimentId,
          outcome: "positive",
          usefulness:
            "Creates a real domain model instead of static catalog-only intake.",
          friction: "No UI yet; API/service only.",
          workflowImpact:
            "Improves repeatability for capability intake and decision history.",
          evidenceSummary:
            "Lifecycle completed in temp DB with all five record types present.",
        }),
      },
    );
    const evaluationRes = await recordEvaluation(evaluationReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(evaluationRes.status, 201, "expected evaluation 201");
    const evaluationJson = (await evaluationRes.json()) as {
      evaluation?: { id?: string };
    };
    const evaluationId = evaluationJson.evaluation?.id;
    assert.ok(evaluationId, "expected evaluation id");

    const proofTimestamp = new Date().toISOString();
    const integrationProof = {
      execution: {
        ok: true,
        method: "check-script",
        reference: "npm run check:directive-workspace-v0",
        timestamp: proofTimestamp,
      },
      artifact: {
        artifactPath: "reports/ops/directive-workspace-v0-check.md",
        summary: "Synthetic proof in isolated temp-db check runner",
      },
    };
    const decisionReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}/decision?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evaluationId,
          decision: "adopt",
          rationale:
            "Source-adaptation v0 shape is now explicit and grounded in stored lifecycle records.",
          integrationSurface: "mission-control/directive-workspace",
          targetRuntimeSurface: "api/v1/directive-workspace",
          integrationStatus: "active",
          integrationMode: "adapt",
          owner: "operator",
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          requiredGates: [
            "npm run check:directive-v0",
            "npm run check:directive-integration-proof",
            "npm run check:ops-stack",
          ],
          rollbackPlan:
            "Set runtime status to parked and remove callable bindings while preserving decision + proof artifacts.",
          integrationProof,
          dependencyNotes: "Depends on workspace_runs and reports staying stable.",
          rollbackNotes:
            "Remove directive_* tables and API routes if the loop proves low value.",
        }),
      },
    );
    const decisionRes = await recordDecision(decisionReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(decisionRes.status, 201, "expected decision 201");
    const decisionJson = (await decisionRes.json()) as {
      integration?: { integrationSurface?: string };
    };

    const lifecycleRunReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}/lifecycle?projectId=${projectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "check-directive-workspace-v0",
          integrationProof,
        }),
      },
    );
    const lifecycleRunRes = await runLifecycle(lifecycleRunReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(lifecycleRunRes.status, 200, "expected lifecycle POST 200");
    const lifecycleRunJson = (await lifecycleRunRes.json()) as {
      lifecycle?: { verification?: { skippedBecauseDecisionExists?: boolean } };
    };

    const lifecycleReq = new Request(
      `http://localhost/api/directive-workspace/capabilities/${capabilityId}?projectId=${projectId}`,
      { method: "GET" },
    );
    const lifecycleRes = await getLifecycle(lifecycleReq, {
      params: Promise.resolve({ id: capabilityId }),
    });
    assert.equal(lifecycleRes.status, 200, "expected lifecycle GET 200");
    const lifecycleJson = (await lifecycleRes.json()) as {
      capability: {
        status?: string;
        frameworkStatus?: string;
        runtimeStatus?: string;
      };
      experiments: unknown[];
      evaluations: unknown[];
      decisions: unknown[];
      integrations: unknown[];
      decisionLeadTimeHours?: number | null;
      adoptToCallableLeadTimeHours?: number | null;
    };

    const registryReq = new Request(
      `http://localhost/api/directive-workspace/registry?projectId=${projectId}`,
      { method: "GET" },
    );
    const registryRes = await getRegistry(registryReq);
    assert.equal(registryRes.status, 200, "expected registry GET 200");
    const registryJson = (await registryRes.json()) as {
      registry?: Array<{
        decisionLeadTimeHours?: number | null;
        adoptToCallableLeadTimeHours?: number | null;
      }>;
    };

    const listReq = new Request(
      `http://localhost/api/directive-workspace/capabilities?projectId=${projectId}&status=integrated`,
      { method: "GET" },
    );
    const listRes = await listCapabilities(listReq);
    assert.equal(listRes.status, 200, "expected capability list GET 200");

    const lifecycleLeadTime = lifecycleJson.decisionLeadTimeHours;
    const registryEntries = registryJson.registry || [];
    const registryLeadTime = registryEntries[0]?.decisionLeadTimeHours;
    const lifecycleCallableLeadTime = lifecycleJson.adoptToCallableLeadTimeHours;
    const registryCallableLeadTime = registryEntries[0]?.adoptToCallableLeadTimeHours;
    const leadTimeValid =
      typeof lifecycleLeadTime === "number" &&
      lifecycleLeadTime >= 0 &&
      typeof registryLeadTime === "number" &&
      registryLeadTime >= 0;
    const callableLeadTimeValid =
      typeof lifecycleCallableLeadTime === "number" &&
      lifecycleCallableLeadTime >= 0 &&
      typeof registryCallableLeadTime === "number" &&
      registryCallableLeadTime >= 0;

    const ok =
      lifecycleJson.capability?.status === "integrated" &&
      lifecycleJson.capability?.frameworkStatus === "decided" &&
      lifecycleJson.capability?.runtimeStatus === "callable" &&
      lifecycleJson.experiments.length === 1 &&
      lifecycleJson.evaluations.length === 1 &&
      lifecycleJson.decisions.length === 1 &&
      lifecycleJson.integrations.length === 1 &&
      registryEntries.length === 1 &&
      lifecycleRunJson.lifecycle?.verification?.skippedBecauseDecisionExists === true &&
      decisionJson.integration?.integrationSurface ===
        "mission-control/directive-workspace" &&
      leadTimeValid &&
      callableLeadTimeValid;

    process.stdout.write(
      `${JSON.stringify(
        {
          ok,
          capabilityId,
          status: lifecycleJson.capability?.status || null,
          counts: {
            experiments: lifecycleJson.experiments.length,
            evaluations: lifecycleJson.evaluations.length,
            decisions: lifecycleJson.decisions.length,
            integrations: lifecycleJson.integrations.length,
            registry: registryEntries.length,
          },
          decisionLeadTimeHours: {
            lifecycle: lifecycleLeadTime ?? null,
            registry: registryLeadTime ?? null,
            valid: leadTimeValid,
          },
          adoptToCallableLeadTimeHours: {
            lifecycle: lifecycleCallableLeadTime ?? null,
            registry: registryCallableLeadTime ?? null,
            valid: callableLeadTimeValid,
          },
        },
        null,
        2,
      )}\n`,
    );

    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
