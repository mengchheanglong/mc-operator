import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const serverPath = path.resolve(standaloneHostRoot, "server.ts");
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
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
    serverPath,
    cliPath,
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
    issues.push(...missingPaths.map((filePath) => `missing standalone API host asset: ${filePath}`));
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-api-host-check-"));
  const runtimeDirectiveRoot = path.resolve(tempRoot, "directive-runtime");

  const { startStandaloneHostServer } = await import(
    pathToFileURL(serverPath).href
  );
  const request = JSON.parse(
    fs.readFileSync(queueOnlyExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const engineRequest = {
    ...request,
    candidate_id: "dw-example-api-engine",
    candidate_name: "Example API Engine Discovery Candidate",
    mission_alignment:
      "Improve host-facing discovery routing traceability through the standalone-host Engine path.",
  };
  const forgeFollowUpRequest = JSON.parse(
    fs.readFileSync(forgeFollowUpExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgeRecordRequest = JSON.parse(
    fs.readFileSync(forgeRecordExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgeProofRequest = JSON.parse(
    fs.readFileSync(forgeProofExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgeTransformationProofRequest = JSON.parse(
    fs.readFileSync(forgeTransformationProofExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgeTransformationRecordRequest = JSON.parse(
    fs.readFileSync(forgeTransformationRecordExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgePromotionRequest = JSON.parse(
    fs.readFileSync(forgePromotionExamplePath, "utf8"),
  ) as Record<string, unknown>;
  const forgeRegistryRequest = JSON.parse(
    fs.readFileSync(forgeRegistryExamplePath, "utf8"),
  ) as Record<string, unknown>;

    const handle = await startStandaloneHostServer({
      directiveRoot: runtimeDirectiveRoot,
      host: "127.0.0.1",
      port: 0,
      receivedAt: "2026-03-23",
  });

  try {
    const healthResponse = await fetch(`${handle.origin}/health`);
    const healthJson = await healthResponse.json() as Record<string, unknown>;
    const runtimeStatusResponse = await fetch(`${handle.origin}/api/runtime/status`);
    const runtimeStatusJson = await runtimeStatusResponse.json() as Record<string, unknown>;

    const submitResponse = await fetch(
      `${handle.origin}/api/discovery/submissions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
    const submitJson = await submitResponse.json() as Record<string, unknown>;

    const engineSubmitResponse = await fetch(
      `${handle.origin}/api/discovery/submissions?process_with_engine=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(engineRequest),
      },
    );
    const engineSubmitJson = await engineSubmitResponse.json() as Record<
      string,
      unknown
    >;
    const engine = engineSubmitJson.engine as Record<string, unknown> | undefined;
    const engineRecord = engine?.record as Record<string, unknown> | undefined;
    const engineRecordPath =
      typeof engine?.path === "string" ? engine.path : null;
    const engineReportPath =
      typeof engine?.reportPath === "string" ? engine.reportPath : null;
    const engineRecordWritten =
      typeof engineRecordPath === "string" && fs.existsSync(engineRecordPath);
    const engineReportWritten =
      typeof engineReportPath === "string" && fs.existsSync(engineReportPath);
    const engineReportIncludesUsefulnessRationale =
      typeof engineReportPath === "string"
      && fs.existsSync(engineReportPath)
      && fs.readFileSync(engineReportPath, "utf8").includes("## Usefulness Rationale");

    const overviewResponse = await fetch(
      `${handle.origin}/api/discovery/overview?max_entries=4`,
    );
    const overviewJson = await overviewResponse.json() as Record<string, unknown>;
    const forgeFollowUpResponse = await fetch(
      `${handle.origin}/api/forge/follow-ups`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeFollowUpRequest),
      },
    );
    const forgeFollowUpJson = await forgeFollowUpResponse.json() as Record<
      string,
      unknown
    >;
    const forgeRecordResponse = await fetch(
      `${handle.origin}/api/forge/records`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeRecordRequest),
      },
    );
    const forgeRecordJson = await forgeRecordResponse.json() as Record<string, unknown>;
    const forgeProofResponse = await fetch(
      `${handle.origin}/api/forge/proof-bundles`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeProofRequest),
      },
    );
    const forgeProofJson = await forgeProofResponse.json() as Record<string, unknown>;
    const forgeTransformationProofResponse = await fetch(
      `${handle.origin}/api/forge/transformation-proofs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeTransformationProofRequest),
      },
    );
    const forgeTransformationProofJson =
      await forgeTransformationProofResponse.json() as Record<
        string,
        unknown
      >;
    const forgeTransformationRecordResponse = await fetch(
      `${handle.origin}/api/forge/transformation-records`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeTransformationRecordRequest),
      },
    );
    const forgeTransformationRecordJson =
      await forgeTransformationRecordResponse.json() as Record<
        string,
        unknown
      >;
    const forgePromotionResponse = await fetch(
      `${handle.origin}/api/forge/promotion-records`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgePromotionRequest),
      },
    );
    const forgePromotionJson = await forgePromotionResponse.json() as Record<
      string,
      unknown
    >;
    const forgeRegistryResponse = await fetch(
      `${handle.origin}/api/forge/registry-entries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(forgeRegistryRequest),
      },
    );
    const forgeRegistryJson = await forgeRegistryResponse.json() as Record<
      string,
      unknown
    >;
    const forgeOverviewResponse = await fetch(
      `${handle.origin}/api/forge/overview?max_entries=7`,
    );
    const forgeOverviewJson = await forgeOverviewResponse.json() as Record<
      string,
      unknown
    >;

    if (healthResponse.status !== 200 || healthJson.ok !== true) {
      issues.push("standalone API host health endpoint must return ok=true");
    }
    if (
      healthResponse.status === 200
      && healthJson.runtime_artifacts_root !== handle.runtimeArtifactsRoot
    ) {
      issues.push("standalone API host health endpoint must expose the runtime artifacts root");
    }
    if (
      runtimeStatusResponse.status !== 200
      || runtimeStatusJson.ok !== true
      || (runtimeStatusJson.runtime as Record<string, unknown> | undefined)?.lifecycle !== "running"
    ) {
      issues.push("standalone API host runtime status endpoint must return a running lifecycle");
    }
    if (
      submitResponse.status !== 200
      || submitJson.status !== "pending"
      || submitJson.record_shape !== "queue_only"
    ) {
      issues.push("standalone API host submission endpoint must create a pending queue_only entry");
    }
    if (
      engineSubmitResponse.status !== 200
      || engineSubmitJson.ok !== true
      || engine?.ok !== true
      || engine?.processed !== true
    ) {
      issues.push("standalone API host engine-backed submission must process the source through the Engine");
    }
    if (
      typeof engine?.path !== "string"
      || typeof engine?.reportPath !== "string"
      || !engineRecordWritten
      || !engineReportWritten
    ) {
      issues.push("standalone API host engine-backed submission must persist Engine run artifacts");
    }
    const analysis = engineRecord?.analysis as Record<string, unknown> | undefined;
    const reportPlan = engineRecord?.reportPlan as Record<string, unknown> | undefined;
    if (
      !engineRecord
      || typeof engineRecord.runId !== "string"
      || typeof analysis?.usefulnessRationale !== "string"
      || typeof reportPlan?.usefulnessRationale !== "string"
    ) {
      issues.push("standalone API host engine-backed submission must return the full DirectiveEngineRunRecord with usefulness rationale");
    }
    if (!engineReportIncludesUsefulnessRationale) {
      issues.push("standalone API host Engine run report must include the usefulness rationale section");
    }

    const overview = overviewJson.overview as Record<string, unknown> | undefined;
    const totalEntries = Number(overview?.totalEntries ?? 0);
    const recentEntries = Array.isArray(overview?.recentEntries)
      ? overview.recentEntries
      : [];
    if (overviewResponse.status !== 200 || overviewJson.ok !== true) {
      issues.push("standalone API host overview endpoint must return ok=true");
    }
    if (totalEntries < 1 || recentEntries.length < 1) {
      issues.push("standalone API host overview must report the submitted queue entry");
    }

    if (
      forgeFollowUpResponse.status !== 200
      || forgeFollowUpJson.ok !== true
      || typeof forgeFollowUpJson.path !== "string"
    ) {
      issues.push("standalone API host Forge follow-up endpoint must write a follow-up artifact");
    }
    if (
      forgeRecordResponse.status !== 200
      || forgeRecordJson.ok !== true
      || typeof forgeRecordJson.path !== "string"
    ) {
      issues.push("standalone API host Forge record endpoint must write a Forge record artifact");
    }
    if (
      forgeProofResponse.status !== 200
      || forgeProofJson.ok !== true
      || typeof forgeProofJson.path !== "string"
      || typeof forgeProofJson.gateSnapshotPath !== "string"
    ) {
      issues.push("standalone API host Forge proof endpoint must write a Forge proof checklist and gate snapshot");
    }
    if (
      forgeTransformationProofResponse.status !== 200
      || forgeTransformationProofJson.ok !== true
      || typeof forgeTransformationProofJson.path !== "string"
    ) {
      issues.push("standalone API host Forge transformation proof endpoint must write a transformation proof artifact");
    }
    if (
      forgeTransformationRecordResponse.status !== 200
      || forgeTransformationRecordJson.ok !== true
      || typeof forgeTransformationRecordJson.path !== "string"
    ) {
      issues.push("standalone API host Forge transformation record endpoint must write a transformation record artifact");
    }
    if (
      forgePromotionResponse.status !== 200
      || forgePromotionJson.ok !== true
      || typeof forgePromotionJson.path !== "string"
    ) {
      issues.push("standalone API host Forge promotion endpoint must write a Forge promotion record artifact");
    }
    if (
      forgeRegistryResponse.status !== 200
      || forgeRegistryJson.ok !== true
      || typeof forgeRegistryJson.path !== "string"
    ) {
      issues.push("standalone API host Forge registry endpoint must write a Forge registry entry artifact");
    }

    const forgeOverview = forgeOverviewJson.overview as Record<string, unknown> | undefined;
    const followUpCount = Number(forgeOverview?.followUpCount ?? 0);
    const recordCount = Number(forgeOverview?.recordCount ?? 0);
    const proofBundleCount = Number(forgeOverview?.proofBundleCount ?? 0);
    const transformationProofCount = Number(forgeOverview?.transformationProofCount ?? 0);
    const transformationRecordCount = Number(forgeOverview?.transformationRecordCount ?? 0);
    const promotionRecordCount = Number(forgeOverview?.promotionRecordCount ?? 0);
    const registryEntryCount = Number(forgeOverview?.registryEntryCount ?? 0);
    const forgeRecentEntries = Array.isArray(forgeOverview?.recentEntries)
      ? forgeOverview.recentEntries
      : [];
    if (forgeOverviewResponse.status !== 200 || forgeOverviewJson.ok !== true) {
      issues.push("standalone API host Forge overview endpoint must return ok=true");
    }
    if (
      followUpCount < 1
      || recordCount < 1
      || proofBundleCount < 1
      || transformationProofCount < 1
      || transformationRecordCount < 1
      || promotionRecordCount < 1
      || registryEntryCount < 1
      || forgeRecentEntries.length < 7
    ) {
      issues.push("standalone API host Forge overview must report the written follow-up, record, proof, transformation proof, transformation record, promotion, and registry artifacts");
    }
  } finally {
    await handle.close();
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
