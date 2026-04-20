import fs from "node:fs";
import path from "node:path";

type CheckResult = {
  name: string;
  ok: boolean;
  file: string;
  details?: string;
};

type RouteExpectation = {
  file: string;
  methods: Array<{
    decorator: "@Get" | "@Post" | "@Put" | "@Delete" | "@Patch";
    route?: string;
  }>;
};

const repoRoot = process.cwd();

const expectations: Array<{ name: string; expectation: RouteExpectation }> = [
  {
    name: "health",
    expectation: {
      file: "backend/src/modules/health/health.controller.ts",
      methods: [{ decorator: "@Get" }],
    },
  },
  {
    name: "quests",
    expectation: {
      file: "backend/src/modules/quests/quests.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Get", route: ":id" },
        { decorator: "@Post" },
        { decorator: "@Put", route: ":id/complete" },
        { decorator: "@Put", route: ":id" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "reports",
    expectation: {
      file: "backend/src/modules/reports/reports.controller.ts",
      methods: [
        { decorator: "@Post" },
        { decorator: "@Get" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "docs",
    expectation: {
      file: "backend/src/modules/docs/docs.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Get", route: ":id" },
        { decorator: "@Put", route: ":id" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "notes",
    expectation: {
      file: "backend/src/modules/notes/notes.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Put", route: ":id" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "views",
    expectation: {
      file: "backend/src/modules/views/views.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "projects",
    expectation: {
      file: "backend/src/modules/projects/projects.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Get", route: "graph" },
      ],
    },
  },
  {
    name: "agents catalog",
    expectation: {
      file: "backend/src/modules/agents-catalog/agents-catalog.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Put", route: ":id" },
        { decorator: "@Delete", route: ":id" },
      ],
    },
  },
  {
    name: "agents runtime",
    expectation: {
      file: "backend/src/modules/agents-runtime/agents-runtime.controller.ts",
      methods: [
        { decorator: "@Get", route: ":id/status" },
        { decorator: "@Post", route: ":id/kill" },
        { decorator: "@Post", route: ":id/restore" },
      ],
    },
  },
  {
    name: "agents dispatch",
    expectation: {
      file: "backend/src/modules/agents-dispatch/agents-dispatch.controller.ts",
      methods: [{ decorator: "@Post", route: ":id/dispatch" }],
    },
  },
  {
    name: "agents import packs",
    expectation: {
      file: "backend/src/modules/agents-import-packs/agents-import-packs.controller.ts",
      methods: [{ decorator: "@Post", route: "import-packs" }],
    },
  },
  {
    name: "automation runs",
    expectation: {
      file: "backend/src/modules/automation-runs/automation-runs.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Post", route: ":id/close" },
        { decorator: "@Get", route: ":id/summary" },
      ],
    },
  },
  {
    name: "automation run tools",
    expectation: {
      file: "backend/src/modules/automation-run-tools/automation-run-tools.controller.ts",
      methods: [
        { decorator: "@Post", route: ":id/tools" },
        { decorator: "@Post", route: ":id/tooling-audit" },
      ],
    },
  },
  {
    name: "automation templates",
    expectation: {
      file: "backend/src/modules/automation-template-execute/automation-template-execute.controller.ts",
      methods: [
        { decorator: "@Get" },
        { decorator: "@Post" },
        { decorator: "@Put", route: ":id" },
        { decorator: "@Delete", route: ":id" },
        { decorator: "@Get", route: ":id/runs" },
        { decorator: "@Post", route: ":id/execute" },
        { decorator: "@Post", route: ":id/run" },
        { decorator: "@Post", route: ":id/check" },
      ],
    },
  },
  {
    name: "automation health",
    expectation: {
      file: "backend/src/modules/automation-health/automation-health.controller.ts",
      methods: [
        { decorator: "@Get", route: "openclaw/health" },
        { decorator: "@Get", route: "n8n/status" },
      ],
    },
  },
  {
    name: "automation session brief",
    expectation: {
      file: "backend/src/modules/automation-session-brief/automation-session-brief.controller.ts",
      methods: [{ decorator: "@Get", route: "session-brief" }],
    },
  },
  {
    name: "directive workspace",
    expectation: {
      file: "backend/src/modules/directive-workspace/directive-workspace.controller.ts",
      methods: [
        { decorator: "@Get", route: "capabilities" },
        { decorator: "@Post", route: "capabilities" },
        { decorator: "@Get", route: "capabilities/:id" },
        { decorator: "@Post", route: "capabilities/:id/analysis" },
        { decorator: "@Post", route: "capabilities/:id/experiments" },
        { decorator: "@Post", route: "capabilities/:id/evaluations" },
        { decorator: "@Post", route: "capabilities/:id/decision" },
        { decorator: "@Post", route: "capabilities/:id/proof" },
        { decorator: "@Post", route: "capabilities/:id/lifecycle" },
        { decorator: "@Get", route: "capabilities/:id/lifecycle" },
        { decorator: "@Get", route: "registry" },
        { decorator: "@Get", route: "workspace/overview" },
        { decorator: "@Get", route: "discovery/overview" },
        { decorator: "@Get", route: "architecture/overview" },
      ],
    },
  },
  {
    name: "context export",
    expectation: {
      file: "backend/src/modules/context-export/context-export.controller.ts",
      methods: [{ decorator: "@Get", route: "export" }],
    },
  },
  {
    name: "code graph",
    expectation: {
      file: "backend/src/modules/code-graph-index/code-graph-index.controller.ts",
      methods: [{ decorator: "@Post", route: "index" }],
    },
  },
  {
    name: "workflow guards",
    expectation: {
      file: "backend/src/modules/workflow-guards/workflow-guards.controller.ts",
      methods: [{ decorator: "@Get" }],
    },
  },
  {
    name: "ops health",
    expectation: {
      file: "backend/src/modules/ops-health/ops-health.controller.ts",
      methods: [{ decorator: "@Get" }],
    },
  },
  {
    name: "ops nightly",
    expectation: {
      file: "backend/src/modules/ops-nightly/ops-nightly.controller.ts",
      methods: [{ decorator: "@Get", route: "nightly" }],
    },
  },
  {
    name: "workspace bootstrap",
    expectation: {
      file: "backend/src/modules/workspace-bootstrap/workspace-bootstrap.controller.ts",
      methods: [{ decorator: "@Post", route: "bootstrap" }],
    },
  },
];

function readFile(relativePath: string) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function checkExpectation(input: {
  name: string;
  expectation: RouteExpectation;
}): CheckResult {
  const filePath = path.resolve(repoRoot, input.expectation.file);
  if (!fs.existsSync(filePath)) {
    return {
      name: input.name,
      ok: false,
      file: input.expectation.file,
      details: "controller file is missing",
    };
  }

  const content = readFile(input.expectation.file);
  const missing = input.expectation.methods.filter((method) => {
    const escapedRoute = method.route
      ? method.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : undefined;
    const pattern = escapedRoute
      ? new RegExp(`${method.decorator}\\("${escapedRoute}"\\)`)
      : new RegExp(`${method.decorator}\\(\\)`);
    return !pattern.test(content);
  });

  if (missing.length > 0) {
    return {
      name: input.name,
      ok: false,
      file: input.expectation.file,
      details: `missing decorators: ${missing
        .map((method) => `${method.decorator}${method.route ? `("${method.route}")` : "()"}`)
        .join(", ")}`,
    };
  }

  return {
    name: input.name,
    ok: true,
    file: input.expectation.file,
  };
}

const checks = expectations.map(checkExpectation);
const ok = checks.every((check) => check.ok);

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      checks,
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
