import assert from "node:assert/strict";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3208,
      tempPrefix: "mission-control-quests-api-",
      sqliteFilename: "quests-api.sqlite",
    },
    async (ctx) => {
      const { GET, POST } = await import("../src/app/api/quests/route.ts");
      const { PUT: putQuest, DELETE: deleteQuest } = await import("../src/app/api/quests/[id]/route.ts");
      const { PUT: toggleQuest } = await import("../src/app/api/quests/[id]/complete/route.ts");

      const createdGoal = `Backend quests API check ${new Date().toISOString()}`;
      const createReq = new Request(
        "http://localhost/api/quests?projectId=mission-control",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: createdGoal,
            difficulty: "normal",
            status: "open",
            topics: ["backend", "migration"],
            area: "automation",
          }),
        },
      );
      const createRes = await POST(createReq);
      assert.equal(createRes.status, 200, "expected quest create 200");
      const createJson = (await createRes.json()) as {
        quest?: { id?: string; _id?: string; status?: string; completed?: boolean };
      };
      const questId = String(createJson.quest?._id || createJson.quest?.id || "").trim();
      assert.ok(questId, "expected quest id");
      assert.equal(createJson.quest?.status, "open", "expected created quest status open");
      assert.equal(createJson.quest?.completed, false, "expected created quest completed false");

      const listReq = new Request(
        "http://localhost/api/quests?projectId=mission-control&withMeta=1&completed=false&limit=10&skip=0",
        { method: "GET" },
      );
      const listRes = await GET(listReq);
      assert.equal(listRes.status, 200, "expected quests list 200");
      const listJson = (await listRes.json()) as {
        quests?: Array<{ id?: string; _id?: string; status?: string }>;
        meta?: { statusCounts?: Record<string, number> };
      };
      assert.ok(Array.isArray(listJson.quests), "expected quests array");
      assert.ok(listJson.meta?.statusCounts, "expected statusCounts");
      const foundCreated = listJson.quests?.some(
        (row) => String(row._id || row.id || "") === questId,
      ) || false;
      assert.equal(foundCreated, true, "expected created quest in list");

      const updateReq = new Request(
        `http://localhost/api/quests/${questId}?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: createdGoal,
            status: "in_progress",
            difficulty: "hard",
            area: "automation",
            topics: ["backend", "quests"],
          }),
        },
      );
      const updateRes = await putQuest(updateReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(updateRes.status, 200, "expected quest update 200");
      const updateJson = (await updateRes.json()) as {
        quest?: { status?: string };
        transition?: { from?: string; to?: string };
      };
      assert.equal(updateJson.quest?.status, "in_progress", "expected in_progress status");
      assert.equal(updateJson.transition?.from, "open", "expected transition from open");
      assert.equal(updateJson.transition?.to, "in_progress", "expected transition to in_progress");

      const doneWithoutEvidenceReq = new Request(
        `http://localhost/api/quests/${questId}?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: createdGoal,
            status: "done",
          }),
        },
      );
      const doneWithoutEvidenceRes = await putQuest(doneWithoutEvidenceReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(
        doneWithoutEvidenceRes.status,
        400,
        "expected done transition without evidence to fail",
      );

      const completeWithoutEvidenceReq = new Request(
        `http://localhost/api/quests/${questId}/complete?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const completeWithoutEvidenceRes = await toggleQuest(completeWithoutEvidenceReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(
        completeWithoutEvidenceRes.status,
        400,
        "expected complete without evidence to fail",
      );

      const completeWithEvidenceReq = new Request(
        `http://localhost/api/quests/${questId}/complete?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            verificationSummary: "Validated with backend quests migration check.",
          }),
        },
      );
      const completeWithEvidenceRes = await toggleQuest(completeWithEvidenceReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(completeWithEvidenceRes.status, 200, "expected quest complete 200");
      const completeWithEvidenceJson = (await completeWithEvidenceRes.json()) as {
        quest?: { status?: string; completed?: boolean };
      };
      assert.equal(completeWithEvidenceJson.quest?.status, "done", "expected done status");
      assert.equal(completeWithEvidenceJson.quest?.completed, true, "expected completed true");

      const reopenReq = new Request(
        `http://localhost/api/quests/${questId}/complete?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const reopenRes = await toggleQuest(reopenReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(reopenRes.status, 200, "expected quest reopen 200");
      const reopenJson = (await reopenRes.json()) as {
        quest?: { status?: string; completed?: boolean };
      };
      assert.equal(reopenJson.quest?.status, "open", "expected reopened status open");
      assert.equal(reopenJson.quest?.completed, false, "expected reopened completed false");

      const invalidTransitionReq = new Request(
        `http://localhost/api/quests/${questId}?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: createdGoal,
            status: "done",
            verificationSummary: "Done with evidence.",
          }),
        },
      );
      const doneRes = await putQuest(invalidTransitionReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(doneRes.status, 200, "expected open -> done transition with evidence 200");

      const blockedFromDoneReq = new Request(
        `http://localhost/api/quests/${questId}?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: createdGoal,
            status: "blocked",
          }),
        },
      );
      const blockedFromDoneRes = await putQuest(blockedFromDoneReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(
        blockedFromDoneRes.status,
        409,
        "expected done -> blocked transition to fail",
      );

      const deleteReq = new Request(
        `http://localhost/api/quests/${questId}?projectId=mission-control`,
        { method: "DELETE" },
      );
      const deleteRes = await deleteQuest(deleteReq, {
        params: Promise.resolve({ id: questId }),
      });
      assert.equal(deleteRes.status, 200, "expected quest delete 200");
      const deleteJson = (await deleteRes.json()) as { msg?: string };
      assert.equal(deleteJson.msg, "Quest deleted.", "expected delete message");

      const postDeleteListRes = await GET(
        new Request("http://localhost/api/quests?projectId=mission-control&withMeta=1", {
          method: "GET",
        }),
      );
      assert.equal(postDeleteListRes.status, 200, "expected quests list after delete 200");
      const postDeleteListJson = (await postDeleteListRes.json()) as {
        quests?: Array<{ id?: string; _id?: string }>;
      };
      const stillExists = postDeleteListJson.quests?.some(
        (row) => String(row._id || row.id || "") === questId,
      ) || false;
      assert.equal(stillExists, false, "expected deleted quest to be absent");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            questId,
            counts: {
              listed: listJson.quests?.length || 0,
              listedAfterDelete: postDeleteListJson.quests?.length || 0,
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
