export function extractAoSessionIds(body: string): string[] {
  const text = String(body || "");
  if (!text.trim()) return [];

  const seen = new Set<string>();
  const patterns = [
    /(?:session(?:\s+id)?|sid)\s*(?:=|:|#)?\s*["'`]?([a-zA-Z0-9][a-zA-Z0-9_-]{3,})/gi,
    /"sessionId"\s*:\s*"([a-zA-Z0-9][a-zA-Z0-9_-]{3,})"/g,
    /\bsession\/([a-zA-Z0-9][a-zA-Z0-9_-]{3,})\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[1] || "").trim();
      if (value) seen.add(value);
    }
  }

  return [...seen];
}
