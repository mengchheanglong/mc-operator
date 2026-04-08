export interface AutomationTemplatePreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  executor: "codex" | "openclaw" | "n8n";
  executionEnv: "worktree" | "local";
  area: string;
  webhookPath?: string;
  topics: string[];
}

export const DEFAULT_N8N_WEBHOOK_PATH = "/webhook/mission-control/template-execute";

export const AUTOMATION_TEMPLATE_PRESETS: AutomationTemplatePreset[] = [
  {
    id: "autonomous-improvement-loop",
    name: "Autonomous Improvement Loop",
    description: "Generate one constrained improvement task with fixed verification and keep-or-discard discipline.",
    executor: "openclaw",
    executionEnv: "local",
    area: "automation",
    topics: ["openclaw", "automation", "quality", "workflow"],
    prompt:
      "Choose one small, well-bounded improvement in the current project. Keep the edit surface narrow, verify it with the project's normal checks, and treat the result as keep-or-discard: if the change does not clearly improve the project or fails verification, revert or abandon it. Return a short operational summary with the files touched, the verification result, and whether the idea should be kept, retried differently, or dropped.",
  },
  {
    id: "small-targeted-refactor",
    name: "Small Targeted Refactor",
    description: "Find one small, low-risk cleanup and finish it with verification.",
    executor: "codex",
    executionEnv: "worktree",
    area: "refactor",
    topics: ["refactor", "quality"],
    prompt:
      "Look through the codebase for one small targeted refactor and complete it. Avoid giant restructuring. Prefer low-risk improvements like deduplicating logic, extracting a small reusable helper, or tightening one messy component. Verify the result with the project's normal checks and summarize what changed.",
  },
  {
    id: "diff-review-handoff",
    name: "Diff Review Handoff",
    description: "Prepare a clean handoff summary from the current repo state and changed files.",
    executor: "codex",
    executionEnv: "worktree",
    area: "handoff",
    topics: ["handoff", "git", "workflow"],
    prompt:
      "Review the current repository state and produce a concise handoff brief. Include changed files, what appears complete, what still looks risky or unfinished, and the next verification steps. Keep it operational and short enough to paste into an IDE assistant session.",
  },
  {
    id: "docs-drift-cleanup",
    name: "Docs Drift Cleanup",
    description: "Check whether docs, quests, and reports have drifted from the repo.",
    executor: "codex",
    executionEnv: "worktree",
    area: "docs",
    topics: ["docs", "quality", "workflow"],
    prompt:
      "Check the current project docs, recent reports, and active quests against the actual repo state. Identify stale or misleading entries, update the smallest high-value items, and summarize what was corrected and what still needs manual review.",
  },
  {
    id: "quest-topic-backfill",
    name: "Quest Topic Backfill",
    description: "Find quests missing topics and propose or apply clean topic assignments.",
    executor: "openclaw",
    executionEnv: "local",
    area: "quests",
    topics: ["quests", "automation"],
    prompt:
      "Review the current quest list and focus on items missing topics or using weak generic topics. Infer stable topics from the goal and project context, update what can be safely improved, and summarize any items that still need better manual naming.",
  },
  {
    id: "n8n-workflow-check",
    name: "n8n Workflow Check",
    description: "Prepare an n8n-oriented execution payload for workflow maintenance or routing tasks.",
    executor: "n8n",
    executionEnv: "local",
    area: "automation",
    webhookPath: DEFAULT_N8N_WEBHOOK_PATH,
    topics: ["n8n", "automation", "workflow"],
    prompt:
      "Inspect the current automation setup and prepare the next n8n task. Focus on one concrete workflow improvement, route cleanup, or missing writeback path. Keep the payload structured so it can be handed to n8n without extra interpretation.",
  },
];
