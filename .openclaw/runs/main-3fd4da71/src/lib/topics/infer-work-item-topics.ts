import { normalizeTopicValue, normalizeTopics } from "@/lib/topics";

const CURATED_TOPIC_RULES: Array<{ topic: string; patterns: string[] }> = [
  { topic: "n8n", patterns: ["n8n"] },
  { topic: "openclaw", patterns: ["openclaw"] },
  { topic: "codex", patterns: ["codex"] },
  { topic: "prompt-pack", patterns: ["prompt pack", "prompt-pack", "promptpack"] },
  { topic: "graph", patterns: ["graph", "knowledge graph"] },
  { topic: "automation", patterns: ["automation", "automations", "automate"] },
  { topic: "workflow", patterns: ["workflow", "workflows"] },
  { topic: "security", patterns: ["security"] },
  { topic: "dashboard", patterns: ["dashboard"] },
  { topic: "docs", patterns: ["docs", "documentation", "document"] },
  { topic: "quests", patterns: ["quest", "quests"] },
  { topic: "reports", patterns: ["report", "reports"] },
  { topic: "ui", patterns: ["ui", "interface", "frontend"] },
  { topic: "api", patterns: ["api", "apis", "backend"] },
  { topic: "sqlite", patterns: ["sqlite"] },
  { topic: "git", patterns: ["git", "github"] },
  { topic: "mcp", patterns: ["mcp"] },
  { topic: "inbox", patterns: ["inbox"] },
  { topic: "architecture", patterns: ["architecture", "architectural"] },
  { topic: "quality", patterns: ["quality", "lint", "typecheck", "build", "test"] },
  { topic: "ide", patterns: ["ide", "cursor", "editor"] },
  { topic: "codegraphcontext", patterns: ["codegraphcontext", "code graph context", "cgc"] },
];

function normalizeComparableText(value: string) {
  return normalizeTopicValue(value).replace(/-/g, " ");
}

function toSlugTopic(value: string) {
  return normalizeTopicValue(value).replace(/\s+/g, "-");
}

export function inferWorkItemTopics(input: {
  goal: string;
  area?: string | null;
  topics?: string[];
}): string[] {
  const explicitTopics = normalizeTopics(input.topics || []);
  if (explicitTopics.length > 0) {
    return explicitTopics;
  }

  const matches = new Set<string>();
  const comparableGoal = normalizeComparableText(input.goal);
  const comparableArea = normalizeComparableText(String(input.area || ""));
  const combined = `${comparableGoal} ${comparableArea}`.trim();

  for (const rule of CURATED_TOPIC_RULES) {
    if (
      rule.patterns.some((pattern) => {
        const comparablePattern = normalizeComparableText(pattern);
        return comparablePattern && combined.includes(comparablePattern);
      })
    ) {
      matches.add(rule.topic);
    }
  }

  const normalizedArea = toSlugTopic(String(input.area || ""));
  if (normalizedArea) {
    matches.add(normalizedArea);
  }

  const normalizedGoal = comparableGoal;
  if (matches.size === 0) {
    const bestPhrase =
      normalizedGoal
        .split(/\s+/)
        .filter((part) => part.length > 2)
        .slice(0, 2)
        .join("-") || "general";
    matches.add(bestPhrase);
  }

  return normalizeTopics(Array.from(matches));
}
