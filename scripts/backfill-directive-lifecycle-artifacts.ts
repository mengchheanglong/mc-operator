import { eq } from "drizzle-orm";
import { buildDirectiveLifecycleArtifacts, isDirectiveLifecycleArtifacts } from "@/lib/directive-workspace/lifecycle-artifacts";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { directiveCapabilities, directiveEvaluations } from "@/server/sqlite/schema";

type EvalRow = {
  id: string;
  capabilityId: string;
  evidenceSummary: string;
  metadataJson: string;
};

type CapabilityRow = {
  id: string;
  sourceRef: string;
};

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date().toISOString();

  const capabilityRows = db
    .select({
      id: directiveCapabilities.id,
      sourceRef: directiveCapabilities.sourceRef,
    })
    .from(directiveCapabilities)
    .all() as CapabilityRow[];
  const sourceRefByCapabilityId = new Map(
    capabilityRows.map((row) => [row.id, row.sourceRef]),
  );

  const evaluationRows = db
    .select({
      id: directiveEvaluations.id,
      capabilityId: directiveEvaluations.capabilityId,
      evidenceSummary: directiveEvaluations.evidenceSummary,
      metadataJson: directiveEvaluations.metadataJson,
    })
    .from(directiveEvaluations)
    .all() as EvalRow[];

  const updates: Array<{
    evaluationId: string;
    capabilityId: string;
    sourceRef: string;
  }> = [];
  const skippedMissingSourceRef: string[] = [];
  const alreadyStrict: string[] = [];

  for (const row of evaluationRows) {
    const sourceRef = String(sourceRefByCapabilityId.get(row.capabilityId) || "").trim();
    if (!sourceRef) {
      skippedMissingSourceRef.push(row.id);
      continue;
    }

    const metadata = parseJsonField<Record<string, unknown>>(row.metadataJson);
    const version = Number((metadata || {}).lifecycleArtifactVersion);
    const existingArtifacts = (metadata || {}).lifecycleArtifacts;
    if (version === 1 && isDirectiveLifecycleArtifacts(existingArtifacts)) {
      alreadyStrict.push(row.id);
      continue;
    }

    const lifecycleArtifacts = buildDirectiveLifecycleArtifacts({
      capabilityId: row.capabilityId,
      sourceRef,
      evidenceSummary: String(row.evidenceSummary || "").trim(),
      metadata,
    });
    const patchedMetadata = {
      ...metadata,
      lifecycleArtifactVersion: 1,
      lifecycleArtifacts,
      lifecycleArtifactBackfilledAt: now,
    };

    if (!dryRun) {
      db.update(directiveEvaluations)
        .set({
          metadataJson: stringifyJsonField(patchedMetadata),
          updatedAt: now,
        })
        .where(eq(directiveEvaluations.id, row.id))
        .run();
    }

    updates.push({
      evaluationId: row.id,
      capabilityId: row.capabilityId,
      sourceRef,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dryRun,
        scanned: evaluationRows.length,
        updated: updates.length,
        alreadyStrict: alreadyStrict.length,
        skippedMissingSourceRef: skippedMissingSourceRef.length,
        samples: updates.slice(0, 20),
      },
      null,
      2,
    )}\n`,
  );
}

main();
