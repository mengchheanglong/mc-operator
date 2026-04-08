import { Injectable } from "@nestjs/common";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

export type WorkflowGuardScopeType = "agent" | "automation";

type WorkflowGuardRow = {
  id: string;
  user_id: string;
  project_id: string;
  scope_type: string;
  scope_id: string;
  run_signature: string;
  repeat_failure_count: number;
  duplicate_hit_count: number;
  reanalysis_required: number;
  last_cost_risk_tier: string;
  last_cost_risk_label: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class WorkflowGuardsService {
  constructor(private readonly sqlite: SqliteService) {}

  private resolveUserId() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as { id?: unknown } | undefined;
    return String(latest?.id || "").trim() || "00000000-0000-0000-0000-000000000001";
  }

  list(input: {
    projectId: string;
    scopeType: WorkflowGuardScopeType;
  }) {
    const userId = this.resolveUserId();
    const rows = this.sqlite.connection
      .prepare(
        `SELECT
          id,
          user_id,
          project_id,
          scope_type,
          scope_id,
          run_signature,
          repeat_failure_count,
          duplicate_hit_count,
          reanalysis_required,
          last_cost_risk_tier,
          last_cost_risk_label,
          last_seen_at,
          created_at,
          updated_at
        FROM workflow_run_guards
        WHERE user_id = ? AND project_id = ? AND scope_type = ?
        ORDER BY updated_at DESC`,
      )
      .all(userId, input.projectId, input.scopeType) as WorkflowGuardRow[];

    return rows.map((row) => ({
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      projectId: String(row.project_id || ""),
      scopeType:
        String(row.scope_type || "").trim() === "automation" ? "automation" : "agent",
      scopeId: String(row.scope_id || ""),
      runSignature: String(row.run_signature || ""),
      repeatFailureCount: Math.max(0, Number(row.repeat_failure_count || 0)),
      duplicateHitCount: Math.max(0, Number(row.duplicate_hit_count || 0)),
      reanalysisRequired: Boolean(row.reanalysis_required),
      lastCostRiskTier: String(row.last_cost_risk_tier || "low"),
      lastCostRiskLabel: String(row.last_cost_risk_label || "cost-risk/low"),
      lastSeenAt: String(row.last_seen_at || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    }));
  }
}
