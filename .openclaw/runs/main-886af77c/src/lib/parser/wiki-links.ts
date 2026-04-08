import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import type { KnowledgeDocument } from "@/types/document";

const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

export interface ParsedWikiLink {
  target: string;
  label: string;
  normalizedTarget: string;
}

function escapeMarkdownLabel(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function parseWikiLink(rawValue: string): ParsedWikiLink {
  const [targetWithSection = "", alias = ""] = rawValue.split("|");
  const [target = ""] = targetWithSection.split("#");
  const cleanedTarget = target.trim();
  const fallbackLabel = cleanedTarget || rawValue.trim();
  const label = alias.trim() || fallbackLabel;

  return {
    target: cleanedTarget,
    label,
    normalizedTarget: normalizeDocumentTitle(cleanedTarget),
  };
}

export function rewriteWikiLinksToMarkdown(
  content: string,
  documents: KnowledgeDocument[],
): string {
  const documentsByTitle = new Map(
    documents.map((document) => [normalizeDocumentTitle(document.title), document]),
  );

  return content.replace(WIKI_LINK_PATTERN, (fullMatch, rawValue) => {
    const parsed = parseWikiLink(String(rawValue || ""));

    if (!parsed.target || !parsed.normalizedTarget) {
      return fullMatch;
    }

    const matchedDocument = documentsByTitle.get(parsed.normalizedTarget);
    const href = matchedDocument
      ? `#doc-ref:${encodeURIComponent(matchedDocument.id)}`
      : `#missing-doc-ref:${encodeURIComponent(parsed.target)}`;

    return `[${escapeMarkdownLabel(parsed.label)}](${href})`;
  });
}
