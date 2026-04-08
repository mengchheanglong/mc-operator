import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";
import { resolveUserContext } from "@/server/context/user-context";
import { listDocs } from "@/server/repositories/docs-repo";
import { listQuests } from "@/server/repositories/quests-repo";

type DocRecord = ReturnType<typeof listDocs>[number];
type QuestRecord = ReturnType<typeof listQuests>[number];

type DocSearchIndexEntry = {
  doc: DocRecord;
  titleLower: string;
  tagLowers: string[];
  haystackLower: string;
  updatedAtMs: number;
};

type RankingRun = {
  ms: number;
};

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    ),
  );
}

function scoreLegacyDocumentAgainstQuery(doc: DocRecord, query: string) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return 0;
  }

  const titleLower = doc.title.toLowerCase();
  const tagLowers = doc.tags.map((tag) => tag.toLowerCase());
  const haystackLower =
    `${doc.title} ${doc.tags.join(" ")} ${doc.content.slice(0, 1200)}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (titleLower.includes(token)) {
      score += 5;
    }
    if (tagLowers.some((tag) => tag.includes(token))) {
      score += 3;
    }
    if (haystackLower.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function buildDocSearchIndex(docs: DocRecord[]): DocSearchIndexEntry[] {
  return docs.map((doc) => ({
    doc,
    titleLower: doc.title.toLowerCase(),
    tagLowers: doc.tags.map((tag) => tag.toLowerCase()),
    haystackLower:
      `${doc.title} ${doc.tags.join(" ")} ${doc.content.slice(0, 1200)}`.toLowerCase(),
    updatedAtMs: new Date(doc.updatedAt).getTime() || 0,
  }));
}

function scoreIndexedDocumentAgainstTokens(
  entry: DocSearchIndexEntry,
  tokens: string[],
) {
  let score = 0;

  for (const token of tokens) {
    if (entry.titleLower.includes(token)) {
      score += 5;
    }
    if (entry.tagLowers.some((tag) => tag.includes(token))) {
      score += 3;
    }
    if (entry.haystackLower.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function compareRankedDocEntries(
  left: { score: number; updatedAtMs: number; docId: string },
  right: { score: number; updatedAtMs: number; docId: string },
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.updatedAtMs !== left.updatedAtMs) {
    return right.updatedAtMs - left.updatedAtMs;
  }
  return left.docId.localeCompare(right.docId);
}

function rankRelatedDocsLegacy(docs: DocRecord[], query: string, limit: number) {
  if (limit <= 0) {
    return [];
  }

  return docs
    .map((doc) => ({
      doc,
      score: scoreLegacyDocumentAgainstQuery(doc, query),
      updatedAtMs: new Date(doc.updatedAt).getTime() || 0,
      docId: doc.id,
    }))
    .filter((entry) => entry.score > 0)
    .sort(compareRankedDocEntries)
    .slice(0, limit)
    .map((entry) => entry.doc);
}

function insertRankedDocResult<T extends { score: number; updatedAtMs: number; docId: string }>(
  entries: T[],
  candidate: T,
  limit: number,
) {
  let insertAt = entries.findIndex(
    (entry) => compareRankedDocEntries(candidate, entry) < 0,
  );
  if (insertAt === -1) {
    insertAt = entries.length;
  }

  entries.splice(insertAt, 0, candidate);
  if (entries.length > limit) {
    entries.length = limit;
  }
}

function rankRelatedDocsIndexed(
  searchIndex: DocSearchIndexEntry[],
  query: string,
  limit: number,
) {
  const tokens = tokenize(query);
  if (tokens.length === 0 || limit <= 0) {
    return [];
  }

  const topEntries: Array<{
    doc: DocRecord;
    docId: string;
    score: number;
    updatedAtMs: number;
  }> = [];

  for (const entry of searchIndex) {
    const score = scoreIndexedDocumentAgainstTokens(entry, tokens);
    if (score <= 0) {
      continue;
    }

    insertRankedDocResult(
      topEntries,
      {
        doc: entry.doc,
        docId: entry.doc.id,
        score,
        updatedAtMs: entry.updatedAtMs,
      },
      limit,
    );
  }

  return topEntries.map((entry) => entry.doc);
}

function buildQueries(quests: QuestRecord[], docs: DocRecord[]) {
  const queries = new Set<string>();

  for (const quest of quests) {
    const goal = String(quest.goal || "").trim();
    if (goal) {
      queries.add(goal);
    }
    if (queries.size >= 12) {
      break;
    }
  }

  if (queries.size < 12) {
    for (const doc of docs) {
      const title = String(doc.title || "").trim();
      if (title) {
        queries.add(title);
      }
      if (queries.size >= 12) {
        break;
      }
    }
  }

  if (queries.size === 0) {
    queries.add("directive workspace");
    queries.add("context pack");
  }

  return Array.from(queries);
}

function compareAlgorithms(
  docs: DocRecord[],
  searchIndex: DocSearchIndexEntry[],
  queries: string[],
  limit: number,
) {
  const mismatches: Array<{
    query: string;
    legacyIds: string[];
    indexedIds: string[];
  }> = [];

  for (const query of queries) {
    const legacyIds = rankRelatedDocsLegacy(docs, query, limit).map((doc) => doc.id);
    const indexedIds = rankRelatedDocsIndexed(searchIndex, query, limit).map(
      (doc) => doc.id,
    );

    if (legacyIds.join("|") !== indexedIds.join("|")) {
      mismatches.push({ query, legacyIds, indexedIds });
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

function averageMs(runs: RankingRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

function benchmarkLegacy(docs: DocRecord[], queries: string[], limit: number, iterations: number) {
  const runs: RankingRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();

    for (const query of queries) {
      rankRelatedDocsLegacy(docs, query, limit);
    }

    runs.push({ ms: performance.now() - started });
  }

  return runs;
}

function benchmarkIndexed(docs: DocRecord[], queries: string[], limit: number, iterations: number) {
  const runs: RankingRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const searchIndex = buildDocSearchIndex(docs);

    for (const query of queries) {
      rankRelatedDocsIndexed(searchIndex, query, limit);
    }

    runs.push({ ms: performance.now() - started });
  }

  return runs;
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const limit = Number.parseInt(process.argv[3] || "5", 10) || 5;
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());

  if (!project) {
    throw new Error("control plane project not found");
  }

  const docs = listDocs(userId, project.id);
  const quests = listQuests(userId, project.id, { limit: 16 });
  const queries = buildQueries(quests, docs);

  if (docs.length === 0) {
    throw new Error("no docs found for the control-plane project");
  }

  const searchIndex = buildDocSearchIndex(docs);
  const parity = compareAlgorithms(docs, searchIndex, queries, limit);
  if (!parity.ok) {
    throw new Error(
      `indexed ranking diverged from legacy ranking for ${parity.mismatches.length} quer${parity.mismatches.length === 1 ? "y" : "ies"}`,
    );
  }

  const legacyRuns = benchmarkLegacy(docs, queries, limit, iterations);
  const indexedRuns = benchmarkIndexed(docs, queries, limit, iterations);
  const legacyAvg = averageMs(legacyRuns);
  const indexedAvg = averageMs(indexedRuns);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        limit,
        docsCount: docs.length,
        questCount: quests.length,
        queryCount: queries.length,
        sampleQueries: queries.slice(0, 5),
        parity,
        legacyRuns,
        indexedRuns,
        legacyAvgMs: Number(legacyAvg.toFixed(2)),
        indexedAvgMs: Number(indexedAvg.toFixed(2)),
        deltaMs: Number((indexedAvg - legacyAvg).toFixed(2)),
        improvementPercent: Number(
          (((legacyAvg - indexedAvg) / legacyAvg) * 100).toFixed(1),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
