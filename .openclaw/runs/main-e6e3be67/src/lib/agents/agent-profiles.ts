import type { ContextBlock } from "@/lib/workflow/mission-control-workflow";

export type AgentProfileId = "default" | "impeccable-ui";

export interface AgentProfileDefinition {
  id: AgentProfileId;
  label: string;
  description: string;
  nonDefault: boolean;
}

export interface AgentProfileDispatchDirectives {
  constraints: string[];
  executionNotes: string[];
  verification: string[];
  reportFormat: string[];
  contextBlocks: ContextBlock[];
}

export const AGENT_PROFILE_DEFINITIONS: AgentProfileDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "Standard Mission Control dispatch behavior.",
    nonDefault: false,
  },
  {
    id: "impeccable-ui",
    label: "Impeccable UI",
    description: "Opt-in profile for structured UI improvement dispatches.",
    nonDefault: true,
  },
];

export function normalizeAgentProfileId(value: unknown): AgentProfileId {
  return value === "impeccable-ui" ? "impeccable-ui" : "default";
}

export function buildAgentProfileDispatchDirectives(profileId: AgentProfileId): AgentProfileDispatchDirectives {
  if (profileId !== "impeccable-ui") {
    return {
      constraints: [],
      executionNotes: [],
      verification: [],
      reportFormat: [],
      contextBlocks: [],
    };
  }

  return {
    constraints: [
      "Use a UI-improvement structure for this run: UX issue summary -> concrete change plan -> verification checklist.",
    ],
    executionNotes: [
      "Before editing, write a concise UX issue summary (what is broken/confusing, where it appears, expected behavior).",
      "Propose a concrete change plan (target components/files, intended UI behavior, and smallest reversible patch).",
    ],
    verification: [
      "Verification checklist: responsive behavior (mobile + desktop) validated for touched views.",
      "Verification checklist: accessibility checks validated (keyboard flow, semantic labeling, contrast impact).",
      "Verification checklist: visual regression checks validated (spacing, typography, states, no unintended style drift).",
    ],
    reportFormat: [
      "UX issue summary",
      "Concrete change plan",
      "Verification checklist: responsive, accessibility, visual regressions",
      "Changed files",
      "Risks",
      "Next step",
    ],
    contextBlocks: [
      {
        label: "ui-profile-structure",
        content: [
          "Required response structure for this run:",
          "1) UX issue summary",
          "2) Concrete change plan",
          "3) Verification checklist (responsive, accessibility, visual regressions)",
        ].join("\n"),
      },
    ],
  };
}
