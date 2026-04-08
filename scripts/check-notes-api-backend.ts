import assert from "node:assert/strict";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3208,
      tempPrefix: "mission-control-notes-api-",
      sqliteFilename: "notes-api.sqlite",
    },
    async (ctx) => {
      const { GET, POST } = await import("../src/app/api/notes/route.ts");
      const { PUT, DELETE } = await import("../src/app/api/notes/[id]/route.ts");

      const createdContent = `Backend notes API check ${new Date().toISOString()}`;
      const createReq = new Request(
        "http://localhost/api/notes?projectId=mission-control",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: createdContent,
          }),
        },
      );

      const createRes = await POST(createReq);
      assert.equal(createRes.status, 200, "expected note create 200");
      const createJson = (await createRes.json()) as {
        note?: { id?: string; content?: string; completed?: boolean };
      };
      const noteId = createJson.note?.id;
      assert.ok(noteId, "expected note id");
      assert.equal(createJson.note?.content, createdContent, "expected created note content");
      assert.equal(createJson.note?.completed, false, "expected created note completed false");

      const listReq = new Request(
        "http://localhost/api/notes?projectId=mission-control",
        { method: "GET" },
      );
      const listRes = await GET(listReq);
      assert.equal(listRes.status, 200, "expected notes list 200");
      const listJson = (await listRes.json()) as { notes?: Array<{ id?: string }> };
      assert.ok(Array.isArray(listJson.notes), "expected notes array");
      const foundCreated = listJson.notes?.some((row) => row.id === noteId) || false;
      assert.equal(foundCreated, true, "expected created note in notes list");

      const updateReq = new Request(
        `http://localhost/api/notes/${noteId}?projectId=mission-control`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: `${createdContent} updated`,
            completed: true,
          }),
        },
      );
      const updateRes = await PUT(updateReq, {
        params: Promise.resolve({ id: String(noteId) }),
      });
      assert.equal(updateRes.status, 200, "expected note update 200");
      const updateJson = (await updateRes.json()) as {
        note?: { id?: string; content?: string; completed?: boolean };
      };
      assert.equal(updateJson.note?.id, noteId, "expected updated note id");
      assert.equal(
        updateJson.note?.content,
        `${createdContent} updated`,
        "expected updated note content",
      );
      assert.equal(updateJson.note?.completed, true, "expected updated note completed true");

      const postUpdateListRes = await GET(
        new Request("http://localhost/api/notes?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(postUpdateListRes.status, 200, "expected notes list after update 200");
      const postUpdateListJson = (await postUpdateListRes.json()) as {
        notes?: Array<{ id?: string; content?: string; completed?: boolean }>;
      };
      const updatedRow = postUpdateListJson.notes?.find((row) => row.id === noteId);
      assert.ok(updatedRow, "expected updated note to remain in list");
      assert.equal(
        updatedRow?.content,
        `${createdContent} updated`,
        "expected updated note content in list",
      );
      assert.equal(updatedRow?.completed, true, "expected updated note completed in list");

      const deleteReq = new Request(
        `http://localhost/api/notes/${noteId}?projectId=mission-control`,
        { method: "DELETE" },
      );
      const deleteRes = await DELETE(deleteReq, {
        params: Promise.resolve({ id: String(noteId) }),
      });
      assert.equal(deleteRes.status, 200, "expected note delete 200");
      const deleteJson = (await deleteRes.json()) as { msg?: string };
      assert.equal(deleteJson.msg, "Note deleted.", "expected note delete message");

      const postDeleteListRes = await GET(
        new Request("http://localhost/api/notes?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(postDeleteListRes.status, 200, "expected notes list after delete 200");
      const postDeleteListJson = (await postDeleteListRes.json()) as {
        notes?: Array<{ id?: string }>;
      };
      const stillExists = postDeleteListJson.notes?.some((row) => row.id === noteId) || false;
      assert.equal(stillExists, false, "expected deleted note to be absent in list");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            noteId,
            counts: {
              listed: listJson.notes?.length || 0,
              listedAfterUpdate: postUpdateListJson.notes?.length || 0,
              listedAfterDelete: postDeleteListJson.notes?.length || 0,
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
