export function normalizeTopicValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._/]+/g, " ")
    .trim();
}

export function normalizeTopics(values: unknown): string[] {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];

  const normalized = source
    .map((value) => normalizeTopicValue(String(value || "")))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function mergeTopics(...values: unknown[]): string[] {
  return normalizeTopics(values.flatMap((value) => normalizeTopics(value)));
}
