import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3210,
      tempPrefix: "mission-control-docs-api-",
      sqliteFilename: "docs-api.sqlite",
      setup: (tempDir) => {
        const workspaceRoot = path.join(tempDir, "workspace");
        const projectRoot = path.join(workspaceRoot, "mission-control");
        mkdirSync(path.join(projectRoot, ".openclaw", "knowledge"), { recursive: true });
        mkdirSync(path.join(tempDir, "shared-knowledge"), { recursive: true });
        return {
          OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
          OPENCLAW_SHARED_KNOWLEDGE_PATH: path.join(tempDir, "shared-knowledge"),
        };
      },
    },
    async (ctx) => {
      const docsRoute = await import("../src/app/api/docs/route.ts");
      const docsByIdRoute = await import("../src/app/api/docs/[id]/route.ts");
      const { GET: listDocs, POST: createDoc } = docsRoute;
      const { GET: getDocById, PUT: updateDoc, DELETE: deleteDoc } = docsByIdRoute;

      const docTitle = `Backend docs API check ${new Date().toISOString()}`;
      const createReq = new Request("http://localhost/api/docs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: docTitle,
          content: "Docs backend migration check content",
          tags: ["backend", "docs"],
        }),
      });

      const createRes = await createDoc(createReq);
      assert.equal(createRes.status, 200, "expected doc create 200");
      const createJson = (await createRes.json()) as {
        doc?: { id?: string; _id?: string; title?: string; links?: string[] };
      };
      const docId = String(createJson.doc?._id || createJson.doc?.id || "").trim();
      assert.ok(docId, "expected doc id");
      assert.equal(createJson.doc?.title, docTitle, "expected created doc title");
      assert.ok(Array.isArray(createJson.doc?.links), "expected links array from Next contract");

      const listRes = await listDocs(
        new Request("http://localhost/api/docs?projectId=mission-control&limit=20", {
          method: "GET",
        }),
      );
      assert.equal(listRes.status, 200, "expected docs list 200");
      const listJson = (await listRes.json()) as {
        docs?: Array<{ id?: string; _id?: string; title?: string }>;
      };
      assert.ok(Array.isArray(listJson.docs), "expected docs array");
      const foundCreated = listJson.docs?.some((row) => String(row._id || row.id || "") === docId);
      assert.equal(foundCreated, true, "expected created doc in docs list");

      const getRes = await getDocById(
        new Request(`http://localhost/api/docs/${docId}?projectId=mission-control`, {
          method: "GET",
        }),
        { params: Promise.resolve({ id: docId }) },
      );
      assert.equal(getRes.status, 200, "expected doc by id 200");
      const getJson = (await getRes.json()) as {
        doc?: { id?: string; _id?: string; title?: string; links?: string[] };
      };
      assert.equal(String(getJson.doc?._id || getJson.doc?.id || ""), docId, "expected doc id roundtrip");
      assert.ok(Array.isArray(getJson.doc?.links), "expected links on doc by id");

      const updateRes = await updateDoc(
        new Request(`http://localhost/api/docs/${docId}?projectId=mission-control`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: "Docs backend migration check content updated",
            tags: ["backend", "docs", "updated"],
          }),
        }),
        { params: Promise.resolve({ id: docId }) },
      );
      assert.equal(updateRes.status, 200, "expected doc update 200");
      const updateJson = (await updateRes.json()) as {
        doc?: { id?: string; _id?: string; content?: string; tags?: string[] };
      };
      assert.equal(
        String(updateJson.doc?._id || updateJson.doc?.id || ""),
        docId,
        "expected updated doc id",
      );
      assert.equal(
        updateJson.doc?.content,
        "Docs backend migration check content updated",
        "expected updated doc content",
      );

      const deleteRes = await deleteDoc(
        new Request(`http://localhost/api/docs/${docId}?projectId=mission-control`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: docId }) },
      );
      assert.equal(deleteRes.status, 200, "expected doc delete 200");

      const postDeleteListRes = await listDocs(
        new Request("http://localhost/api/docs?projectId=mission-control&limit=20", {
          method: "GET",
        }),
      );
      assert.equal(postDeleteListRes.status, 200, "expected docs list after delete 200");
      const postDeleteListJson = (await postDeleteListRes.json()) as {
        docs?: Array<{ id?: string; _id?: string }>;
      };
      const stillExists =
        postDeleteListJson.docs?.some((row) => String(row._id || row.id || "") === docId) || false;
      assert.equal(stillExists, false, "expected deleted doc to be absent");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            docId,
            counts: {
              listed: listJson.docs?.length || 0,
              listedAfterDelete: postDeleteListJson.docs?.length || 0,
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
