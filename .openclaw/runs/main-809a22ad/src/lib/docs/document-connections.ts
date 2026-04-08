import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import type { KnowledgeDocument } from "@/types/document";

export interface DocumentReference {
  id: string | null;
  title: string;
  matchedTitle: string | null;
  missing: boolean;
}

export interface DocumentConnections {
  outgoing: DocumentReference[];
  backlinks: KnowledgeDocument[];
  missing: DocumentReference[];
}

export function getDocumentConnections(
  document: KnowledgeDocument,
  documents: KnowledgeDocument[],
): DocumentConnections {
  const documentsByTitle = new Map(
    documents.map((entry) => [normalizeDocumentTitle(entry.title), entry]),
  );
  const normalizedCurrentTitle = normalizeDocumentTitle(document.title);

  const outgoing = document.links.map((link) => {
    const match = documentsByTitle.get(normalizeDocumentTitle(link));

    return {
      id: match?.id ?? null,
      title: link,
      matchedTitle: match?.title ?? null,
      missing: !match,
    };
  });

  const backlinks = documents
    .filter((entry) => entry.id !== document.id)
    .filter((entry) =>
      entry.links.some(
        (link) => normalizeDocumentTitle(link) === normalizedCurrentTitle,
      ),
    )
    .sort((left, right) => left.title.localeCompare(right.title));

  return {
    outgoing,
    backlinks,
    missing: outgoing.filter((reference) => reference.missing),
  };
}
