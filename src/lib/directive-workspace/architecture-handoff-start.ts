// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-handoff-start.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";

export type DirectiveArchitectureHandoffStartResult = {
  ok: true;
  created: boolean;
  snapshotAt: string;
  directiveRoot: string;
  handoffRelativePath: string;
  handoffAbsolutePath: string;
  startRelativePath: string;
  startAbsolutePath: string;
  candidateId: string;
  candidateName: string;
  usefulnessLevel: string;
  usefulnessRationale: string;
  objective: string;
};

export type DirectiveArchitectureHandoffArtifact = {
  title: string;
  date: string;
  status: string;
  candidateId: string;
  sourceReference: string;
  engineRunRecordPath: string | null;
  engineRunReportPath: string | null;
  discoveryRoutingRecordPath: string | null;
  usefulnessLevel: string;
  usefulnessRationale: string;
  objective: string;
  boundedScope: string[];
  inputs: string[];
  validationGates: string[];
  runtimeThresholdCheck: string;
  rollback: string;
  nextDecision: string[];
  directiveRoot: string;
  handoffRelativePath: string;
  handoffAbsolutePath: string;
  startRelativePath: string | null;
  startAbsolutePath: string | null;
  startExists: boolean;
  resultRelativePath: string;
  resultAbsolutePath: string;
  resultExists: boolean;
};

type ParsedArchitectureHandoff = Omit<
  DirectiveArchitectureHandoffArtifact,
  | "directiveRoot"
  | "handoffRelativePath"
  | "handoffAbsolutePath"
  | "startRelativePath"
  | "startAbsolutePath"
  | "startExists"
  | "resultRelativePath"
  | "resultAbsolutePath"
  | "resultExists"
>;

function normalizeDirectiveWorkspaceRoot(directiveRoot?: string) {
  const root = directiveRoot
    ? path.resolve(directiveRoot)
    : path.resolve(
        process.env.DIRECTIVE_WORKSPACE_ROOT
        || process.env.DIRECTIVE_WORKSPACE_ROOT_OVERRIDE
        || path.resolve(process.cwd(), "..", "directive-workspace"),
      );
  return root.replace(/\\/g, "/");
}

function requireDirectiveString(value: string | null | undefined, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`invalid_input: ${fieldName} is required`);
  }
  return value.trim();
}

function resolveDirectiveWorkspaceRelativePath(
  directiveRoot: string,
  inputPath: string,
  fieldName: string,
) {
  const normalizedInput = requireDirectiveString(inputPath, fieldName).replace(/\\/g, "/");
  const root = path.resolve(directiveRoot);
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(root, normalizedInput);
  const normalizedRootPrefix = `${root}${path.sep}`;

  if (absolutePath !== root && !absolutePath.startsWith(normalizedRootPrefix)) {
    throw new Error(`invalid_input: ${fieldName} must stay within directive-workspace`);
  }

  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function normalizeDirectiveApprovalActor(actor: string | null | undefined) {
  return String(actor || "directive-frontend-operator").trim()
    || "directive-frontend-operator";
}

function requireDirectiveEligibleStatus(input: {
  subject: string;
  currentStatus: string;
  allowedStatuses: string[];
  action: string;
}) {
  if (!input.allowedStatuses.includes(input.currentStatus)) {
    throw new Error(
      `invalid_input: ${input.subject} cannot ${input.action} from current status "${input.currentStatus}"`,
    );
  }
}

function writeDirectiveArtifactIfMissing(input: {
  absolutePath: string;
  content: string;
}) {
  const created = !fs.existsSync(input.absolutePath);
  if (created) {
    fs.mkdirSync(path.dirname(input.absolutePath), { recursive: true });
    fs.writeFileSync(input.absolutePath, input.content, "utf8");
  }
  return created;
}

function stripBackticks(value: string) {
  return value.trim().replace(/^`|`$/g, "");
}

function extractSection(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase(),
  );
  if (startIndex < 0) {
    throw new Error(`invalid_input: missing section "${heading}" in Architecture handoff stub`);
  }

  const body: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("## ")) {
      break;
    }
    body.push(line);
  }
  return body.join("\n").trim();
}

function extractSingleValue(section: string, label: string) {
  const line = section
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`- ${label}:`));
  if (!line) {
    throw new Error(`invalid_input: missing "${label}" in Architecture handoff stub`);
  }
  return stripBackticks(line.replace(/^- /, "").split(":").slice(1).join(":"));
}

function extractOptionalSingleValue(section: string, label: string) {
  const line = section
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`- ${label}:`));
  if (!line) {
    return null;
  }
  const value = stripBackticks(line.replace(/^- /, "").split(":").slice(1).join(":"));
  if (!value || /^n\/a$/i.test(value) || /^not resolved$/i.test(value)) {
    return null;
  }
  return value;
}

function extractLifecycleOrigin(section: string) {
  return extractSingleValue(section, "Origin");
}

function extractList(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- /.test(line) || /^- `/.test(line) || /^-/.test(line))
    .map((line) => stripBackticks(line.replace(/^- /, "").trim()))
    .filter(Boolean);
}

function extractParagraph(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function parseArchitectureHandoffMarkdown(markdown: string): ParsedArchitectureHandoff {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const dateLine = lines.find((line) => line.startsWith("Date: "));
  const statusLine = lines.find((line) => line.startsWith("Status: "));
  if (!titleLine || !dateLine || !statusLine) {
    throw new Error("invalid_input: Architecture handoff stub header is incomplete");
  }

  const sourceSection = extractSection(markdown, "Source");
  const lifecycleSection = extractSection(markdown, "Lifecycle classification");
  const origin = extractLifecycleOrigin(lifecycleSection);
  const internallyGenerated = origin === "internally-generated";
  const engineRunRecordPath = internallyGenerated
    ? extractOptionalSingleValue(sourceSection, "Engine run record")
    : extractSingleValue(sourceSection, "Engine run record");
  const engineRunReportPath = internallyGenerated
    ? extractOptionalSingleValue(sourceSection, "Engine run report")
    : extractSingleValue(sourceSection, "Engine run report");
  const discoveryRoutingRecordPath = internallyGenerated
    ? extractOptionalSingleValue(sourceSection, "Discovery routing record")
    : extractSingleValue(sourceSection, "Discovery routing record");

  return {
    title: titleLine.replace(/^# /, "").replace(/ Engine-Routed Architecture Experiment$/, "").trim(),
    date: requireDirectiveString(dateLine.replace(/^Date:\s*/, ""), "handoff date"),
    status: requireDirectiveString(statusLine.replace(/^Status:\s*/, ""), "handoff status"),
    candidateId: extractSingleValue(sourceSection, "Candidate id"),
    sourceReference: extractSingleValue(sourceSection, "Source reference"),
    engineRunRecordPath,
    engineRunReportPath,
    discoveryRoutingRecordPath,
    usefulnessLevel: extractSingleValue(sourceSection, "Usefulness level"),
    usefulnessRationale: requireDirectiveString(
      sourceSection
        .split(/\r?\n/)
        .find((entry) => entry.trim().startsWith("- Usefulness rationale:"))
        ?.replace(/^- Usefulness rationale:\s*/, ""),
      "usefulness rationale",
    ),
    objective: extractParagraph(extractSection(markdown, "Objective")),
    boundedScope: extractList(extractSection(markdown, "Bounded scope")),
    inputs: extractList(extractSection(markdown, "Inputs")),
    validationGates: extractList(extractSection(markdown, "Validation gate(s)")),
    runtimeThresholdCheck: requireDirectiveString((() => {
      const lifecycleLine = lifecycleSection
        .split(/\r?\n/)
        .find((entry) =>
          entry.trim().startsWith("- Runtime threshold check:")
          || entry.trim().startsWith("- Forge threshold check:"),
        );
      if (!lifecycleLine) {
        return null;
      }
      return lifecycleLine
        .replace(/^- Runtime threshold check:\s*/, "")
        .replace(/^- Forge threshold check:\s*/, "");
    })(), "runtime threshold check"),
    rollback: extractParagraph(extractSection(markdown, "Rollback")),
    nextDecision: extractList(extractSection(markdown, "Next decision")),
  };
}

function resolveStartRelativePath(handoffRelativePath: string) {
  if (!handoffRelativePath.endsWith("-engine-handoff.md")) {
    throw new Error("invalid_input: handoffPath must point to an Architecture engine-handoff stub");
  }
  return handoffRelativePath.replace(/-engine-handoff\.md$/u, "-bounded-start.md");
}

function resolveResultRelativePath(handoffRelativePath: string) {
  if (!handoffRelativePath.endsWith("-engine-handoff.md")) {
    throw new Error("invalid_input: handoffPath must point to an Architecture engine-handoff stub");
  }
  return handoffRelativePath.replace(/-engine-handoff\.md$/u, "-bounded-result.md");
}

function readArchitectureHandoffArtifact(input: {
  directiveRoot: string;
  handoffRelativePath: string;
}): DirectiveArchitectureHandoffArtifact {
  if (!input.handoffRelativePath.startsWith("architecture/02-experiments/")) {
    throw new Error("invalid_input: handoffPath must point to architecture/02-experiments/");
  }

  const handoffAbsolutePath = path.resolve(input.directiveRoot, input.handoffRelativePath).replace(/\\/g, "/");
  if (!fs.existsSync(handoffAbsolutePath)) {
    throw new Error(`invalid_input: handoffPath not found: ${input.handoffRelativePath}`);
  }

  const parsed = parseArchitectureHandoffMarkdown(
    fs.readFileSync(handoffAbsolutePath, "utf8"),
  );
  const startRelativePath = resolveStartRelativePath(input.handoffRelativePath);
  const startAbsolutePath = path.resolve(input.directiveRoot, startRelativePath).replace(/\\/g, "/");
  const resultRelativePath = resolveResultRelativePath(input.handoffRelativePath);
  const resultAbsolutePath = path.resolve(input.directiveRoot, resultRelativePath).replace(/\\/g, "/");

  return {
    ...parsed,
    directiveRoot: input.directiveRoot,
    handoffRelativePath: input.handoffRelativePath,
    handoffAbsolutePath,
    startRelativePath,
    startAbsolutePath,
    startExists: fs.existsSync(startAbsolutePath),
    resultRelativePath,
    resultAbsolutePath,
    resultExists: fs.existsSync(resultAbsolutePath),
  };
}

function renderArchitectureBoundedStart(input: {
  handoffRelativePath: string;
  startDate: string;
  startedBy: string;
  parsed: ParsedArchitectureHandoff;
}) {
  const metaUseful = input.parsed.usefulnessLevel === "meta" ? "yes" : "no";
  const boundedScope = input.parsed.boundedScope.length > 0
    ? input.parsed.boundedScope.map((item) => `- ${item}`).join("\n")
    : "- Keep the experiment bounded to one Architecture slice.";
  const inputs = input.parsed.inputs.length > 0
    ? input.parsed.inputs.map((item) => `- ${item}`).join("\n")
    : "- n/a";
  const gates = input.parsed.validationGates.length > 0
    ? input.parsed.validationGates.map((item) => `- \`${item}\``).join("\n")
    : "- n/a";
  const nextDecision = input.parsed.nextDecision[0] || "needs-more-evidence";
  const evidencePath = [
    "- Evidence path:",
    `- Handoff stub: \`${input.handoffRelativePath}\``,
    `- Engine run record: ${input.parsed.engineRunRecordPath ? `\`${input.parsed.engineRunRecordPath}\`` : "n/a"}`,
    `- Engine run report: ${input.parsed.engineRunReportPath ? `\`${input.parsed.engineRunReportPath}\`` : "n/a"}`,
    `- Discovery routing record: ${input.parsed.discoveryRoutingRecordPath ? `\`${input.parsed.discoveryRoutingRecordPath}\`` : "n/a"}`,
    `- Next decision: \`${nextDecision}\``,
  ].join("\n");

  return [
    `# ${input.parsed.title} Bounded Architecture Start`,
    "",
    `- Candidate id: ${input.parsed.candidateId}`,
    `- Candidate name: ${input.parsed.title}`,
    `- Experiment date: ${input.startDate}`,
    "- Owning track: Architecture",
    "- Experiment type: engine-routed bounded start",
    `- Start approval: approved by ${input.startedBy} from routed handoff \`${input.handoffRelativePath}\``,
    "",
    `- Objective: ${input.parsed.objective}`,
    "- Bounded scope:",
    boundedScope,
    "- Inputs:",
    inputs,
    "- Expected output:",
    "- One bounded Architecture experiment slice that can proceed without reinterpreting the Engine run from scratch.",
    "- Validation gate(s):",
    gates,
    "- Transition policy profile: `decision_review`",
    "- Scoring policy profile: `architecture_self_improvement`",
    "- Blocked recovery path: Leave the routed handoff stub as the authoritative pre-start artifact and stop before adoption.",
    "- Failure criteria: No Directive-owned mechanism or bounded adaptation target becomes clear from the approved handoff scope.",
    `- Rollback: ${input.parsed.rollback}`,
    "- Result summary: pending_execution",
    evidencePath,
    "",
    "## Lifecycle classification (per `architecture-artifact-lifecycle` contract)",
    "",
    "- Origin: `source-driven`",
    `- Usefulness level: \`${input.parsed.usefulnessLevel}\``,
    `- Runtime threshold check: ${input.parsed.runtimeThresholdCheck}`,
    "",
    "## Source adaptation fields (Architecture source-driven experiments only)",
    "",
    `- Source analysis ref: ${input.handoffRelativePath}`,
    "- Adaptation decision ref: n/a",
    "- Adaptation quality: `skipped`",
    "- Improvement quality: `skipped`",
    `- Meta-useful: \`${metaUseful}\``,
    "- Meta-usefulness category: `n/a`",
    "- Transformation artifact gate result: `partial`",
    `- Transformed artifacts produced: \`${input.handoffRelativePath}\``,
    "",
  ].join("\n");
}

export function readDirectiveArchitectureHandoffArtifact(input: {
  handoffPath: string;
  directiveRoot?: string;
}) {
  const directiveRoot = normalizeDirectiveWorkspaceRoot(input.directiveRoot);
  const handoffRelativePath = resolveDirectiveWorkspaceRelativePath(
    directiveRoot,
    input.handoffPath,
    "handoffPath",
  );
  return readArchitectureHandoffArtifact({
    directiveRoot,
    handoffRelativePath,
  });
}

export function listDirectiveArchitectureHandoffArtifacts(input: {
  directiveRoot?: string;
  maxEntries?: number;
} = {}) {
  const directiveRoot = normalizeDirectiveWorkspaceRoot(input.directiveRoot);
  const experimentsRoot = path.resolve(directiveRoot, "architecture", "02-experiments").replace(/\\/g, "/");
  const maxEntries = Math.max(1, input.maxEntries ?? 20);

  if (!fs.existsSync(experimentsRoot)) {
    return [];
  }

  return fs
    .readdirSync(experimentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("-engine-handoff.md"))
    .map((entry) =>
      readArchitectureHandoffArtifact({
        directiveRoot,
        handoffRelativePath: `architecture/02-experiments/${entry.name}`,
      }))
    .sort((left, right) => right.handoffRelativePath.localeCompare(left.handoffRelativePath))
    .slice(0, maxEntries);
}

export function startDirectiveArchitectureFromHandoff(input: {
  handoffPath: string;
  directiveRoot?: string;
  startedBy?: string | null;
}): DirectiveArchitectureHandoffStartResult {
  const directiveRoot = normalizeDirectiveWorkspaceRoot(input.directiveRoot);
  const handoffRelativePath = resolveDirectiveWorkspaceRelativePath(
    directiveRoot,
    input.handoffPath,
    "handoffPath",
  );
  const artifact = readArchitectureHandoffArtifact({
    directiveRoot,
    handoffRelativePath,
  });

  requireDirectiveEligibleStatus({
    subject: "Architecture handoff stub",
    currentStatus: artifact.status,
    allowedStatuses: ["pending_review"],
    action: "be started",
  });

  const snapshotAt = new Date().toISOString();
  const startedBy = normalizeDirectiveApprovalActor(input.startedBy);
  const startDate = snapshotAt.slice(0, 10);
  const created = writeDirectiveArtifactIfMissing({
    absolutePath: artifact.startAbsolutePath as string,
    content: renderArchitectureBoundedStart({
      handoffRelativePath,
      startDate,
      startedBy,
      parsed: {
        title: artifact.title,
        date: artifact.date,
        status: artifact.status,
        candidateId: artifact.candidateId,
        sourceReference: artifact.sourceReference,
        engineRunRecordPath: artifact.engineRunRecordPath,
        engineRunReportPath: artifact.engineRunReportPath,
        discoveryRoutingRecordPath: artifact.discoveryRoutingRecordPath,
        usefulnessLevel: artifact.usefulnessLevel,
        usefulnessRationale: artifact.usefulnessRationale,
        objective: artifact.objective,
        boundedScope: artifact.boundedScope,
        inputs: artifact.inputs,
        validationGates: artifact.validationGates,
        runtimeThresholdCheck: artifact.runtimeThresholdCheck,
        rollback: artifact.rollback,
        nextDecision: artifact.nextDecision,
      },
    }),
  });

  return {
    ok: true,
    created,
    snapshotAt,
    directiveRoot,
    handoffRelativePath,
    handoffAbsolutePath: artifact.handoffAbsolutePath,
    startRelativePath: artifact.startRelativePath as string,
    startAbsolutePath: artifact.startAbsolutePath as string,
    candidateId: artifact.candidateId,
    candidateName: artifact.title,
    usefulnessLevel: artifact.usefulnessLevel,
    usefulnessRationale: artifact.usefulnessRationale,
    objective: artifact.objective,
  };
}
