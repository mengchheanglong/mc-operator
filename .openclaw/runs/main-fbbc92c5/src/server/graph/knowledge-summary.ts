import { extractLinks, normalizeDocumentTitle } from "@/lib/parser/extractLinks";

interface GraphSummaryDoc {
  _id: unknown;
  title?: string;
  content?: string;
}

interface ConnectedDocSummary {
  id: string;
  title: string;
  degree: number;
  incoming: number;
  outgoing: number;
}

interface FocusDocSummary extends ConnectedDocSummary {
  links: string[];
  linkedTitles: string[];
}

export interface KnowledgeGraphSummary {
  documentCount: number;
  edgeCount: number;
  unresolvedLinkCount: number;
  isolatedCount: number;
  topConnectedDocs: ConnectedDocSummary[];
  focusDoc: FocusDocSummary | null;
}

function normalizeDocTitle(value: unknown): string {
  return normalizeDocumentTitle(String(value || ""));
}

function matchFocusDoc(
  docs: GraphSummaryDoc[],
  focusReference: string | null | undefined,
): GraphSummaryDoc | null {
  const normalizedReference = normalizeDocTitle(focusReference);
  if (!normalizedReference) {
    return null;
  }

  return (
    docs.find((doc) => String(doc._id) === String(focusReference || "")) ||
    docs.find((doc) => normalizeDocTitle(doc.title) === normalizedReference) ||
    null
  );
}

export function summarizeKnowledgeGraph(
  docs: GraphSummaryDoc[],
  focusReference?: string | null,
): KnowledgeGraphSummary {
  const docsByTitle = new Map<string, GraphSummaryDoc>();
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  const linksById = new Map<string, string[]>();
  const linkedTitlesById = new Map<string, string[]>();
  const seenEdges = new Set<string>();
  let edgeCount = 0;
  let unresolvedLinkCount = 0;

  for (const doc of docs) {
    const docId = String(doc._id);
    incomingCounts.set(docId, 0);
    outgoingCounts.set(docId, 0);
    linksById.set(docId, []);
    linkedTitlesById.set(docId, []);
    docsByTitle.set(normalizeDocTitle(doc.title), doc);
  }

  for (const doc of docs) {
    const docId = String(doc._id);
    const links = extractLinks(String(doc.content || ""));
    linksById.set(docId, links);

    for (const link of links) {
      const target = docsByTitle.get(normalizeDocTitle(link));
      if (!target || String(target._id) === docId) {
        if (!target) {
          unresolvedLinkCount += 1;
        }
        continue;
      }

      const edgeId = `${docId}::${String(target._id)}`;
      if (seenEdges.has(edgeId)) {
        continue;
      }

      seenEdges.add(edgeId);
      edgeCount += 1;
      outgoingCounts.set(docId, (outgoingCounts.get(docId) || 0) + 1);
      incomingCounts.set(
        String(target._id),
        (incomingCounts.get(String(target._id)) || 0) + 1,
      );
      linkedTitlesById.set(docId, [
        ...(linkedTitlesById.get(docId) || []),
        String(target.title || "Untitled"),
      ]);
    }
  }

  const connectedDocs = docs
    .map((doc) => {
      const id = String(doc._id);
      const incoming = incomingCounts.get(id) || 0;
      const outgoing = outgoingCounts.get(id) || 0;

      return {
        id,
        title: String(doc.title || "Untitled"),
        degree: incoming + outgoing,
        incoming,
        outgoing,
      };
    })
    .sort((left, right) => {
      if (right.degree !== left.degree) {
        return right.degree - left.degree;
      }
      return left.title.localeCompare(right.title);
    });

  const isolatedCount = connectedDocs.filter((doc) => doc.degree === 0).length;
  const focusDoc = matchFocusDoc(docs, focusReference);
  const focusSummary = focusDoc
    ? (() => {
        const id = String(focusDoc._id);
        return {
          id,
          title: String(focusDoc.title || "Untitled"),
          degree: (incomingCounts.get(id) || 0) + (outgoingCounts.get(id) || 0),
          incoming: incomingCounts.get(id) || 0,
          outgoing: outgoingCounts.get(id) || 0,
          links: linksById.get(id) || [],
          linkedTitles: linkedTitlesById.get(id) || [],
        };
      })()
    : null;

  return {
    documentCount: docs.length,
    edgeCount,
    unresolvedLinkCount,
    isolatedCount,
    topConnectedDocs: connectedDocs.slice(0, 6),
    focusDoc: focusSummary,
  };
}

export function formatKnowledgeGraphSummary(
  summary: KnowledgeGraphSummary,
  label = "Knowledge Graph",
): string {
  const lines = [
    `Active scope: graph`,
    `Label: ${label}`,
    `Documents: ${summary.documentCount}`,
    `Resolved links: ${summary.edgeCount}`,
    `Unresolved links: ${summary.unresolvedLinkCount}`,
    `Isolated documents: ${summary.isolatedCount}`,
  ];

  if (summary.topConnectedDocs.length > 0) {
    lines.push("", "Most connected documents:");
    for (const doc of summary.topConnectedDocs) {
      lines.push(
        `- ${doc.title} (degree ${doc.degree}; ${doc.outgoing} out, ${doc.incoming} in)`,
      );
    }
  }

  if (summary.focusDoc) {
    lines.push(
      "",
      "Focused document:",
      `- ${summary.focusDoc.title}`,
      `- Degree: ${summary.focusDoc.degree}`,
      `- Outgoing links: ${summary.focusDoc.outgoing}`,
      `- Incoming links: ${summary.focusDoc.incoming}`,
      `- Linked documents: ${
        summary.focusDoc.linkedTitles.length > 0
          ? summary.focusDoc.linkedTitles.join(", ")
          : "none"
      }`,
    );
  }

  return lines.join("\n");
}
