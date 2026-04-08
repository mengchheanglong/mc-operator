import assert from "node:assert/strict";
import { GET as getDocs, POST as postDocs } from "../src/app/api/docs/route.ts";
import { DELETE as deleteDoc, GET as getDocById, PUT as putDoc } from "../src/app/api/docs/[id]/route.ts";
import { GET as getQuests, POST as postQuests } from "../src/app/api/quests/route.ts";
import { DELETE as deleteQuest, PUT as putQuest } from "../src/app/api/quests/[id]/route.ts";
import { PUT as completeQuest } from "../src/app/api/quests/[id]/complete/route.ts";
import { GET as getReports, POST as postReports } from "../src/app/api/reports/route.ts";
import { DELETE as deleteReport } from "../src/app/api/reports/[id]/route.ts";
import { POST as postNotes } from "../src/app/api/notes/route.ts";
import { PUT as putNote, DELETE as deleteNote } from "../src/app/api/notes/[id]/route.ts";
import { POST as postViews } from "../src/app/api/views/route.ts";
import { DELETE as deleteView } from "../src/app/api/views/[id]/route.ts";
import { POST as postAgents } from "../src/app/api/agents/route.ts";
import { PUT as putAgent, DELETE as deleteAgent } from "../src/app/api/agents/[id]/route.ts";
import { POST as postAgentDispatch } from "../src/app/api/agents/[id]/dispatch/route.ts";
import { POST as postAutomationRunCreate } from "../src/app/api/automation/runs/create/route.ts";
import { POST as postAutomationTemplate } from "../src/app/api/automation/templates/route.ts";

type FetchLike = typeof globalThis.fetch;

async function withFetchMock<T>(mock: FetchLike, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function inspectBackendRequiredForWriteResponse(
  response: Response,
  label: string,
) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const issues: string[] = [];
  if (response.status !== 502) {
    issues.push(`expected status 502, got ${response.status}`);
  }
  if (payload.code !== "backend_required_for_write") {
    issues.push(`expected code backend_required_for_write, got ${String(payload.code)}`);
  }
  if (typeof payload.msg !== "string" || payload.msg.trim().length === 0) {
    issues.push("expected non-empty msg");
  }
  if (typeof payload.detail !== "string" || payload.detail.trim().length === 0) {
    issues.push("expected non-empty detail");
  }
  return issues.length === 0 ? null : `${label}: ${issues.join("; ")}`;
}

async function run() {
  const downFetch: FetchLike = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:3201");
  };

  const upFetch: FetchLike = async (input) => {
    const rawUrl = typeof input === "string" ? input : input.toString();
    const url = new URL(rawUrl);
    const path = url.pathname;

    if (path.endsWith("/quests")) {
      return new Response(
        JSON.stringify({
          quests: [{ id: "q1", _id: "q1", goal: "quest-1", completed: false }],
          meta: { total: 1, loaded: 1, hasMore: false },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (path.endsWith("/docs")) {
      return new Response(
        JSON.stringify({
          docs: [{ id: "d1", title: "doc-1", content: "# doc", fileType: ".md", createdAt: "2026-03-18T00:00:00.000Z", updatedAt: "2026-03-18T00:00:00.000Z", tags: ["ops"] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (path.endsWith("/reports")) {
      if (url.searchParams.get("view") === "daily") {
        return new Response(
          JSON.stringify({ days: [{ dayKey: "2026-03-18", title: "Daily", content: "ok", entryCount: 1, areas: [], topics: [], categories: [], latestDate: "2026-03-18T00:00:00.000Z" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify([{ id: "r1", _id: "r1", title: "report-1", content: "ok" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ msg: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await withFetchMock(downFetch, async () => {
    const writeFailures: string[] = [];

    const questsRead = await getQuests(new Request("http://localhost/api/quests?withMeta=1&limit=5"));
    assert.equal(questsRead.status, 200, "quests GET should fallback locally when backend is down");
    const questsPayload = (await questsRead.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(questsPayload.quests), "quests fallback should return quests[]");
    assert.ok(typeof questsPayload.meta === "object" && questsPayload.meta !== null, "quests fallback should return meta");

    const docsRead = await getDocs(new Request("http://localhost/api/docs?limit=5"));
    assert.equal(docsRead.status, 200, "docs GET should fallback locally when backend is down");
    const docsPayload = (await docsRead.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(docsPayload.docs), "docs fallback should return docs[]");

    const reportsRead = await getReports(new Request("http://localhost/api/reports?view=daily"));
    assert.equal(reportsRead.status, 200, "reports GET should fallback locally when backend is down");
    const reportsPayload = (await reportsRead.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(reportsPayload.days), "reports fallback should return days[] for view=daily");

    const questsWrite = await postQuests(
      jsonRequest("http://localhost/api/quests", "POST", { goal: "q", difficulty: "normal" }),
    );
    const questsPostIssue = await inspectBackendRequiredForWriteResponse(questsWrite, "quests POST");
    if (questsPostIssue) writeFailures.push(questsPostIssue);

    const questsUpdate = await putQuest(
      jsonRequest("http://localhost/api/quests/q1", "PUT", {
        goal: "q",
        difficulty: "normal",
        status: "open",
      }),
      { params: Promise.resolve({ id: "q1" }) },
    );
    const questsPutIssue = await inspectBackendRequiredForWriteResponse(questsUpdate, "quests PUT");
    if (questsPutIssue) writeFailures.push(questsPutIssue);

    const questsComplete = await completeQuest(
      jsonRequest("http://localhost/api/quests/q1/complete", "PUT", {
        verificationSummary: "verified",
      }),
      { params: Promise.resolve({ id: "q1" }) },
    );
    const questsCompleteIssue = await inspectBackendRequiredForWriteResponse(questsComplete, "quests complete PUT");
    if (questsCompleteIssue) writeFailures.push(questsCompleteIssue);

    const questsDelete = await deleteQuest(
      new Request("http://localhost/api/quests/q1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "q1" }) },
    );
    const questsDeleteIssue = await inspectBackendRequiredForWriteResponse(questsDelete, "quests DELETE");
    if (questsDeleteIssue) writeFailures.push(questsDeleteIssue);

    const docsWrite = await postDocs(
      jsonRequest("http://localhost/api/docs", "POST", { title: "d", content: "body", tags: ["ops"] }),
    );
    const docsPostIssue = await inspectBackendRequiredForWriteResponse(docsWrite, "docs POST");
    if (docsPostIssue) writeFailures.push(docsPostIssue);

    const docsUpdate = await putDoc(
      jsonRequest("http://localhost/api/docs/d1", "PUT", {
        title: "doc",
        content: "body",
        tags: ["ops"],
      }),
      { params: Promise.resolve({ id: "d1" }) },
    );
    const docsPutIssue = await inspectBackendRequiredForWriteResponse(docsUpdate, "docs PUT");
    if (docsPutIssue) writeFailures.push(docsPutIssue);

    const docsDelete = await deleteDoc(
      new Request("http://localhost/api/docs/d1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "d1" }) },
    );
    const docsDeleteIssue = await inspectBackendRequiredForWriteResponse(docsDelete, "docs DELETE");
    if (docsDeleteIssue) writeFailures.push(docsDeleteIssue);

    const reportsWrite = await postReports(
      jsonRequest("http://localhost/api/reports", "POST", { title: "r", content: "body" }),
    );
    const reportsPostIssue = await inspectBackendRequiredForWriteResponse(reportsWrite, "reports POST");
    if (reportsPostIssue) writeFailures.push(reportsPostIssue);

    const reportsDelete = await deleteReport(
      new Request("http://localhost/api/reports/r1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    const reportsDeleteIssue = await inspectBackendRequiredForWriteResponse(reportsDelete, "reports DELETE");
    if (reportsDeleteIssue) writeFailures.push(reportsDeleteIssue);

    // --- Notes write fail-fast ---
    const notesWrite = await postNotes(
      jsonRequest("http://localhost/api/notes", "POST", { content: "test note" }),
    );
    const notesPostIssue = await inspectBackendRequiredForWriteResponse(notesWrite, "notes POST");
    if (notesPostIssue) writeFailures.push(notesPostIssue);

    const notesUpdate = await putNote(
      jsonRequest("http://localhost/api/notes/n1", "PUT", { content: "updated" }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    const notesPutIssue = await inspectBackendRequiredForWriteResponse(notesUpdate, "notes PUT");
    if (notesPutIssue) writeFailures.push(notesPutIssue);

    const notesDelete = await deleteNote(
      new Request("http://localhost/api/notes/n1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    const notesDeleteIssue = await inspectBackendRequiredForWriteResponse(notesDelete, "notes DELETE");
    if (notesDeleteIssue) writeFailures.push(notesDeleteIssue);

    // --- Views write fail-fast ---
    const viewsWrite = await postViews(
      jsonRequest("http://localhost/api/views", "POST", { surface: "reports", name: "test", filters: {} }),
    );
    const viewsPostIssue = await inspectBackendRequiredForWriteResponse(viewsWrite, "views POST");
    if (viewsPostIssue) writeFailures.push(viewsPostIssue);

    const viewsDelete = await deleteView(
      new Request("http://localhost/api/views/v1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "v1" }) },
    );
    const viewsDeleteIssue = await inspectBackendRequiredForWriteResponse(viewsDelete, "views DELETE");
    if (viewsDeleteIssue) writeFailures.push(viewsDeleteIssue);

    // --- Agents write fail-fast ---
    const agentsWrite = await postAgents(
      jsonRequest("http://localhost/api/agents", "POST", { name: "test-agent" }),
    );
    const agentsPostIssue = await inspectBackendRequiredForWriteResponse(agentsWrite, "agents POST");
    if (agentsPostIssue) writeFailures.push(agentsPostIssue);

    const agentsPut = await putAgent(
      jsonRequest("http://localhost/api/agents/a1", "PUT", { name: "updated" }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    const agentsPutIssue = await inspectBackendRequiredForWriteResponse(agentsPut, "agents PUT");
    if (agentsPutIssue) writeFailures.push(agentsPutIssue);

    const agentsDelete = await deleteAgent(
      new Request("http://localhost/api/agents/a1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    const agentsDeleteIssue = await inspectBackendRequiredForWriteResponse(agentsDelete, "agents DELETE");
    if (agentsDeleteIssue) writeFailures.push(agentsDeleteIssue);

    const agentDispatch = await postAgentDispatch(
      jsonRequest("http://localhost/api/agents/a1/dispatch", "POST", {}),
      { params: Promise.resolve({ id: "a1" }) },
    );
    const agentDispatchIssue = await inspectBackendRequiredForWriteResponse(agentDispatch, "agents dispatch POST");
    if (agentDispatchIssue) writeFailures.push(agentDispatchIssue);

    // --- Automation write fail-fast ---
    const automationRunCreate = await postAutomationRunCreate(
      jsonRequest("http://localhost/api/automation/runs/create", "POST", { templateId: "t1" }),
    );
    const automationRunCreateIssue = await inspectBackendRequiredForWriteResponse(automationRunCreate, "automation runs create POST");
    if (automationRunCreateIssue) writeFailures.push(automationRunCreateIssue);

    const automationTemplateCreate = await postAutomationTemplate(
      jsonRequest("http://localhost/api/automation/templates", "POST", { name: "test" }),
    );
    const automationTemplateCreateIssue = await inspectBackendRequiredForWriteResponse(automationTemplateCreate, "automation templates POST");
    if (automationTemplateCreateIssue) writeFailures.push(automationTemplateCreateIssue);

    assert.equal(writeFailures.length, 0, writeFailures.join("\n"));
  });

  await withFetchMock(upFetch, async () => {
    const quests = await getQuests(new Request("http://localhost/api/quests?withMeta=1"));
    assert.equal(quests.status, 200, "quests GET should pass through when backend is up");
    const questsPayload = (await quests.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(questsPayload.quests), "quests passthrough contract should keep quests[] payload");

    const docs = await getDocs(new Request("http://localhost/api/docs"));
    assert.equal(docs.status, 200, "docs GET should pass through when backend is up");
    const docsPayload = (await docs.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(docsPayload.docs), "docs passthrough contract should keep docs[] payload");

    const reports = await getReports(new Request("http://localhost/api/reports?view=daily"));
    assert.equal(reports.status, 200, "reports GET should pass through when backend is up");
    const reportsPayload = (await reports.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(reportsPayload.days), "reports passthrough contract should keep days[] payload");
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        checks: [
          "fallback-read-quests-docs-reports",
          "write-fails-fast-with-backend_required_for_write",
          "write-fails-fast-notes-views-agents-automation",
          "passthrough-when-backend-up",
        ],
      },
      null,
      2,
    )}\n`,
  );
}

run().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        error: String(error instanceof Error ? error.message : error),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
