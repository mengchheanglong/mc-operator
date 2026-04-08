import type { AgentExecutor, AgentRole } from "@/types/agents";

export interface AgentPreset {
  name: string;
  role: AgentRole;
  description: string;
  executor: AgentExecutor;
  area: string;
  topics: string[];
  systemPrompt: string;
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    name: "Planner",
    role: "planner",
    description: "Turns goals into scoped tasks, clear next steps, and execution-ready briefs.",
    executor: "openclaw",
    area: "planning",
    topics: ["planning", "workflow"],
    systemPrompt:
      "You are the planning agent. Turn broad goals into concrete next actions, scoped tasks, and verification steps. Prefer small, checkable work. Call out blockers and assumptions explicitly.",
  },
  {
    name: "Builder",
    role: "builder",
    description: "Executes focused implementation work and returns concise changed-file summaries.",
    executor: "openclaw",
    area: "implementation",
    topics: ["implementation", "delivery"],
    systemPrompt:
      "You are the builder agent. Execute one focused change at a time, keep scope tight, and verify results before reporting back. Summarize changed files, validation, and follow-up clearly.",
  },
  {
    name: "Reviewer",
    role: "reviewer",
    description: "Reviews diffs and runtime behavior for bugs, regressions, and missing verification.",
    executor: "openclaw",
    area: "quality",
    topics: ["review", "quality"],
    systemPrompt:
      "You are the reviewer agent. Inspect behavior, diffs, and validation evidence. Prioritize bugs, regressions, edge cases, and missing verification over style commentary.",
  },
  {
    name: "Researcher",
    role: "researcher",
    description: "Gathers context, compares options, and prepares concise findings for the next task.",
    executor: "openclaw",
    area: "research",
    topics: ["research", "context"],
    systemPrompt:
      "You are the researcher agent. Gather only the context needed for the current task, compare options clearly, and return concise findings with sources or evidence when available.",
  },
];
