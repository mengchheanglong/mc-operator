import assert from "node:assert/strict";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3207,
      tempPrefix: "mission-control-reports-api-",
      sqliteFilename: "reports-api.sqlite",
    },
    async (ctx) => {
      const { GET, POST } = await import("../src/app/api/reports/route.ts");
      const { DELETE } = await import("../src/app/api/reports/[id]/route.ts");

      const createReq = new Request(
        "http://localhost/api/reports?projectId=mission-control",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `Backend reports API check ${new Date().toISOString()}`,
            content:
              "Verifies reports read requests are served via backend proxy route.",
            category: "maintenance",
            status: "info",
            area: "automation",
            topics: ["reports", "backend-migration"],
            metadata: {
              source: "check-reports-api-backend",
            },
          }),
        },
      );

      const createRes = await POST(createReq);
      assert.equal(createRes.status, 200, "expected report create 200");
      const createJson = (await createRes.json()) as {
        report?: { id?: string; _id?: string };
      };
      const reportId = createJson.report?.id || createJson.report?._id;
      assert.ok(reportId, "expected report id");

      const listReq = new Request(
        "http://localhost/api/reports?projectId=mission-control&limit=20",
        { method: "GET" },
      );
      const listRes = await GET(listReq);
      assert.equal(listRes.status, 200, "expected reports list 200");
      const listJson = (await listRes.json()) as Array<{ id?: string; _id?: string }>;
      assert.ok(Array.isArray(listJson), "expected reports array");
      const found = listJson.some((row) => row.id === reportId || row._id === reportId);
      assert.equal(found, true, "expected created report in reports list");

      const metaReq = new Request(
        "http://localhost/api/reports?projectId=mission-control&withMeta=1&limit=20",
        { method: "GET" },
      );
      const metaRes = await GET(metaReq);
      assert.equal(metaRes.status, 200, "expected reports withMeta 200");
      const metaJson = (await metaRes.json()) as {
        reports?: Array<{ id?: string }>;
        meta?: { total?: number; loaded?: number; hasMore?: boolean };
      };
      assert.ok(Array.isArray(metaJson.reports), "expected reports list in withMeta response");
      assert.ok(typeof metaJson.meta?.total === "number", "expected meta total");
      assert.ok(typeof metaJson.meta?.loaded === "number", "expected meta loaded");
      assert.ok(typeof metaJson.meta?.hasMore === "boolean", "expected meta hasMore");

      const dailyReq = new Request(
        "http://localhost/api/reports?projectId=mission-control&view=daily",
        { method: "GET" },
      );
      const dailyRes = await GET(dailyReq);
      assert.equal(dailyRes.status, 200, "expected daily reports 200");
      const dailyJson = (await dailyRes.json()) as {
        days?: Array<{ dayKey?: string; content?: string; entryCount?: number }>;
      };
      assert.ok(Array.isArray(dailyJson.days), "expected daily days array");
      assert.ok((dailyJson.days?.length || 0) >= 1, "expected at least one daily log");
      assert.ok(
        typeof dailyJson.days?.[0]?.dayKey === "string" &&
          typeof dailyJson.days?.[0]?.content === "string",
        "expected daily log shape",
      );

      const deleteReq = new Request(
        `http://localhost/api/reports/${reportId}?projectId=mission-control`,
        { method: "DELETE" },
      );
      const deleteRes = await DELETE(deleteReq, {
        params: Promise.resolve({ id: String(reportId) }),
      });
      assert.equal(deleteRes.status, 200, "expected report delete 200");
      const deleteJson = (await deleteRes.json()) as { msg?: string };
      assert.equal(deleteJson.msg, "Report deleted.", "expected report delete message");

      const postDeleteListReq = new Request(
        "http://localhost/api/reports?projectId=mission-control&limit=50",
        { method: "GET" },
      );
      const postDeleteListRes = await GET(postDeleteListReq);
      assert.equal(postDeleteListRes.status, 200, "expected post-delete reports list 200");
      const postDeleteListJson = (await postDeleteListRes.json()) as Array<{
        id?: string;
        _id?: string;
      }>;
      const stillExists = postDeleteListJson.some(
        (row) => row.id === reportId || row._id === reportId,
      );
      assert.equal(stillExists, false, "expected deleted report to be absent in list");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            reportId,
            counts: {
              listed: listJson.length,
              listedWithMeta: metaJson.reports?.length || 0,
              dailyLogs: dailyJson.days?.length || 0,
              listedAfterDelete: postDeleteListJson.length,
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
