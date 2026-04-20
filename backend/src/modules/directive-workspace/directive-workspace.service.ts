import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

const SUPPORTED_SOURCE_TYPES = [
  "github-repo",
  "paper",
  "product-doc",
  "theory",
  "technical-essay",
  "workflow-writeup",
  "external-system",
  "internal-signal",
] as const;

const SOURCE_FLOW = [
  "source",
  "analyze",
  "route",
  "extract",
  "adapt",
  "improve",
  "prove",
  "integrate",
] as const;

const USEFULNESS_LEVELS = ["direct", "structural", "meta"] as const;

const V0 = {
  supportedSourceTypes: SUPPORTED_SOURCE_TYPES,
  sourceFlow: SOURCE_FLOW,
  usefulnessLevels: USEFULNESS_LEVELS,
  workflowFamily: "source-adaptation-engine",
  workflowSentence:
    "Analyze a source against the active mission, route it to the right track, adapt the useful mechanism into Directive-owned form, prove it safely, and integrate the result with rollback clarity.",
  primaryMetricKey: "decision_lead_time_hours",
  primaryMetricTargetHours: 72,
} as const;

@Injectable()
export class DirectiveWorkspaceService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(v: unknown) {
    return String(v || "").trim();
  }

  private j<T>(v: string | null | undefined, fallback: T): T {
    if (!v) return fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }

  private status(v: unknown) {
    const n = this.s(v).toLowerCase();
    const allowed = [
      "intake",
      "analyzed",
      "experimenting",
      "evaluated",
      "decided",
      "integrated",
    ];
    if (!allowed.includes(n)) {
      throw new BadRequestException(
        `invalid_input: unsupported capability status=${String(v || "")}`,
      );
    }
    return n;
  }

  private recommendation(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "ignore" || n === "monitor" || n === "test") return n;
    throw new BadRequestException(
      `invalid_input: unsupported recommendation=${String(v || "")}`,
    );
  }

  private sourceType(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (SUPPORTED_SOURCE_TYPES.includes(n as (typeof SUPPORTED_SOURCE_TYPES)[number])) {
      return n;
    }
    throw new BadRequestException(
      `invalid_input: unsupported sourceType=${String(v || "")}; supported source types: ${SUPPORTED_SOURCE_TYPES.join(", ")}`,
    );
  }

  private expStatus(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "proposed" || n === "running" || n === "completed" || n === "aborted")
      return n;
    throw new BadRequestException(
      `invalid_input: unsupported experiment status=${String(v || "")}`,
    );
  }

  private outcome(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "positive" || n === "negative" || n === "mixed" || n === "inconclusive")
      return n;
    throw new BadRequestException(
      `invalid_input: unsupported evaluation outcome=${String(v || "")}`,
    );
  }

  private decision(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "adopt" || n === "reject" || n === "defer" || n === "monitor") return n;
    throw new BadRequestException(
      `invalid_input: unsupported decision=${String(v || "")}`,
    );
  }

  private computeLeadTimeHours(
    capabilityCreatedAt: unknown,
    decisionCreatedAt: unknown,
  ): number | null {
    const start = new Date(String(capabilityCreatedAt || "")).getTime();
    const end = new Date(String(decisionCreatedAt || "")).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    const hours = (end - start) / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
  }

  private integrationStatus(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "planned" || n === "active" || n === "parked" || n === "removed") return n;
    throw new BadRequestException(
      `invalid_input: unsupported integration status=${String(v || "")}`,
    );
  }

  private integrationMode(v: unknown) {
    const n = this.s(v).toLowerCase();
    if (n === "reimplement" || n === "adapt" || n === "wrap") return n;
    throw new BadRequestException(
      `invalid_input: unsupported integrationMode=${String(v || "")}`,
    );
  }

  private runtimeStatusFromIntegrationStatus(v: string) {
    if (v === "planned") return "planned";
    if (v === "active") return "callable";
    if (v === "parked") return "parked";
    return "removed";
  }

  private normalizeDueAt(v: unknown) {
    const dueAt = this.s(v);
    if (!dueAt) {
      throw new BadRequestException("invalid_input: dueAt is required when decision=adopt");
    }
    const parsed = new Date(dueAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("invalid_input: dueAt must be a valid ISO timestamp");
    }
    return parsed.toISOString();
  }

  private normalizeRequiredGates(v: unknown) {
    const gates = this.notes(v);
    if (gates.length === 0) {
      throw new BadRequestException(
        "invalid_input: requiredGates is required when decision=adopt and must contain at least one check",
      );
    }
    return gates;
  }

  private notes(v: unknown) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => this.s(x)).filter(Boolean);
  }

  private inferTitle(sourceRef: string) {
    const trimmed = this.s(sourceRef).replace(/\/+$/, "");
    const parts = trimmed.split(/[\\/]/).filter(Boolean);
    const tail = parts[parts.length - 1] || trimmed;
    return tail.replace(/\.git$/i, "") || trimmed;
  }

  private parseCapability(row: Record<string, unknown>) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      title: row.title,
      status: row.status,
      frameworkStatus:
        row.framework_status ||
        (row.status === "integrated" ? "decided" : row.status || "intake"),
      runtimeStatus:
        row.runtime_status ||
        (row.status === "integrated" ? "callable" : "none"),
      workflowFamily: row.workflow_family,
      userIntent: row.user_intent || null,
      notes: this.j<string[]>(String(row.notes_json || "[]"), []),
      analysisSummary: row.analysis_summary || null,
      category: row.category || null,
      problemFit: row.problem_fit || null,
      overlapNotes: row.overlap_notes || null,
      riskNotes: row.risk_notes || null,
      recommendation: row.recommendation || null,
      metadata: this.j<Record<string, unknown>>(String(row.metadata_json || "{}"), {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseExperiment(row: Record<string, unknown>) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      capabilityId: row.capability_id,
      runId: row.run_id || null,
      hypothesis: row.hypothesis,
      plan: row.plan,
      successCriteria: this.j<string[]>(String(row.success_criteria_json || "[]"), []),
      status: row.status,
      artifactPath: row.artifact_path || null,
      metadata: this.j<Record<string, unknown>>(String(row.metadata_json || "{}"), {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || null,
    };
  }

  private parseEvaluation(row: Record<string, unknown>) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      capabilityId: row.capability_id,
      experimentId: row.experiment_id,
      outcome: row.outcome,
      usefulness: row.usefulness || null,
      friction: row.friction || null,
      workflowImpact: row.workflow_impact || null,
      evidenceSummary: row.evidence_summary,
      metadata: this.j<Record<string, unknown>>(String(row.metadata_json || "{}"), {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseDecision(row: Record<string, unknown>) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      capabilityId: row.capability_id,
      evaluationId: row.evaluation_id || null,
      decision: row.decision,
      rationale: row.rationale,
      decidedBy: row.decided_by,
      metadata: this.j<Record<string, unknown>>(String(row.metadata_json || "{}"), {}),
      createdAt: row.created_at,
    };
  }

  private parseIntegration(row: Record<string, unknown>) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      capabilityId: row.capability_id,
      decisionId: row.decision_id,
      status: row.status,
      integrationMode: row.integration_mode || "adapt",
      integrationSurface: row.integration_surface,
      targetRuntimeSurface: row.target_runtime_surface || null,
      owner: row.owner || null,
      dueAt: row.due_at || null,
      requiredGates: this.j<string[]>(String(row.required_gates_json || "[]"), []),
      proofArtifactPath: row.proof_artifact_path || null,
      rollbackPlan: row.rollback_plan || null,
      dependencyNotes: row.dependency_notes || null,
      rollbackNotes: row.rollback_notes || null,
      metadata: this.j<Record<string, unknown>>(String(row.metadata_json || "{}"), {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private projectId(v?: unknown) {
    return this.s(v) || "mc-operator";
  }

  private operator() {
    const existing = this.sqlite.connection
      .prepare(
        "SELECT id, name, timezone FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (existing) {
      return { id: String(existing.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private requireCapability(userId: string, projectId: string, capabilityId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM directive_capabilities WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, capabilityId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new BadRequestException(`invalid_input: capability not found for id=${capabilityId}`);
    }
    return this.parseCapability(row);
  }

  private findExperiment(userId: string, projectId: string, experimentId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM directive_experiments WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, experimentId) as Record<string, unknown> | undefined;
    return row ? this.parseExperiment(row) : null;
  }

  private findEvaluation(userId: string, projectId: string, evaluationId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM directive_evaluations WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, evaluationId) as Record<string, unknown> | undefined;
    return row ? this.parseEvaluation(row) : null;
  }

  private reportHref(date: string) {
    return `/dashboard/report?day=${encodeURIComponent(date.slice(0, 10))}`;
  }

  private createReport(input: {
    userId: string;
    projectId: string;
    title: string;
    content: string;
    status?: string;
    metadata?: Record<string, unknown>;
  }) {
    const id = randomUUID();
    const date = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, source, metadata_json, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.userId,
        input.projectId,
        input.title,
        input.content,
        "maintenance",
        input.status || "info",
        "directive-workspace",
        "Mission Control",
        JSON.stringify(input.metadata || {}),
        date,
      );
    return { id, date };
  }

  private parseIntegrationProof(input: unknown) {
    if (!input || typeof input !== "object") return null;
    const raw = input as Record<string, unknown>;
    if (!raw.execution || typeof raw.execution !== "object") return null;
    if (!raw.artifact || typeof raw.artifact !== "object") return null;
    const execution = raw.execution as Record<string, unknown>;
    const artifact = raw.artifact as Record<string, unknown>;
    if (execution.ok !== true) return null;
    const method = this.s(execution.method);
    const reference = this.s(execution.reference);
    const ts = this.s(execution.timestamp);
    if (!method || !reference || !ts) return null;
    if (Number.isNaN(new Date(ts).getTime())) return null;
    const reportId = this.s(artifact.reportId) || null;
    const reportHref = this.s(artifact.reportHref) || null;
    const artifactPath = this.s(artifact.artifactPath) || null;
    const summary = this.s(artifact.summary) || null;
    if (!reportId && !reportHref && !artifactPath) return null;
    return {
      execution: { ok: true as const, method, reference, timestamp: new Date(ts).toISOString() },
      artifact: { reportId, reportHref, artifactPath, summary },
    };
  }

  listCapabilities(projectId?: unknown, status?: unknown) {
    const user = this.operator();
    const pid = this.projectId(projectId);
    const filters = ["user_id = ?", "project_id = ?"];
    const params: string[] = [user.id, pid];
    if (status !== undefined && this.s(status)) {
      filters.push("status = ?");
      params.push(this.status(status));
    }
    const rows = this.sqlite.connection
      .prepare(
        `SELECT * FROM directive_capabilities WHERE ${filters.join(" AND ")} ORDER BY updated_at DESC, created_at DESC LIMIT 200`,
      )
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseCapability(row));
  }

  getCapabilityById(capabilityId: string, projectId?: unknown) {
    const user = this.operator();
    return this.requireCapability(user.id, this.projectId(projectId), capabilityId);
  }

  getCapabilityLifecycle(capabilityId: string, projectId?: unknown) {
    const user = this.operator();
    const pid = this.projectId(projectId);
    const capability = this.requireCapability(user.id, pid, capabilityId);
    const experiments = this.sqlite.connection
      .prepare("SELECT * FROM directive_experiments WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
      .all(user.id, pid, capability.id) as Array<Record<string, unknown>>;
    const evaluations = this.sqlite.connection
      .prepare("SELECT * FROM directive_evaluations WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
      .all(user.id, pid, capability.id) as Array<Record<string, unknown>>;
    const decisions = this.sqlite.connection
      .prepare("SELECT * FROM directive_decisions WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
      .all(user.id, pid, capability.id) as Array<Record<string, unknown>>;
    const integrations = this.sqlite.connection
      .prepare("SELECT * FROM directive_integrations WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
      .all(user.id, pid, capability.id) as Array<Record<string, unknown>>;
    const parsedDecisions = decisions.map((row) => this.parseDecision(row));
    const parsedIntegrations = integrations.map((row) => this.parseIntegration(row));
    const latestDecision = parsedDecisions[0] || null;
    const decisionLeadTimeHours = latestDecision
      ? this.computeLeadTimeHours(capability.createdAt, latestDecision.createdAt)
      : null;
    const callableIntegration = parsedIntegrations.find(
      (integration) => this.s(integration.status) === "active",
    );
    const adoptToCallableLeadTimeHours =
      latestDecision?.decision === "adopt" && callableIntegration
        ? this.computeLeadTimeHours(capability.createdAt, callableIntegration.updatedAt)
        : null;
    return {
      v0: V0,
      capability,
      experiments: experiments.map((row) => this.parseExperiment(row)),
      evaluations: evaluations.map((row) => this.parseEvaluation(row)),
      decisions: parsedDecisions,
      integrations: parsedIntegrations,
      latestDecision,
      decisionLeadTimeHours,
      adoptToCallableLeadTimeHours,
    };
  }

  createCapability(input: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(input.projectId);
    const sourceType = this.sourceType(input.sourceType || "internal-signal");
    const sourceRef = this.s(input.sourceRef);
    if (!sourceRef) throw new BadRequestException("invalid_input: sourceRef is required");
    const title = this.s(input.title) || this.inferTitle(sourceRef);
    if (!title) throw new BadRequestException("invalid_input: title is required");
    const metadata = input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, unknown>) : {};
    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare("INSERT INTO directive_capabilities (id, user_id, project_id, source_type, source_ref, title, status, framework_status, runtime_status, workflow_family, user_intent, notes_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        id,
        user.id,
        pid,
        sourceType,
        sourceRef,
        title,
        "intake",
        "intake",
        "none",
        V0.workflowFamily,
        this.s(input.userIntent) || null,
        JSON.stringify(this.notes(input.notes)),
        JSON.stringify({
          ...metadata,
          workflowSentence: V0.workflowSentence,
          sourceFlow: [...V0.sourceFlow],
          usefulnessLevels: [...V0.usefulnessLevels],
          primaryMetric: {
            key: V0.primaryMetricKey,
            targetHours: V0.primaryMetricTargetHours,
          },
        }),
        now,
        now,
      );
    return this.requireCapability(user.id, pid, id);
  }

  recordAnalysis(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    this.requireCapability(user.id, pid, capabilityId);
    const analysisSummary = this.s(body.analysisSummary);
    if (!analysisSummary) throw new BadRequestException("invalid_input: analysisSummary is required");
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare("UPDATE directive_capabilities SET status = ?, framework_status = ?, analysis_summary = ?, category = ?, problem_fit = ?, overlap_notes = ?, risk_notes = ?, recommendation = ?, metadata_json = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run("analyzed", "analyzed", analysisSummary, this.s(body.category) || null, this.s(body.problemFit) || null, this.s(body.overlapNotes) || null, this.s(body.riskNotes) || null, this.recommendation(body.recommendation), JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}), now, user.id, pid, capabilityId);
    return this.requireCapability(user.id, pid, capabilityId);
  }

  createExperiment(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    this.requireCapability(user.id, pid, capabilityId);
    const hypothesis = this.s(body.hypothesis);
    const plan = this.s(body.plan);
    if (!hypothesis) throw new BadRequestException("invalid_input: hypothesis is required");
    if (!plan) throw new BadRequestException("invalid_input: plan is required");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare("INSERT INTO directive_experiments (id, user_id, project_id, capability_id, run_id, hypothesis, plan, success_criteria_json, status, artifact_path, metadata_json, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, user.id, pid, capabilityId, this.s(body.runId) || null, hypothesis, plan, JSON.stringify(this.notes(body.successCriteria)), this.expStatus(body.status || "proposed"), this.s(body.artifactPath) || null, JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}), now, now, null);
    this.sqlite.connection
      .prepare("UPDATE directive_capabilities SET status = ?, framework_status = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run("experimenting", "experimenting", now, user.id, pid, capabilityId);
    const row = this.sqlite.connection
      .prepare("SELECT * FROM directive_experiments WHERE id = ?")
      .get(id) as Record<string, unknown>;
    return this.parseExperiment(row);
  }

  recordEvaluation(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    this.requireCapability(user.id, pid, capabilityId);
    const experimentId = this.s(body.experimentId);
    const experiment = this.findExperiment(user.id, pid, experimentId);
    if (!experiment || experiment.capabilityId !== capabilityId) {
      throw new BadRequestException(`invalid_input: experiment not found for capabilityId=${capabilityId}`);
    }
    const evidenceSummary = this.s(body.evidenceSummary);
    if (!evidenceSummary) throw new BadRequestException("invalid_input: evidenceSummary is required");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare("INSERT INTO directive_evaluations (id, user_id, project_id, capability_id, experiment_id, outcome, usefulness, friction, workflow_impact, evidence_summary, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, user.id, pid, capabilityId, experimentId, this.outcome(body.outcome), this.s(body.usefulness) || null, this.s(body.friction) || null, this.s(body.workflowImpact) || null, evidenceSummary, JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}), now, now);
    this.sqlite.connection
      .prepare("UPDATE directive_experiments SET status = ?, updated_at = ?, completed_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run("completed", now, now, user.id, pid, experimentId);
    this.sqlite.connection
      .prepare("UPDATE directive_capabilities SET status = ?, framework_status = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run("evaluated", "evaluated", now, user.id, pid, capabilityId);
    const row = this.sqlite.connection
      .prepare("SELECT * FROM directive_evaluations WHERE id = ?")
      .get(id) as Record<string, unknown>;
    return this.parseEvaluation(row);
  }

  recordDecision(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    const capability = this.requireCapability(user.id, pid, capabilityId);
    const decision = this.decision(body.decision);
    const rationale = this.s(body.rationale);
    if (!rationale) throw new BadRequestException("invalid_input: rationale is required");
    const evaluationId = this.s(body.evaluationId) || null;
    if (evaluationId) {
      const evaluation = this.findEvaluation(user.id, pid, evaluationId);
      if (!evaluation || evaluation.capabilityId !== capabilityId) {
        throw new BadRequestException(`invalid_input: evaluation not found for capabilityId=${capabilityId}`);
      }
    }
    const integrationSurface = this.s(body.integrationSurface);
    const targetRuntimeSurface = this.s(body.targetRuntimeSurface || integrationSurface);
    const parsedProof = decision === "adopt" ? this.parseIntegrationProof(body.integrationProof) : null;
    if (decision === "adopt" && !integrationSurface) {
      throw new BadRequestException("invalid_input: integrationSurface is required when decision=adopt");
    }
    if (decision === "adopt" && !targetRuntimeSurface) {
      throw new BadRequestException("invalid_input: targetRuntimeSurface is required when decision=adopt");
    }
    if (decision === "adopt" && !parsedProof) {
      throw new BadRequestException("invalid_input: integrationProof is required when decision=adopt and must include execution ok + artifact reference");
    }
    const integrationMode = decision === "adopt" ? this.integrationMode(body.integrationMode || "adapt") : null;
    const owner = decision === "adopt" ? this.s(body.owner) : null;
    if (decision === "adopt" && !owner) {
      throw new BadRequestException("invalid_input: owner is required when decision=adopt");
    }
    const dueAt = decision === "adopt" ? this.normalizeDueAt(body.dueAt) : null;
    const requiredGates = decision === "adopt" ? this.normalizeRequiredGates(body.requiredGates) : [];
    const rollbackPlan = decision === "adopt" ? this.s(body.rollbackPlan || body.rollbackNotes) : "";
    if (decision === "adopt" && !rollbackPlan) {
      throw new BadRequestException("invalid_input: rollbackPlan is required when decision=adopt");
    }
    const now = new Date().toISOString();
    const decisionId = randomUUID();
    const metadata = body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : {};
    this.sqlite.connection
      .prepare("INSERT INTO directive_decisions (id, user_id, project_id, capability_id, evaluation_id, decision, rationale, decided_by, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(decisionId, user.id, pid, capabilityId, evaluationId, decision, rationale, this.s(body.decidedBy) || "user", JSON.stringify(metadata), now);
    let integration: ReturnType<typeof this.parseIntegration> | null = null;
    let runtimeStatus = "none";
    if (decision === "adopt") {
      const normalizedIntegrationStatus = this.integrationStatus(body.integrationStatus || "active");
      const integrationId = randomUUID();
      this.sqlite.connection
        .prepare("INSERT INTO directive_integrations (id, user_id, project_id, capability_id, decision_id, status, integration_mode, integration_surface, target_runtime_surface, owner, due_at, required_gates_json, proof_artifact_path, rollback_plan, dependency_notes, rollback_notes, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(integrationId, user.id, pid, capabilityId, decisionId, normalizedIntegrationStatus, integrationMode, integrationSurface, targetRuntimeSurface, owner, dueAt, JSON.stringify(requiredGates), parsedProof?.artifact.artifactPath || null, rollbackPlan, this.s(body.dependencyNotes) || null, this.s(body.rollbackNotes) || null, JSON.stringify({ ...metadata, integrationProof: parsedProof }), now, now);
      const row = this.sqlite.connection
        .prepare("SELECT * FROM directive_integrations WHERE id = ?")
        .get(integrationId) as Record<string, unknown>;
      integration = this.parseIntegration(row);
      runtimeStatus = this.runtimeStatusFromIntegrationStatus(normalizedIntegrationStatus);
    }
    const nextStatus = decision === "adopt" && runtimeStatus === "callable" ? "integrated" : "decided";
    this.sqlite.connection
      .prepare("UPDATE directive_capabilities SET status = ?, framework_status = ?, runtime_status = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(nextStatus, "decided", runtimeStatus, now, user.id, pid, capabilityId);
    const report = this.createReport({
      userId: user.id,
      projectId: pid,
      title: `Directive decision: ${decision} - ${capability.title}`,
      content: [
        "# Directive Workspace Decision",
        "",
        `- capabilityId: ${capability.id}`,
        `- title: ${capability.title}`,
        `- sourceType: ${capability.sourceType}`,
        `- sourceRef: ${capability.sourceRef}`,
        `- decision: ${decision}`,
        `- rationale: ${rationale}`,
        integration ? `- integrationSurface: ${integration.integrationSurface}` : "- integrationSurface: none",
        `- decision_lead_time_hours: ${this.computeLeadTimeHours(capability.createdAt, now) ?? "unknown"}`,
        integration ? `- adopt_to_callable_lead_time_hours: ${this.computeLeadTimeHours(capability.createdAt, integration.updatedAt) ?? "unknown"}` : "- adopt_to_callable_lead_time_hours: pending",
      ].join("\n"),
      status: decision === "adopt" ? "success" : "info",
      metadata: { capabilityId, decisionId, integrationId: integration?.id || null, evaluationId, decision, integrationProof: parsedProof },
    });
    const capabilityUpdated = this.requireCapability(user.id, pid, capabilityId);
    const decisionRow = this.sqlite.connection
      .prepare("SELECT * FROM directive_decisions WHERE id = ?")
      .get(decisionId) as Record<string, unknown>;
    const parsedDecision = this.parseDecision(decisionRow);
    const decisionLeadTimeHours = this.computeLeadTimeHours(
      capabilityUpdated.createdAt,
      parsedDecision.createdAt,
    );
    return {
      capability: capabilityUpdated,
      decision: parsedDecision,
      integration,
      decisionLeadTimeHours,
      adoptToCallableLeadTimeHours:
        integration && decision === "adopt"
          ? this.computeLeadTimeHours(capability.createdAt, integration.updatedAt)
          : null,
      reportId: report.id,
      reportHref: this.reportHref(report.date),
    };
  }

  async createIntegrationProof(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    const capability = this.requireCapability(user.id, pid, capabilityId);
    const timestamp = new Date().toISOString();
    const method = this.s(body.method) || "dashboard-proof";
    const reference = this.s(body.reference) || `directive-workspace:${capability.id}:proof:${timestamp.replace(/[:.]/g, "-")}`;
    const summary = this.s(body.summary) || "Proof artifact generated from directive workspace workflow.";
    const workspaceRoot = path.resolve(path.dirname(this.sqlite.resolvedDbPath), "..");
    const artifactDir = path.resolve(workspaceRoot, "reports", "ops");
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = path.resolve(artifactDir, `directive-integration-proof-${capability.id}-${timestamp.replace(/[:.]/g, "-")}.md`);
    await writeFile(
      artifactPath,
      [
        "# Directive Integration Proof",
        "",
        `- capabilityId: ${capability.id}`,
        `- title: ${capability.title}`,
        `- sourceRef: ${capability.sourceRef}`,
        `- timestamp: ${timestamp}`,
        `- method: ${method}`,
        `- reference: ${reference}`,
        "",
        `Summary: ${summary}`,
      ].join("\n"),
      "utf8",
    );
    const report = this.createReport({
      userId: user.id,
      projectId: pid,
      title: `Directive integration proof: ${capability.title}`,
      content: [
        "# Directive Integration Proof",
        "",
        `- capabilityId: ${capability.id}`,
        `- sourceRef: ${capability.sourceRef}`,
        `- method: ${method}`,
        `- reference: ${reference}`,
        `- artifactPath: ${artifactPath}`,
        `- timestamp: ${timestamp}`,
        "",
        `Summary: ${summary}`,
      ].join("\n"),
      status: "success",
      metadata: { capabilityId: capability.id, integrationProof: { method, reference, timestamp, artifactPath } },
    });
    const integrationProof = {
      execution: { ok: true as const, method, reference, timestamp },
      artifact: { reportId: report.id, reportHref: this.reportHref(report.date), artifactPath, summary },
    };
    const mergedMetadata = { ...(capability.metadata || {}), latestIntegrationProof: integrationProof, latestIntegrationProofAt: timestamp };
    this.sqlite.connection
      .prepare("UPDATE directive_capabilities SET metadata_json = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(JSON.stringify(mergedMetadata), timestamp, user.id, pid, capabilityId);
    this.sqlite.connection
      .prepare("UPDATE directive_integrations SET proof_artifact_path = COALESCE(?, proof_artifact_path), updated_at = ? WHERE user_id = ? AND project_id = ? AND capability_id = ?")
      .run(artifactPath, timestamp, user.id, pid, capabilityId);
    return {
      capability: this.requireCapability(user.id, pid, capabilityId),
      integrationProof,
      reportId: report.id,
      reportHref: this.reportHref(report.date),
      artifactPath,
    };
  }

  runLifecycle(capabilityId: string, body: Record<string, unknown>) {
    const user = this.operator();
    const pid = this.projectId(body.projectId);
    const capability = this.requireCapability(user.id, pid, capabilityId);
    const capabilityIdValue = this.s(capability.id);
    const sourceRef = this.s(capability.sourceRef);
    const candidate = this.s(body.candidate) || capability.title || this.inferTitle(sourceRef);
    const parsedAdmissionScore = Number(body.admissionScore);
    const admissionScore = Number.isFinite(parsedAdmissionScore) ? parsedAdmissionScore : null;
    const source = this.s(body.source) || "directive-workspace.lifecycle";

    const existing = this.getCapabilityLifecycle(capabilityId, pid);
    const latestDecision = existing.decisions[0] || null;

    let experimentId: string | null = null;
    let evaluationId: string | null = null;
    let decisionId: string | null = this.s(latestDecision?.id) || null;
    let reportId: string | null = null;
    let reportHref: string | null = null;

    if (!latestDecision) {
      const experiment = this.createExperiment(capabilityId, {
        projectId: pid,
        hypothesis: "This promoted candidate should improve capability-adoption workflow quality with bounded integration risk.",
        plan: "1. confirm candidate exists in directive registry\n2. run bounded experiment record only (no broad rollout)\n3. capture evaluation evidence and explicit decision",
        successCriteria: [
          "registry entry is present",
          "evaluation evidence is written",
          "adopt decision has rollback notes",
        ],
        status: "running",
        artifactPath: `reports/ops/directive-lifecycle-${capability.id}.md`,
        metadata: {
          seededFrom: "runDirectiveCapabilityLifecycle",
          candidate,
          sourceRef,
          source,
        },
      });
      experimentId = this.s(experiment.id) || null;

      const evaluation = this.recordEvaluation(capabilityId, {
        projectId: pid,
        experimentId: experiment.id,
        outcome: "positive",
        usefulness: "Converts static admission into tracked lifecycle state with evidence and decision history.",
        friction: "Requires API/operator discipline until full UI workflows are added.",
        workflowImpact: "Improves reproducibility of adopt/reject decisions and rollback visibility.",
        evidenceSummary: "Capability progressed through experiment and evaluation with deterministic records.",
        metadata: {
          candidate,
          sourceRef,
          admissionScore,
          source,
        },
      });
      evaluationId = this.s(evaluation.id) || null;

      const decision = this.recordDecision(capabilityId, {
        projectId: pid,
        evaluationId: evaluation.id,
        decision: "adopt",
        rationale: "Promoted candidate with positive bounded evaluation; adoption is tracked with explicit rollback notes.",
        decidedBy: this.s(body.decidedBy) || "operator",
        integrationSurface: sourceRef,
        targetRuntimeSurface: sourceRef,
        integrationStatus: "active",
        integrationMode: "adapt",
        owner: this.s(body.owner) || "operator",
        dueAt:
          this.s(body.dueAt) ||
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        requiredGates:
          Array.isArray(body.requiredGates) && body.requiredGates.length > 0
            ? body.requiredGates
            : [
                "npm run check:directive-v0",
                "npm run check:directive-integration-proof",
                "npm run check:ops-stack",
              ],
        dependencyNotes: "Depends on mc-operator directive lifecycle APIs and run/report repositories.",
        rollbackNotes: "Set integration status to parked and add decision note before removing dependent workflows.",
        rollbackPlan:
          this.s(body.rollbackPlan) ||
          "Set integration status to parked, keep proof artifacts, and roll back runtime callable wiring in Mission Control.",
        integrationProof: body.integrationProof,
        metadata: {
          candidate,
          sourceRef,
          admissionScore,
          source,
        },
      });
      decisionId = this.s(decision.decision.id) || null;
      reportId = this.s(decision.reportId) || null;
      reportHref = this.s(decision.reportHref) || null;
    }

    const lifecycle = this.getCapabilityLifecycle(capabilityId, pid);
    const registry = this.listRegistry(pid);
    const registryRow = registry.find(
      (row) => this.s(row.capability.id) === capabilityIdValue,
    );
    const latestLifecycleDecision = lifecycle.decisions[0] || null;
    const decisionValue = String(
      latestLifecycleDecision?.decision || latestDecision?.decision || "",
    );
    const requiresIntegration = decisionValue === "adopt";
    const ok =
      !!registryRow &&
      lifecycle.decisions.length >= 1 &&
      (!requiresIntegration || lifecycle.integrations.length >= 1);

    return {
      ok,
      capabilityId: capabilityIdValue,
      sourceRef,
      lifecycle: {
        status: lifecycle.capability.status,
        experiments: lifecycle.experiments.length,
        evaluations: lifecycle.evaluations.length,
        decisions: lifecycle.decisions.length,
        integrations: lifecycle.integrations.length,
      },
      created: {
        experimentId,
        evaluationId,
        decisionId,
        reportId,
        reportHref,
      },
      verification: {
        registryRowPresent: !!registryRow,
        existingDecisionId: this.s(latestDecision?.id) || null,
        skippedBecauseDecisionExists: !!latestDecision,
      },
    };
  }

  private resolveDirectiveArchitectureRoot() {
    const workspaceRoot = this.resolveWorkspaceRoot();
    return path.resolve(
      workspaceRoot,
      "directive-workspace",
      "architecture",
    );
  }

  private resolveDirectiveWorkspaceRoot() {
    return path.resolve(this.resolveWorkspaceRoot(), "directive-workspace");
  }

  private resolveDirectiveForgeRoot() {
    return path.resolve(this.resolveDirectiveWorkspaceRoot(), "forge");
  }

  private resolveDirectiveDiscoveryRoot() {
    return path.resolve(this.resolveDirectiveWorkspaceRoot(), "discovery");
  }

  private resolveWorkspaceRoot() {
    return path.resolve(
      path.dirname(this.sqlite.resolvedDbPath),
      "..",
      "..",
    );
  }

  private resolveDirectiveForgeHandoffPath() {
    return path.resolve(
      this.resolveWorkspaceRoot(),
      "mc-operator",
      "docs",
      "operations",
      "DIRECTIVE_FORGE_HANDOFF_FROM_V1_RECHECK_2026-03-19.md",
    );
  }

  private readTextFileSafe(filePath?: string | null) {
    if (!filePath || !existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }

  private parseDeferredRecheckIndex(markdown: string | null) {
    const index = new Map<
      string,
      "promote_to_queue" | "defer_monitor" | "still_reject"
    >();
    if (!markdown) return index;
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      const columns = line
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim().replace(/`/g, ""));
      if (columns.length < 3) continue;
      const candidate = this.s(columns[0]);
      const newStatus = this.s(columns[2]).toLowerCase();
      if (!candidate || candidate.toLowerCase() === "candidate") continue;
      if (candidate.toLowerCase() === "record" || candidate.endsWith(".md")) continue;
      if (
        newStatus !== "promote_to_queue" &&
        newStatus !== "defer_monitor" &&
        newStatus !== "still_reject"
      ) {
        continue;
      }
      index.set(
        this.normalizedKey(candidate),
        newStatus as "promote_to_queue" | "defer_monitor" | "still_reject",
      );
    }
    return index;
  }

  private parseForgeFollowUpCandidates(markdown: string | null) {
    const candidates = new Set<string>();
    if (!markdown) return candidates;
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      const columns = line
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim().replace(/`/g, ""));
      if (columns.length < 2) continue;
      const candidate = this.s(columns[0]);
      if (!candidate || candidate.toLowerCase() === "candidate") continue;
      candidates.add(this.normalizedKey(candidate));
    }
    return candidates;
  }

  private normalizedKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
  }

  private hasStrictLifecycleArtifactsShape(
    value: unknown,
    capabilityId?: string | null,
  ) {
    if (!this.isRecord(value)) return false;
    const analysisEvidence = this.isRecord(value.analysisEvidence)
      ? value.analysisEvidence
      : null;
    const citationSet = this.isRecord(value.citationSet) ? value.citationSet : null;
    const evaluationSupport = this.isRecord(value.evaluationSupport)
      ? value.evaluationSupport
      : null;
    if (!analysisEvidence || !citationSet || !evaluationSupport) return false;

    const analysisCapabilityId = this.s(analysisEvidence.capability_id);
    const citationCapabilityId = this.s(citationSet.capability_id);
    const evaluationCapabilityId = this.s(evaluationSupport.capability_id);
    if (!analysisCapabilityId || !citationCapabilityId || !evaluationCapabilityId) {
      return false;
    }
    const expectedCapabilityId = this.s(capabilityId);
    if (
      expectedCapabilityId &&
      (analysisCapabilityId !== expectedCapabilityId ||
        citationCapabilityId !== expectedCapabilityId ||
        evaluationCapabilityId !== expectedCapabilityId)
    ) {
      return false;
    }

    const collectionStatus = this.s(analysisEvidence.collection_status);
    const coverageStatus = this.s(citationSet.coverage_status);
    const evidenceItems = analysisEvidence.evidence_items;
    const citations = citationSet.citations;
    const referenceMarkdown = this.s(citationSet.reference_section_markdown);
    const sourceUrls = evaluationSupport.source_urls;
    const visitedUrls = evaluationSupport.visited_urls;
    const researchCosts = this.isRecord(evaluationSupport.research_costs)
      ? evaluationSupport.research_costs
      : null;
    const totalUsd = Number(researchCosts?.total_usd);
    const qualitySignals = evaluationSupport.quality_signals;

    if (!Array.isArray(evidenceItems) || !Array.isArray(citations)) return false;
    if (!Array.isArray(sourceUrls) || !Array.isArray(visitedUrls)) return false;
    if (!researchCosts || !Number.isFinite(totalUsd) || totalUsd < 0) return false;
    if (!this.isRecord(qualitySignals)) return false;
    if (!referenceMarkdown) return false;
    if (!["complete", "partial", "empty"].includes(collectionStatus)) return false;
    if (!["complete", "partial", "missing"].includes(coverageStatus)) return false;

    return true;
  }

  private buildLifecycleArtifactCoverage(projectId?: unknown) {
    const registry = this.listRegistry(projectId);
    const strictRequiredStatuses = new Set(["evaluated", "decided", "integrated"]);
    const strictRows = registry.filter((row) =>
      strictRequiredStatuses.has(this.s(row.capability.status)),
    );

    const strictRequiredCapabilities = strictRows.length;
    let strictBoundCapabilities = 0;
    let strictMissingCapabilities = 0;
    let strictValidCapabilities = 0;
    let strictInvalidCapabilities = 0;

    for (const row of strictRows) {
      const evaluations = Array.isArray(row.evaluations) ? row.evaluations : [];
      const strictEvaluations = evaluations.filter((evaluation) => {
        const metadata = this.isRecord(evaluation.metadata) ? evaluation.metadata : null;
        return Number(metadata?.lifecycleArtifactVersion) === 1;
      });
      const hasStrictArtifacts = strictEvaluations.length > 0;
      if (hasStrictArtifacts) {
        strictBoundCapabilities += 1;
      } else {
        strictMissingCapabilities += 1;
      }

      const strictValid = hasStrictArtifacts
        ? strictEvaluations.every((evaluation) => {
            const metadata = this.isRecord(evaluation.metadata) ? evaluation.metadata : null;
            return this.hasStrictLifecycleArtifactsShape(
              metadata?.lifecycleArtifacts,
              this.s(row.capability.id) || null,
            );
          })
        : false;

      if (strictValid) {
        strictValidCapabilities += 1;
      } else if (hasStrictArtifacts) {
        strictInvalidCapabilities += 1;
      }
    }

    const strictCoveragePercent =
      strictRequiredCapabilities > 0
        ? Math.round((strictBoundCapabilities / strictRequiredCapabilities) * 10000) /
          100
        : 100;
    const strictValidCoveragePercent =
      strictRequiredCapabilities > 0
        ? Math.round((strictValidCapabilities / strictRequiredCapabilities) * 10000) / 100
        : 100;

    return {
      strictRequiredCapabilities,
      strictBoundCapabilities,
      strictMissingCapabilities,
      strictValidCapabilities,
      strictInvalidCapabilities,
      strictCoveragePercent,
      strictValidCoveragePercent,
    };
  }

  private readDirectoryNames(dirPath: string) {
    if (!existsSync(dirPath)) return [] as string[];
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  }

  private readMarkdownFiles(dirPath: string) {
    if (!existsSync(dirPath)) return [] as Array<{ name: string; path: string; mtimeMs: number }>;
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => {
        const filePath = path.resolve(dirPath, entry.name);
        const stats = statSync(filePath);
        return {
          name: entry.name,
          path: filePath,
          mtimeMs: stats.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  private readRecordMarkdownFiles(dirPath: string, ignoredNames: string[] = ["README.md"]) {
    const ignored = new Set(ignoredNames.map((name) => name.toLowerCase()));
    return this.readMarkdownFiles(dirPath).filter(
      (file) => !ignored.has(file.name.toLowerCase()),
    );
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    if (!existsSync(filePath)) return fallback;
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  private buildDiscoveryOverview() {
    const rootPath = this.resolveDirectiveDiscoveryRoot();
    const intake = this.readRecordMarkdownFiles(path.resolve(rootPath, "intake"));
    const triage = this.readRecordMarkdownFiles(path.resolve(rootPath, "triage"));
    const routing = this.readRecordMarkdownFiles(path.resolve(rootPath, "routing-log"));
    const monitor = this.readRecordMarkdownFiles(path.resolve(rootPath, "monitor"));
    const deferredOrRejected = this.readRecordMarkdownFiles(
      path.resolve(rootPath, "deferred-or-rejected"),
    );
    const reference = this.readRecordMarkdownFiles(path.resolve(rootPath, "reference"));
    const queueDocument = this.readJsonFile<{
      entries?: Array<{
        candidate_id: string;
        candidate_name: string;
        source_type: string;
        source_reference: string;
        received_at: string;
        status: string;
        routing_target?: string | null;
        mission_alignment?: string | null;
        capability_gap_id?: string | null;
        fast_path_record_path?: string | null;
        routing_record_path?: string | null;
        result_record_path?: string | null;
        routed_at?: string | null;
        completed_at?: string | null;
        notes?: string | null;
      }>;
    }>(path.resolve(rootPath, "..", "intake-queue.json"), { entries: [] });
    const recentEntries = (queueDocument.entries || [])
      .slice()
      .map((entry) => ({
        entry,
        sortTime: Math.max(
          new Date(entry.completed_at || "1970-01-01").getTime(),
          new Date(entry.routed_at || "1970-01-01").getTime(),
          new Date(entry.received_at || "1970-01-01").getTime(),
        ),
      }))
      .sort((a, b) => {
        return b.sortTime - a.sortTime;
      })
      .slice(0, 8)
      .map(({ entry }) => ({
        candidateId: entry.candidate_id,
        candidateName: entry.candidate_name,
        sourceType: entry.source_type,
        sourceReference: entry.source_reference,
        receivedAt: entry.received_at,
        status: entry.status,
        routingTarget: entry.routing_target || null,
        missionAlignment: entry.mission_alignment || null,
        capabilityGapId: entry.capability_gap_id || null,
        fastPathRecordPath: entry.fast_path_record_path || null,
        routingRecordPath: entry.routing_record_path || null,
        resultRecordPath: entry.result_record_path || null,
        routedAt: entry.routed_at || null,
        completedAt: entry.completed_at || null,
        notes: entry.notes || null,
      }));

    return {
      rootPath,
      counts: {
        intake: intake.length,
        triage: triage.length,
        routing: routing.length,
        monitor: monitor.length,
        deferredOrRejected: deferredOrRejected.length,
        reference: reference.length,
      },
      latest: {
        intake: intake[0] || null,
        triage: triage[0] || null,
        routing: routing[0] || null,
      },
      workflow: {
        currentFocus:
          routing.length > 0
            ? "Discovery routing active"
            : triage.length > 0
              ? "Discovery triage active"
              : intake.length > 0
                ? "Discovery intake queued"
                : "Discovery structure ready; no active records yet",
      },
      queues: {
        intake: intake.map((file) => file.name),
        triage: triage.map((file) => file.name),
        routing: routing.map((file) => file.name),
        monitor: monitor.map((file) => file.name),
        deferredOrRejected: deferredOrRejected.map((file) => file.name),
        reference: reference.map((file) => file.name),
      },
      recentEntries,
    };
  }

  private latestByCandidate(
    files: Array<{ name: string; path: string; mtimeMs: number }>,
    intakeByKey: Map<string, string>,
  ) {
    const map = new Map<string, { name: string; path: string; mtimeMs: number }>();
    for (const file of files) {
      const inferred = this.inferCandidateNameFromArtifactName(file.name, intakeByKey);
      if (!inferred) continue;
      const key = this.normalizedKey(inferred);
      const existing = map.get(key);
      if (!existing || file.mtimeMs > existing.mtimeMs) {
        map.set(key, file);
      }
    }
    return map;
  }

  private inferCandidateNameFromArtifactName(
    fileName: string,
    intakeByKey: Map<string, string>,
  ) {
    const base = fileName.replace(/\.md$/i, "");
    const strippedDate = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const ignoredNames = new Set([
      "low-tier-decisions",
      "day3-parked-candidates",
      "day3-top3-closure",
      "recheck-deferred-rejected-v2",
      "adopted-candidates-architecture-recheck",
      "remaining-candidates-execution-plan",
      "directive-v1-architecture-recheck-lock",
      "directive-v1-recheck-lock",
    ]);
    if (ignoredNames.has(strippedDate)) return null;

    const patterns = [
      /-directive-architecture-adopted-planned-next$/i,
      /-directive-architecture-slice$/i,
      /-slice-\d+-adopted-planned-next$/i,
      /-slice-\d+-execution$/i,
      /-slice-\d+-deferred$/i,
      /-slice-\d+$/i,
      /-experiment$/i,
      /-adopted-planned-next$/i,
      /-execution$/i,
      /-deferred$/i,
    ];

    let candidate = strippedDate;
    for (const pattern of patterns) {
      candidate = candidate.replace(pattern, "");
    }
    if (!candidate) return null;

    const key = this.normalizedKey(candidate);
    return intakeByKey.get(key) || candidate;
  }

  private resolveArchitectureDecision(input: {
    stage:
      | "adopted"
      | "deferred_or_rejected"
      | "experimenting"
      | "triaged"
      | "intake";
    candidateName: string;
    deferredRecheckIndex: Map<
      string,
      "promote_to_queue" | "defer_monitor" | "still_reject"
    >;
    forgeFollowUpCandidates: Set<string>;
  }): {
    decisionState:
      | "accept_for_architecture"
      | "route_to_forge_follow_up"
      | "experiment"
      | "monitor"
      | "defer"
      | "reject"
      | "knowledge_only"
      | null;
    adoptionTarget:
      | "Directive Architecture"
      | "Directive Forge follow-up"
      | "Directive Discovery backlog"
      | "Knowledge/reference only"
      | null;
    followUpTarget: "Directive Forge follow-up" | null;
    hasForgeFollowUp: boolean;
  } {
    const key = this.normalizedKey(input.candidateName);
    const deferredDecision = input.deferredRecheckIndex.get(key) || null;
    const hasForgeFollowUp = input.forgeFollowUpCandidates.has(key);
    let decisionState:
      | "accept_for_architecture"
      | "route_to_forge_follow_up"
      | "experiment"
      | "monitor"
      | "defer"
      | "reject"
      | "knowledge_only"
      | null = null;
    let adoptionTarget:
      | "Directive Architecture"
      | "Directive Forge follow-up"
      | "Directive Discovery backlog"
      | "Knowledge/reference only"
      | null = null;
    let followUpTarget: "Directive Forge follow-up" | null = null;

    if (input.stage === "adopted") {
      decisionState = "accept_for_architecture";
      adoptionTarget = "Directive Architecture";
      if (hasForgeFollowUp) {
        followUpTarget = "Directive Forge follow-up";
      }
    } else if (input.stage === "experimenting") {
      decisionState = "experiment";
      adoptionTarget = "Directive Architecture";
    } else if (input.stage === "deferred_or_rejected") {
      if (deferredDecision === "promote_to_queue") {
        decisionState = "experiment";
        adoptionTarget = "Directive Architecture";
      } else if (deferredDecision === "defer_monitor") {
        decisionState = "monitor";
        adoptionTarget = "Knowledge/reference only";
      } else if (deferredDecision === "still_reject") {
        decisionState = "reject";
        adoptionTarget = "Knowledge/reference only";
      } else {
        decisionState = "defer";
        adoptionTarget = "Knowledge/reference only";
      }
    } else if (input.stage === "triaged" || input.stage === "intake") {
      decisionState = null;
      adoptionTarget = null;
    }

    return {
      decisionState,
      adoptionTarget,
      followUpTarget,
      hasForgeFollowUp,
    };
  }

  getArchitectureOverview() {
    const rootPath = this.resolveDirectiveArchitectureRoot();
    const intakePath = path.resolve(rootPath, "00-intake");
    const triagePath = path.resolve(rootPath, "01-triage");
    const experimentsPath = path.resolve(rootPath, "02-experiments");
    const adoptedPath = path.resolve(rootPath, "03-adopted");
    const deferredPath = path.resolve(rootPath, "04-deferred-or-rejected");

    if (!existsSync(rootPath)) {
      return {
        ok: false,
        error: "architecture_lab_missing",
        rootPath,
      };
    }

    const intakeCandidates = this.readDirectoryNames(intakePath);
    const triageFiles = this.readMarkdownFiles(triagePath).filter(
      (file) => file.name !== "INTAKE_CHECKLIST.md",
    );
    const experimentFiles = this.readMarkdownFiles(experimentsPath);
    const adoptedFiles = this.readMarkdownFiles(adoptedPath);
    const deferredFiles = this.readMarkdownFiles(deferredPath);
    const deferredDirectories = this.readDirectoryNames(deferredPath);
    const canonicalDirectoryNames = [...intakeCandidates, ...deferredDirectories];
    const intakeByKey = new Map(
      canonicalDirectoryNames.map((candidateName) => [
        this.normalizedKey(candidateName),
        candidateName,
      ]),
    );
    const deferredDirByKey = new Map(
      deferredDirectories.map((candidateName) => [
        this.normalizedKey(candidateName),
        candidateName,
      ]),
    );
    const triageByCandidate = this.latestByCandidate(triageFiles, intakeByKey);
    const experimentByCandidate = this.latestByCandidate(experimentFiles, intakeByKey);
    const adoptedByCandidate = this.latestByCandidate(adoptedFiles, intakeByKey);
    const deferredByCandidate = this.latestByCandidate(deferredFiles, intakeByKey);
    const deferredRecheckFile = deferredFiles.find((file) =>
      this.normalizedKey(file.name).includes("recheckdeferredrejectedv2"),
    );
    const deferredRecheckIndex = this.parseDeferredRecheckIndex(
      this.readTextFileSafe(deferredRecheckFile?.path || null),
    );
    const forgeFollowUpCandidates = this.parseForgeFollowUpCandidates(
      this.readTextFileSafe(this.resolveDirectiveForgeHandoffPath()),
    );

    const candidateNameSet = new Set([...intakeCandidates, ...deferredDirectories]);
    for (const file of [...experimentFiles, ...adoptedFiles, ...deferredFiles]) {
      const inferred = this.inferCandidateNameFromArtifactName(file.name, intakeByKey);
      if (inferred) candidateNameSet.add(inferred);
    }
    const candidateNames = [...candidateNameSet].sort((a, b) => a.localeCompare(b));

    const candidates = candidateNames.map((candidateName) => {
      const candidateKey = this.normalizedKey(candidateName);
      const adoptedEvidence = adoptedByCandidate.get(candidateKey) || null;
      const deferredEvidence = deferredByCandidate.get(candidateKey) || null;
      const experimentEvidence = experimentByCandidate.get(candidateKey) || null;
      const triageEvidence = triageByCandidate.get(candidateKey) || null;
      const deferredDirName = deferredDirByKey.get(candidateKey);
      const deferredDirectoryEvidence = deferredDirName
        ? (() => {
            const dirPath = path.resolve(deferredPath, deferredDirName);
            return {
              name: deferredDirName,
              path: dirPath,
              // Folder-level deferred state is treated as authoritative when no
              // adopted/experiment evidence exists for the same candidate.
              mtimeMs: Number.MAX_SAFE_INTEGER,
            };
          })()
        : null;

      let stage:
        | "adopted"
        | "deferred_or_rejected"
        | "experimenting"
        | "triaged"
        | "intake" = "intake";
      let evidencePath: string | null = null;

      const stageOrder: Record<
        "adopted" | "deferred_or_rejected" | "experimenting" | "triaged",
        number
      > = {
        adopted: 0,
        deferred_or_rejected: 1,
        experimenting: 2,
        triaged: 3,
      };
      const evidenceByStage: Array<{
        stage: "adopted" | "deferred_or_rejected" | "experimenting" | "triaged";
        file: { name: string; path: string; mtimeMs: number };
      }> = [];
      if (adoptedEvidence) evidenceByStage.push({ stage: "adopted", file: adoptedEvidence });
      if (deferredEvidence) {
        evidenceByStage.push({ stage: "deferred_or_rejected", file: deferredEvidence });
      }
      if (deferredDirectoryEvidence && !adoptedEvidence && !experimentEvidence) {
        evidenceByStage.push({
          stage: "deferred_or_rejected",
          file: deferredDirectoryEvidence,
        });
      }
      if (experimentEvidence) {
        evidenceByStage.push({ stage: "experimenting", file: experimentEvidence });
      }
      if (triageEvidence) evidenceByStage.push({ stage: "triaged", file: triageEvidence });

      if (evidenceByStage.length > 0) {
        const latestEvidence = evidenceByStage.sort((a, b) => {
          if (a.file.mtimeMs !== b.file.mtimeMs) return b.file.mtimeMs - a.file.mtimeMs;
          return stageOrder[a.stage] - stageOrder[b.stage];
        })[0];
        stage = latestEvidence.stage;
        evidencePath = latestEvidence.file.path;
      }

      const decision = this.resolveArchitectureDecision({
        stage,
        candidateName,
        deferredRecheckIndex,
        forgeFollowUpCandidates,
      });

      return {
        name: candidateName,
        stage,
        evidencePath,
        decisionState: decision.decisionState,
        adoptionTarget: decision.adoptionTarget,
        followUpTarget: decision.followUpTarget,
        hasForgeFollowUp: decision.hasForgeFollowUp,
      };
    });

    const stageCounts = candidates.reduce(
      (acc, candidate) => {
        acc[candidate.stage] += 1;
        return acc;
      },
      {
        adopted: 0,
        deferred_or_rejected: 0,
        experimenting: 0,
        triaged: 0,
        intake: 0,
      },
    );
    const decisionCounts = candidates.reduce(
      (acc, candidate) => {
        if (candidate.decisionState === "accept_for_architecture") {
          acc.accept_for_architecture += 1;
        } else if (candidate.decisionState === "experiment") {
          acc.experiment += 1;
        } else if (candidate.decisionState === "monitor") {
          acc.monitor += 1;
        } else if (candidate.decisionState === "defer") {
          acc.defer += 1;
        } else if (candidate.decisionState === "reject") {
          acc.reject += 1;
        } else if (candidate.decisionState === "knowledge_only") {
          acc.knowledge_only += 1;
        } else if (candidate.decisionState === "route_to_forge_follow_up") {
          acc.route_to_forge_follow_up += 1;
        } else {
          acc.undecided += 1;
        }
        if (candidate.followUpTarget === "Directive Forge follow-up") {
          acc.forge_follow_up += 1;
        }
        return acc;
      },
      {
        accept_for_architecture: 0,
        route_to_forge_follow_up: 0,
        experiment: 0,
        monitor: 0,
        defer: 0,
        reject: 0,
        knowledge_only: 0,
        forge_follow_up: 0,
        undecided: 0,
      },
    );

    const closureFile = experimentFiles.find((file) =>
      this.normalizedKey(file.name).includes("day3top3closure"),
    );
    const closureExcerpt = closureFile
      ? readFileSync(closureFile.path, "utf8").split(/\r?\n/).slice(0, 18).join("\n")
      : null;

    return {
      ok: true,
      rootPath,
      snapshotAt: new Date().toISOString(),
      counts: {
        intakeCandidates: intakeCandidates.length,
        triageNotes: triageFiles.length,
        experimentNotes: experimentFiles.length,
        adoptedNotes: adoptedFiles.length,
        deferredNotes: deferredFiles.length,
      },
      stageCounts,
      decisionCounts,
      latest: {
        triage: triageFiles[0] || null,
        experiment: experimentFiles[0] || null,
        adopted: adoptedFiles[0] || null,
        deferred: deferredFiles[0] || null,
      },
      workflow: {
        currentFocus:
          candidates.some((candidate) => candidate.decisionState === "experiment")
            ? "Bounded experiment queue active"
            : candidates.some(
                  (candidate) =>
                    candidate.followUpTarget === "Directive Forge follow-up",
                )
              ? "Architecture acceptance complete for selected patterns; Forge follow-up queued"
              : "No active architecture experiment detected from artifact scan",
        adoptedPlannedNext: candidates
          .filter(
            (candidate) =>
              candidate.decisionState === "accept_for_architecture",
          )
          .map((candidate) => candidate.name),
        acceptedForArchitecture: candidates
          .filter(
            (candidate) =>
              candidate.decisionState === "accept_for_architecture",
          )
          .map((candidate) => candidate.name),
        forgeFollowUp: candidates
          .filter(
            (candidate) =>
              candidate.followUpTarget === "Directive Forge follow-up",
          )
          .map((candidate) => candidate.name),
        inExperiment: candidates
          .filter((candidate) => candidate.decisionState === "experiment")
          .map((candidate) => candidate.name),
        monitorOrDefer: candidates
          .filter(
            (candidate) =>
              candidate.decisionState === "monitor" ||
              candidate.decisionState === "defer",
          )
          .map((candidate) => candidate.name),
        rejectOrReference: candidates
          .filter(
            (candidate) =>
              candidate.decisionState === "reject" ||
              candidate.decisionState === "knowledge_only",
          )
          .map((candidate) => candidate.name),
        pending: candidates
          .filter(
            (candidate) =>
              candidate.stage === "triaged" || candidate.stage === "intake",
          )
          .map((candidate) => candidate.name),
      },
      closure: {
        path: closureFile?.path || null,
        excerpt: closureExcerpt,
      },
      candidates,
    };
  }

  getStandaloneWorkspaceOverview() {
    const rootPath = this.resolveDirectiveWorkspaceRoot();
    const forgeRoot = this.resolveDirectiveForgeRoot();

    if (!existsSync(rootPath)) {
      return {
        ok: false,
        error: "directive_workspace_missing",
        rootPath,
      };
    }

    const discovery = this.buildDiscoveryOverview();

    const forgeFollowUp = this.readRecordMarkdownFiles(
      path.resolve(forgeRoot, "follow-up"),
    );
    const forgeRecords = this.readRecordMarkdownFiles(
      path.resolve(forgeRoot, "records"),
    );
    const forgePromotions = this.readRecordMarkdownFiles(
      path.resolve(forgeRoot, "promotion-records"),
    );
    const forgeRegistry = this.readRecordMarkdownFiles(
      path.resolve(forgeRoot, "registry"),
    );
    const forgeCoreModules = readdirSync(path.resolve(forgeRoot, "core"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".ts"))
      .filter((entry) => !entry.name.toLowerCase().endsWith(".d.ts"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const architecture = this.getArchitectureOverview();
    const lifecycleArtifactCoverage = this.buildLifecycleArtifactCoverage(
      "mc-operator",
    );

    return {
      ok: true,
      rootPath,
      snapshotAt: new Date().toISOString(),
      discovery,
      forge: {
        rootPath: forgeRoot,
        counts: {
          followUp: forgeFollowUp.length,
          records: forgeRecords.length,
          promotionRecords: forgePromotions.length,
          registry: forgeRegistry.length,
          coreModules: forgeCoreModules.length,
        },
        latest: {
          followUp: forgeFollowUp[0] || null,
          record: forgeRecords[0] || null,
          promotion: forgePromotions[0] || null,
          registry: forgeRegistry[0] || null,
        },
        lifecycleArtifacts: lifecycleArtifactCoverage,
        workflow: {
          currentFocus:
            forgeRecords.length > 0
              ? "Forge execution active"
              : forgePromotions.length > 0
                ? "Forge promotion path active"
                : forgeFollowUp.length > 0
                  ? "Forge follow-up queued"
                  : "Forge structure ready; no active runtime follow-up record yet",
          host: "Mission Control",
          runtimeHosted: true,
        },
      },
      architecture: architecture.ok
        ? {
            rootPath: architecture.rootPath,
            counts: architecture.counts,
            decisionCounts: architecture.decisionCounts,
            workflow: {
              currentFocus:
                architecture.workflow?.currentFocus ||
                "No active architecture workflow detected",
            },
          }
        : {
            rootPath: architecture.rootPath,
            error: architecture.error || "architecture_unavailable",
          },
    };
  }

  getDiscoveryOverview() {
    const rootPath = this.resolveDirectiveDiscoveryRoot();
    if (!existsSync(rootPath)) {
      return {
        ok: false,
        error: "discovery_missing",
        rootPath,
      };
    }

    return {
      ok: true,
      snapshotAt: new Date().toISOString(),
      ...this.buildDiscoveryOverview(),
    };
  }

  listRegistry(projectId?: unknown, status?: unknown) {
    const capabilities = this.listCapabilities(projectId);
    const statusFilter = status !== undefined && this.s(status) ? this.status(status) : null;
    return capabilities
      .map((capability) => {
        const experiments = this.sqlite.connection
          .prepare("SELECT * FROM directive_experiments WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
          .all(capability.userId, capability.projectId, capability.id) as Array<Record<string, unknown>>;
        const evaluations = this.sqlite.connection
          .prepare("SELECT * FROM directive_evaluations WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
          .all(capability.userId, capability.projectId, capability.id) as Array<Record<string, unknown>>;
        const decisions = this.sqlite.connection
          .prepare("SELECT * FROM directive_decisions WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
          .all(capability.userId, capability.projectId, capability.id) as Array<Record<string, unknown>>;
        const integrations = this.sqlite.connection
          .prepare("SELECT * FROM directive_integrations WHERE user_id = ? AND project_id = ? AND capability_id = ? ORDER BY created_at DESC")
          .all(capability.userId, capability.projectId, capability.id) as Array<Record<string, unknown>>;
        const parsedDecisions = decisions.map((row) => this.parseDecision(row));
        const parsedIntegrations = integrations.map((row) => this.parseIntegration(row));
        const latestDecision = parsedDecisions[0] || null;
        const decisionLeadTimeHours = latestDecision
          ? this.computeLeadTimeHours(capability.createdAt, latestDecision.createdAt)
          : null;
        const callableIntegration = parsedIntegrations.find(
          (integration) => this.s(integration.status) === "active",
        );
        const adoptToCallableLeadTimeHours =
          latestDecision?.decision === "adopt" && callableIntegration
            ? this.computeLeadTimeHours(capability.createdAt, callableIntegration.updatedAt)
            : null;
        return {
          capability,
          experiments: experiments.map((row) => this.parseExperiment(row)),
          evaluations: evaluations.map((row) => this.parseEvaluation(row)),
          decisions: parsedDecisions,
          latestDecision,
          integrations: parsedIntegrations,
          decisionLeadTimeHours,
          adoptToCallableLeadTimeHours,
        };
      })
      .filter((row) => (statusFilter ? row.capability.status === statusFilter : true));
  }
}
