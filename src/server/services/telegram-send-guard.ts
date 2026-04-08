const DEFAULT_TELEGRAM_LIMIT = 4096;
const DEFAULT_MAX_CHUNKS = 6;

export interface TelegramChunkPlan {
  chunks: string[];
  summarized: boolean;
}

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hardSplit(text: string, limit: number) {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + limit));
    index += limit;
  }
  return chunks;
}

function packSegments(segments: string[], limit: number) {
  const chunks: string[] = [];
  let current = "";

  for (const raw of segments) {
    const segment = raw.trim();
    if (!segment) continue;

    if (segment.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardSplit(segment, limit));
      continue;
    }

    const candidate = current ? `${current}\n\n${segment}` : segment;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = segment;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function summarizeText(input: string, limit: number) {
  const sentences = splitSentences(input);
  const head = sentences.slice(0, 3).join(" ");
  const tail = sentences.slice(-2).join(" ");
  const summary = [head, tail].filter(Boolean).join(" ... ").trim() || input.slice(0, limit);
  return summary.length <= limit ? summary : `${summary.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

export function buildTelegramChunkPlan(text: string, options?: { limit?: number; maxChunks?: number }): TelegramChunkPlan {
  const limit = Math.max(64, Math.floor(options?.limit ?? DEFAULT_TELEGRAM_LIMIT));
  const maxChunks = Math.max(1, Math.floor(options?.maxChunks ?? DEFAULT_MAX_CHUNKS));
  const normalized = String(text || "").trim();

  if (!normalized) {
    return { chunks: [""], summarized: false };
  }

  if (normalized.length <= limit) {
    return { chunks: [normalized], summarized: false };
  }

  const paragraphChunks = packSegments(splitParagraphs(normalized), limit);
  const candidateChunks = paragraphChunks.length > 1 ? paragraphChunks : packSegments(splitSentences(normalized), limit);

  if (candidateChunks.length <= maxChunks && candidateChunks.every((chunk) => chunk.length <= limit)) {
    return { chunks: candidateChunks, summarized: false };
  }

  const summary = summarizeText(normalized, limit);
  return { chunks: [summary], summarized: true };
}
