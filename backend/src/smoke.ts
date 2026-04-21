import "reflect-metadata";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function run() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  await app.listen(3211, "127.0.0.1");

  try {
    const baseUrl = "http://127.0.0.1:3211/api/v1";
    const projectId = "backend-smoke";
    const sourceRef = `https://github.com/example/backend-smoke-${Date.now()}.git`;

    const health = await fetch(`${baseUrl}/health`).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));

    const automationProjectId = `backend-smoke-automation-runs-${Date.now()}`;
    const automationBranch = `manual-test-probe-${Date.now()}`;

    const automationRunCreate = await fetch(`${baseUrl}/automation/runs?projectId=${automationProjectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branch: automationBranch,
        metadata: { purpose: "backend-smoke-automation-runs" },
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(
      automationRunCreate.status,
      200,
      "automation runs create route should return 200",
    );
    const automationRunId = automationRunCreate.body?.run?.id as string | undefined;
    assert.ok(automationRunId, "automation runs create route should return run id");
    assert.equal(
      automationRunCreate.body?.run?.branch,
      automationBranch,
      "automation runs create route should return branch main",
    );

    const automationRunsBeforeClose = await fetch(
      `${baseUrl}/automation/runs?projectId=${automationProjectId}`,
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(
      automationRunsBeforeClose.status,
      200,
      "automation runs list route should return 200",
    );
    assert.ok(
      Array.isArray(automationRunsBeforeClose.body?.runs),
      "automation runs list route should return runs list",
    );
    const automationRunBeforeClose = Array.isArray(automationRunsBeforeClose.body?.runs)
      ? automationRunsBeforeClose.body.runs.find(
          (row: Record<string, unknown>) => String(row?.id || "") === automationRunId,
        )
      : null;
    assert.ok(automationRunBeforeClose, "automation runs list should include created run");

    const automationRunSummary = await fetch(
      `${baseUrl}/automation/runs/${encodeURIComponent(automationRunId)}/summary?projectId=${automationProjectId}`,
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(
      automationRunSummary.status,
      200,
      "automation runs summary route should return 200",
    );
    assert.equal(
      automationRunSummary.body?.run?.id,
      automationRunId,
      "automation runs summary should return the requested run",
    );
    assert.equal(
      automationRunSummary.body?.run?.branch,
      automationBranch,
      "automation runs summary should return the run branch",
    );
    assert.ok(
      automationRunSummary.body?.summary?.verificationArtifacts,
      "automation runs summary should return verification artifacts",
    );

    const automationRunClose = await fetch(
      `${baseUrl}/automation/runs/${encodeURIComponent(automationRunId)}/close?projectId=${automationProjectId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archive: false, reason: "manual" }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(
      automationRunClose.status,
      200,
      "automation runs close route should return 200",
    );
    assert.ok(
      ["closed", "closing_pending_cleanup"].includes(
        String(automationRunClose.body?.run?.status || ""),
      ),
      "automation runs close should return a closed-like status",
    );

    const automationRunsAfterClose = await fetch(
      `${baseUrl}/automation/runs?projectId=${automationProjectId}`,
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(
      automationRunsAfterClose.status,
      200,
      "automation runs list after close should return 200",
    );
    assert.ok(
      Array.isArray(automationRunsAfterClose.body?.runs),
      "automation runs list after close should return runs list",
    );
    const automationRunAfterClose = Array.isArray(automationRunsAfterClose.body?.runs)
      ? automationRunsAfterClose.body.runs.find(
          (row: Record<string, unknown>) => String(row?.id || "") === automationRunId,
        )
      : null;
    assert.ok(automationRunAfterClose, "automation runs list after close should include run");
    assert.ok(
      ["closed", "closing_pending_cleanup"].includes(
        String((automationRunAfterClose as Record<string, unknown> | null)?.status || ""),
      ),
      "automation runs list after close should return a closed-like status",
    );

    const create = await fetch(`${baseUrl}/directive-workspace/capabilities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        sourceType: "github-repo",
        sourceRef,
        title: "backend-smoke-candidate",
        userIntent: "validate migrated nest lifecycle endpoints",
        notes: ["backend", "smoke"],
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(create.status, 201, "create capability route should return 201");
    const capabilityId = create.body.capability?.id as string;
    assert.ok(capabilityId, "create capability should return capability id");

    const analysis = await fetch(
      `${baseUrl}/directive-workspace/capabilities/${capabilityId}/analysis`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          analysisSummary: "smoke analysis",
          recommendation: "test",
          category: "tool-pack",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(analysis.status, 200, "analysis route should return 200");

    const experiment = await fetch(
      `${baseUrl}/directive-workspace/capabilities/${capabilityId}/experiments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          hypothesis: "smoke hypothesis",
          plan: "smoke plan",
          status: "running",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(experiment.status, 201, "experiment route should return 201");
    const experimentId = experiment.body.experiment?.id as string;
    assert.ok(experimentId, "experiment route should return experiment id");

    const evaluation = await fetch(
      `${baseUrl}/directive-workspace/capabilities/${capabilityId}/evaluations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          experimentId,
          outcome: "mixed",
          evidenceSummary: "smoke evidence",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(evaluation.status, 201, "evaluation route should return 201");
    const evaluationId = evaluation.body.evaluation?.id as string;
    assert.ok(evaluationId, "evaluation route should return evaluation id");

    const decision = await fetch(
      `${baseUrl}/directive-workspace/capabilities/${capabilityId}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          evaluationId,
          decision: "reject",
          rationale: "smoke decision",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(decision.status, 201, "decision route should return 201");

    const proof = await fetch(
      `${baseUrl}/directive-workspace/capabilities/${capabilityId}/proof`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          method: "nest-smoke",
          summary: "smoke proof generation",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(proof.status, 201, "proof route should return 201");

    const reportCreate = await fetch(`${baseUrl}/reports?projectId=${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "backend-smoke-report",
        content: "backend reports mutation smoke test",
        category: "maintenance",
        status: "info",
        area: "automation",
        topics: ["backend", "smoke"],
        metadata: { source: "backend-smoke" },
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));

    assert.equal(reportCreate.status, 200, "reports create route should return 200");
    const reportId = reportCreate.body?.report?.id as string | undefined;
    assert.ok(reportId, "reports create route should return report id");

    const noteCreate = await fetch(`${baseUrl}/notes?projectId=${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "backend notes mutation smoke test",
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(noteCreate.status, 200, "notes create route should return 200");
    const noteId = noteCreate.body?.note?.id as string | undefined;
    assert.ok(noteId, "notes create route should return note id");

    const noteUpdate = await fetch(
      `${baseUrl}/notes/${encodeURIComponent(noteId)}?projectId=${projectId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(noteUpdate.status, 200, "notes update route should return 200");

    const viewCreate = await fetch(`${baseUrl}/views?projectId=${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "reports",
        name: "backend-smoke-view",
        filters: { area: "automation" },
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(viewCreate.status, 200, "views create route should return 200");
    const viewId = viewCreate.body?.view?.id as string | undefined;
    assert.ok(viewId, "views create route should return view id");

    const questCreate = await fetch(`${baseUrl}/quests?projectId=${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal: "backend smoke quest",
        difficulty: "normal",
        status: "open",
        topics: ["backend", "smoke"],
        area: "automation",
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(questCreate.status, 200, "quests create route should return 200");
    const questId = questCreate.body?.quest?.id as string | undefined;
    assert.ok(questId, "quests create route should return quest id");

    const questUpdate = await fetch(
      `${baseUrl}/quests/${encodeURIComponent(questId)}?projectId=${projectId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: "backend smoke quest",
          status: "in_progress",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(questUpdate.status, 200, "quests update route should return 200");

    const questComplete = await fetch(
      `${baseUrl}/quests/${encodeURIComponent(questId)}/complete?projectId=${projectId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verificationSummary: "backend smoke completion",
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(questComplete.status, 200, "quests complete route should return 200");

    const docCreate = await fetch(`${baseUrl}/docs?projectId=${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `backend-smoke-doc-${Date.now()}`,
        content: "backend docs mutation smoke test",
        tags: ["backend", "smoke"],
        fileType: ".md",
      }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(docCreate.status, 200, "docs create route should return 200");
    const docId = docCreate.body?.doc?.id as string | undefined;
    assert.ok(docId, "docs create route should return doc id");

    const docUpdate = await fetch(
      `${baseUrl}/docs/${encodeURIComponent(docId)}?projectId=${projectId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "backend docs mutation smoke test updated",
          tags: ["backend", "smoke", "updated"],
        }),
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(docUpdate.status, 200, "docs update route should return 200");

    const projectsBeforeActivation = await fetch(`${baseUrl}/projects`).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    assert.equal(
      projectsBeforeActivation.status,
      200,
      "projects list without query should return 200",
    );

    const projectsBeforeActivationList = Array.isArray(projectsBeforeActivation.body?.projects)
      ? (projectsBeforeActivation.body.projects as Array<Record<string, unknown>>)
      : [];
    assert.ok(
      projectsBeforeActivationList.length > 0,
      "projects list without query should include at least one project",
    );

    const firstProject = projectsBeforeActivationList[0];
    const secondProject = projectsBeforeActivationList[1];
    const targetActiveProjectId = String(
      secondProject?.id || firstProject?.id || "",
    );
    assert.ok(
      targetActiveProjectId,
      "projects list should expose at least one valid project id",
    );

    const setActiveProject = await fetch(`${baseUrl}/projects/active`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: targetActiveProjectId }),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(setActiveProject.status, 200, "projects active put route should return 200");
    assert.equal(
      String(setActiveProject.body?.activeProject?.id || ""),
      targetActiveProjectId,
      "projects active put route should return selected project",
    );

    const activeProjectResponse = await fetch(`${baseUrl}/projects/active`).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    assert.equal(activeProjectResponse.status, 200, "projects active get route should return 200");
    assert.equal(
      String(activeProjectResponse.body?.activeProject?.id || ""),
      targetActiveProjectId,
      "projects active get route should return persisted selection",
    );

    const projectsAfterActivation = await fetch(`${baseUrl}/projects`).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    assert.equal(
      projectsAfterActivation.status,
      200,
      "projects list after activation should return 200",
    );
    assert.equal(
      String(projectsAfterActivation.body?.activeProject?.id || ""),
      targetActiveProjectId,
      "projects list without query should respect persisted active project",
    );

    const [capabilities, registry, lifecycle, reports, projects, graph, notes, views, quests, docs] = await Promise.all([
      fetch(
        `${baseUrl}/directive-workspace/capabilities?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/directive-workspace/registry?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/directive-workspace/capabilities/${capabilityId}/lifecycle?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/reports?projectId=${projectId}&withMeta=1&limit=50`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/projects?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/projects/graph?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/notes?projectId=${projectId}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/views?projectId=${projectId}&surface=reports`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/quests?projectId=${projectId}&withMeta=1`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
      fetch(
        `${baseUrl}/docs?projectId=${projectId}&limit=20`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
    ]);

    assert.equal(health.status, 200, "health route should return 200");
    assert.equal(capabilities.status, 200, "capabilities route should return 200");
    assert.equal(registry.status, 200, "registry route should return 200");
    assert.equal(lifecycle.status, 200, "lifecycle route should return 200");
    assert.equal(reports.status, 200, "reports route should return 200");
    assert.equal(projects.status, 200, "projects route should return 200");
    assert.equal(graph.status, 200, "projects graph route should return 200");
    assert.equal(notes.status, 200, "notes route should return 200");
    assert.equal(views.status, 200, "views route should return 200");
    assert.equal(quests.status, 200, "quests route should return 200");
    assert.equal(docs.status, 200, "docs route should return 200");
    assert.ok(
      Array.isArray(reports.body?.reports),
      "reports route should return reports list",
    );
    assert.ok(
      Array.isArray(projects.body?.projects),
      "projects route should return projects list",
    );
    assert.ok(
      Array.isArray(graph.body?.projects),
      "projects graph route should return projects list",
    );
    assert.ok(Array.isArray(notes.body?.notes), "notes route should return notes list");
    assert.ok(Array.isArray(views.body?.views), "views route should return views list");
    assert.ok(Array.isArray(quests.body?.quests), "quests route should return quests list");
    assert.ok(Array.isArray(docs.body?.docs), "docs route should return docs list");

    const reportDelete = await fetch(
      `${baseUrl}/reports/${encodeURIComponent(reportId)}?projectId=${projectId}`,
      {
        method: "DELETE",
      },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(reportDelete.status, 200, "reports delete route should return 200");

    const reportsAfterDelete = await fetch(
      `${baseUrl}/reports?projectId=${projectId}&limit=100`,
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(reportsAfterDelete.status, 200, "reports list after delete should return 200");
    const postDeleteHasRow = Array.isArray(reportsAfterDelete.body)
      ? reportsAfterDelete.body.some(
          (row) =>
            String(row?.id || "") === reportId || String(row?._id || "") === reportId,
        )
      : false;
    assert.equal(postDeleteHasRow, false, "deleted report should not remain in list");

    const noteDelete = await fetch(
      `${baseUrl}/notes/${encodeURIComponent(noteId)}?projectId=${projectId}`,
      { method: "DELETE" },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(noteDelete.status, 200, "notes delete route should return 200");

    const viewDelete = await fetch(
      `${baseUrl}/views/${encodeURIComponent(viewId)}?projectId=${projectId}`,
      { method: "DELETE" },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(viewDelete.status, 200, "views delete route should return 200");

    const questDelete = await fetch(
      `${baseUrl}/quests/${encodeURIComponent(questId)}?projectId=${projectId}`,
      { method: "DELETE" },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(questDelete.status, 200, "quests delete route should return 200");

    const docDelete = await fetch(
      `${baseUrl}/docs/${encodeURIComponent(docId)}?projectId=${projectId}`,
      { method: "DELETE" },
    ).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(docDelete.status, 200, "docs delete route should return 200");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          healthOk: health.body.ok,
          service: health.body.service,
          capabilities: Array.isArray(capabilities.body.capabilities)
            ? capabilities.body.capabilities.length
            : 0,
          registry: Array.isArray(registry.body.registry)
            ? registry.body.registry.length
            : 0,
          reports: Array.isArray(reports.body.reports)
            ? reports.body.reports.length
            : 0,
          reportCreateStatus: reportCreate.status,
          reportDeleteStatus: reportDelete.status,
          noteCreateStatus: noteCreate.status,
          noteUpdateStatus: noteUpdate.status,
          noteDeleteStatus: noteDelete.status,
          viewCreateStatus: viewCreate.status,
          viewDeleteStatus: viewDelete.status,
          questCreateStatus: questCreate.status,
          questUpdateStatus: questUpdate.status,
          questCompleteStatus: questComplete.status,
          questDeleteStatus: questDelete.status,
          docCreateStatus: docCreate.status,
          docUpdateStatus: docUpdate.status,
          docDeleteStatus: docDelete.status,
          projects: Array.isArray(projects.body.projects)
            ? projects.body.projects.length
            : 0,
          activeProjectSetStatus: setActiveProject.status,
          activeProjectGetStatus: activeProjectResponse.status,
          activeProjectId: String(activeProjectResponse.body?.activeProject?.id || ""),
          projectGraph: Array.isArray(graph.body.projects)
            ? graph.body.projects.length
            : 0,
          quests: Array.isArray(quests.body.quests) ? quests.body.quests.length : 0,
          docs: Array.isArray(docs.body.docs) ? docs.body.docs.length : 0,
          lifecycleStatus: lifecycle.body?.capability?.status || null,
          createdCapabilityId: capabilityId,
          automationRunCreateStatus: automationRunCreate.status,
          automationRunListCount: Array.isArray(automationRunsAfterClose.body?.runs)
            ? automationRunsAfterClose.body.runs.length
            : 0,
          automationRunSummaryStatus: automationRunSummary.status,
          automationRunCloseStatus: automationRunClose.status,
          automationRunStatus:
            (automationRunAfterClose as Record<string, unknown> | null)?.status || null,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
