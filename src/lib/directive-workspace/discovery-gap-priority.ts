// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-gap-priority.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export type DiscoveryGapPriorityLevel = "high" | "medium" | "low";

export type DiscoveryGapPriorityInput = {
  gapPriority: DiscoveryGapPriorityLevel;
  missionPressure: number;
  missionLeverage: number;
  proofClarity: number;
  adaptationLeverage: number;
  blockerSeverity: number;
};

export type DiscoveryGapPriorityBreakdown = {
  basePriority: number;
  missionPressure: number;
  missionLeverage: number;
  proofClarity: number;
  adaptationLeverage: number;
  blockerPenalty: number;
  total: number;
};

const PRIORITY_BASE: Record<DiscoveryGapPriorityLevel, number> = {
  high: 50,
  medium: 35,
  low: 20,
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(value)));
}

export function computeDiscoveryGapPriorityBreakdown(
  input: DiscoveryGapPriorityInput,
): DiscoveryGapPriorityBreakdown {
  const missionPressure = clampScore(input.missionPressure);
  const missionLeverage = clampScore(input.missionLeverage);
  const proofClarity = clampScore(input.proofClarity);
  const adaptationLeverage = clampScore(input.adaptationLeverage);
  const blockerSeverity = clampScore(input.blockerSeverity);
  const basePriority = PRIORITY_BASE[input.gapPriority];

  const total =
    basePriority +
    missionPressure * 5 +
    missionLeverage * 4 +
    proofClarity * 3 +
    adaptationLeverage * 3 -
    blockerSeverity * 6;

  return {
    basePriority,
    missionPressure,
    missionLeverage,
    proofClarity,
    adaptationLeverage,
    blockerPenalty: blockerSeverity * 6,
    total,
  };
}
