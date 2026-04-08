// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/structured-output-fallback.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export type StructuredRecord = Record<string, unknown>;

function asRecord(value: unknown): StructuredRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as StructuredRecord)
    : null;
}

function stripCodeFence(input: string) {
  const fenceMatch = input.match(/```(?:json|javascript|js|ts)?\s*([\s\S]*?)```/i);
  if (!fenceMatch) return input;
  return String(fenceMatch[1] || "").trim();
}

function extractLikelyJson(input: string) {
  const text = input.trim();
  if (!text) return null;

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  const objectCandidate =
    objectStart >= 0 && objectEnd > objectStart
      ? text.slice(objectStart, objectEnd + 1)
      : null;
  const arrayCandidate =
    arrayStart >= 0 && arrayEnd > arrayStart
      ? text.slice(arrayStart, arrayEnd + 1)
      : null;

  if (objectCandidate && arrayCandidate) {
    return objectStart <= arrayStart ? objectCandidate : arrayCandidate;
  }
  return objectCandidate || arrayCandidate;
}

function removeTrailingCommas(input: string) {
  return input.replace(/,\s*([}\]])/g, "$1");
}

function tryParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function parseStructuredOutputFallback(value: unknown): unknown | null {
  if (Array.isArray(value) || asRecord(value)) return value;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const strippedFence = stripCodeFence(raw);
  const extractedRaw = extractLikelyJson(raw);
  const extractedFence = extractLikelyJson(strippedFence);

  const candidates = [
    raw,
    strippedFence,
    extractedRaw || "",
    extractedFence || "",
  ]
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const direct = tryParseJson(candidate);
    if (direct !== null) return direct;

    const trailingCommaFixed = removeTrailingCommas(candidate);
    if (trailingCommaFixed !== candidate) {
      const parsed = tryParseJson(trailingCommaFixed);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function parseObjectFallback(value: unknown): StructuredRecord | null {
  const direct = asRecord(value);
  if (direct) return direct;
  const parsed = parseStructuredOutputFallback(value);
  return asRecord(parsed);
}

export function parseArrayFallback(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  const parsed = parseStructuredOutputFallback(value);
  return Array.isArray(parsed) ? parsed : null;
}

function cleanListToken(input: string) {
  return input
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function parseMarkdownLinkToken(input: string) {
  const match = input.match(/\[[^\]]*]\(([^)]+)\)/);
  return match ? String(match[1] || "").trim() : null;
}

export function parseStringListFallback(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const parsedArray = parseArrayFallback(value);
  if (parsedArray) {
    return parsedArray
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const parsedObject = parseObjectFallback(value);
  if (parsedObject) {
    const objectArrayKeys = [
      "items",
      "values",
      "urls",
      "source_urls",
      "sourceUrls",
      "visited_urls",
      "visitedUrls",
      "errors",
    ];
    for (const key of objectArrayKeys) {
      const candidate = parsedObject[key];
      if (Array.isArray(candidate)) {
        const normalized = candidate
          .map((item) => String(item || "").trim())
          .filter(Boolean);
        if (normalized.length > 0) return normalized;
      }
    }
    return [];
  }

  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text) return [];

  const tokens: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const link = parseMarkdownLinkToken(line);
    if (link) {
      tokens.push(link);
      continue;
    }
    if (line.includes(",")) {
      const csvParts = line
        .split(",")
        .map((part) => cleanListToken(part))
        .filter(Boolean);
      tokens.push(...csvParts);
      continue;
    }
    const cleaned = cleanListToken(line);
    if (cleaned) tokens.push(cleaned);
  }

  return [...new Set(tokens)];
}
