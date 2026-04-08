export type ReliabilitySample = {
  id: string;
  timestamp?: string;
  totalDurationMs?: number;
  failureClass?: string | null;
  fallbackUsed?: boolean;
};

export type ReliabilityThresholds = {
  minSamples: number;
  maxTimeoutRate: number;
  maxFailoverRate: number;
  maxToolErrorRate: number;
  maxAvgDurationMs: number;
};

export type ReliabilitySummary = {
  ok: boolean;
  reason: string;
  reasons: string[];
  total: number;
  required: number;
  timeout_rate: number;
  failover_rate: number;
  tool_error_rate: number;
  avg_duration_ms: number;
  thresholds: ReliabilityThresholds;
  top_failure_classes: Array<{ name: string; count: number }>;
  recent_failures: Array<{ id: string; timestamp: string | null; failureClass: string }>;
  status: "healthy" | "degraded" | "insufficient_data";
};

function round3(value: number) { return Number(value.toFixed(3)); }

export function evaluateReliability(samples: ReliabilitySample[], thresholds: ReliabilityThresholds): ReliabilitySummary {
  const total = samples.length;
  const timeoutCount = samples.filter((sample) => sample.failureClass === "timeout").length;
  const failoverCount = samples.filter((sample) => Boolean(sample.fallbackUsed)).length;
  const toolErrorCount = samples.filter((sample) => sample.failureClass === "tool_error").length;
  const avgDurationMs = total > 0 ? Math.round(samples.reduce((sum, sample) => sum + Number(sample.totalDurationMs || 0), 0) / total) : 0;
  const timeoutRate = total > 0 ? timeoutCount / total : 0;
  const failoverRate = total > 0 ? failoverCount / total : 0;
  const toolErrorRate = total > 0 ? toolErrorCount / total : 0;

  const reasons: string[] = [];
  if (total < thresholds.minSamples) reasons.push("insufficient_data");
  if (timeoutRate > thresholds.maxTimeoutRate) reasons.push("timeout_rate_exceeded");
  if (failoverRate > thresholds.maxFailoverRate) reasons.push("failover_rate_exceeded");
  if (toolErrorRate > thresholds.maxToolErrorRate) reasons.push("tool_error_rate_exceeded");
  if (avgDurationMs > thresholds.maxAvgDurationMs) reasons.push("avg_duration_exceeded");

  const failureMap = new Map<string, number>();
  for (const sample of samples) {
    const key = String(sample.failureClass || "none");
    if (key === "none") continue;
    failureMap.set(key, (failureMap.get(key) || 0) + 1);
  }

  const topFailureClasses = Array.from(failureMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3);
  const recentFailures = samples.filter((sample) => sample.failureClass).slice(0, 5).map((sample) => ({ id: sample.id, timestamp: sample.timestamp || null, failureClass: String(sample.failureClass) }));
  const ok = reasons.length === 0;
  const status = reasons.includes("insufficient_data") ? "insufficient_data" : ok ? "healthy" : "degraded";

  return { ok, reason: reasons[0] || "ok", reasons, total, required: thresholds.minSamples, timeout_rate: round3(timeoutRate), failover_rate: round3(failoverRate), tool_error_rate: round3(toolErrorRate), avg_duration_ms: avgDurationMs, thresholds, top_failure_classes: topFailureClasses, recent_failures: recentFailures, status };
}

export type RouteDecisionInput = { summary: ReliabilitySummary; enabled: boolean; minSample: number; degradationThreshold: number; primaryModel: string; fallbackModel: string; };
export type RouteDecision = { selectedModel: string; promoteFallback: boolean; reason: string; metadata: Record<string, unknown>; };

export function decideRouteModel(input: RouteDecisionInput): RouteDecision {
  const degradationScore = input.summary.timeout_rate + input.summary.tool_error_rate;
  const enoughData = input.summary.total >= input.minSample;
  const shouldPromoteFallback = input.enabled && enoughData && degradationScore >= input.degradationThreshold;
  return { selectedModel: shouldPromoteFallback ? input.fallbackModel : input.primaryModel, promoteFallback: shouldPromoteFallback, reason: shouldPromoteFallback ? "degradation_threshold_exceeded" : "primary_preferred", metadata: { enabled: input.enabled, enoughData, degradationScore: Number(degradationScore.toFixed(3)), minSample: input.minSample, degradationThreshold: input.degradationThreshold, summaryStatus: input.summary.status, sampleSize: input.summary.total } };
}

export function computeFailureWindowKey(summary: ReliabilitySummary) {
  const bucket = new Date().toISOString().slice(0, 13);
  return `reliability-window:${bucket}:${summary.reasons.slice().sort().join("+")}`;
}
