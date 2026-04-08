import assert from "node:assert/strict";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3209,
      tempPrefix: "mission-control-views-api-",
      sqliteFilename: "views-api.sqlite",
    },
    async (ctx) => {
      const { GET, POST } = await import("../src/app/api/views/route.ts");
      const { DELETE } = await import("../src/app/api/views/[id]/route.ts");

      const viewName = `views-backend-check-${new Date().toISOString()}`;
      const createReq = new Request(
        "http://localhost/api/views?projectId=mission-control",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            surface: "reports",
            name: viewName,
            filters: {
              status: "info",
              area: "automation",
            },
          }),
        },
      );

      const createRes = await POST(createReq);
      assert.equal(createRes.status, 200, "expected saved view create 200");
      const createJson = (await createRes.json()) as {
        view?: { id?: string; name?: string; surface?: string };
        msg?: string;
      };
      assert.equal(createJson.msg, "Saved view created.", "expected create message");
      const viewId = createJson.view?.id;
      assert.ok(viewId, "expected saved view id");

      const listReq = new Request(
        "http://localhost/api/views?projectId=mission-control&surface=reports",
        { method: "GET" },
      );
      const listRes = await GET(listReq);
      assert.equal(listRes.status, 200, "expected saved views list 200");
      const listJson = (await listRes.json()) as {
        views?: Array<{ id?: string; name?: string; surface?: string }>;
      };
      assert.ok(Array.isArray(listJson.views), "expected views array");
      const created = listJson.views?.find((row) => row.id === viewId);
      assert.ok(created, "expected created saved view in list");
      assert.equal(created?.surface, "reports", "expected reports surface");

      const deleteReq = new Request(
        `http://localhost/api/views/${viewId}?projectId=mission-control`,
        { method: "DELETE" },
      );
      const deleteRes = await DELETE(deleteReq, {
        params: Promise.resolve({ id: String(viewId) }),
      });
      assert.equal(deleteRes.status, 200, "expected saved view delete 200");
      const deleteJson = (await deleteRes.json()) as { msg?: string };
      assert.equal(deleteJson.msg, "Saved view deleted.", "expected delete message");

      const postDeleteListRes = await GET(listReq);
      assert.equal(postDeleteListRes.status, 200, "expected saved views list after delete 200");
      const postDeleteListJson = (await postDeleteListRes.json()) as {
        views?: Array<{ id?: string }>;
      };
      const stillExists = postDeleteListJson.views?.some((row) => row.id === viewId) ?? false;
      assert.equal(stillExists, false, "expected deleted saved view to be absent");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            viewId,
            counts: {
              listed: listJson.views?.length || 0,
              listedAfterDelete: postDeleteListJson.views?.length || 0,
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
