const LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

function cleanLinkTarget(rawValue: string): string {
  return rawValue
    .split("|")[0]
    .split("#")[0]
    .trim();
}

export function normalizeDocumentTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function extractLinks(content: string): string[] {
  const matches = content.matchAll(LINK_PATTERN);
  const links = new Map<string, string>();

  for (const match of matches) {
    const target = cleanLinkTarget(match[1] || "");
    const normalizedTarget = normalizeDocumentTitle(target);

    if (!target || !normalizedTarget) {
      continue;
    }

    if (!links.has(normalizedTarget)) {
      links.set(normalizedTarget, target);
    }
  }

  return Array.from(links.values());
}
