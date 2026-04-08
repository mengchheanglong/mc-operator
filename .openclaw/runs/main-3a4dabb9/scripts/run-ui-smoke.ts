import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import puppeteer, { type Page } from "puppeteer";

type FlowStatus = "pass" | "fail";

interface SmokeIssue {
  source: "console" | "page" | "network";
  message: string;
}

interface FlowResult {
  id: "agents" | "automations" | "report";
  path: string;
  status: FlowStatus;
  durationMs: number;
  screenshot: string;
  issues: SmokeIssue[];
  error: string | null;
}

interface SmokeReport {
  suite: "ui-smoke";
  ok: boolean;
  generatedAt: string;
  baseUrl: string;
  viewport: { width: number; height: number };
  flows: FlowResult[];
  totals: { passed: number; failed: number };
}

const HOST = process.env.UI_SMOKE_HOST || "127.0.0.1";
const REQUESTED_PORT = Number(process.env.UI_SMOKE_PORT || "3210");
let runtimePort = REQUESTED_PORT;
let runtimeBaseUrl = process.env.UI_SMOKE_BASE_URL || `http://${HOST}:${runtimePort}`;
const VIEWPORT = { width: 1440, height: 900 };
const FIXED_WAIT_MS = 400;
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "ui-smoke");
const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");

function nowTag(date = new Date()) {
  return date.toISOString().replace(/[.:]/g, "-");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/dashboard/agents`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for app server at ${url}`);
}

async function isPortFree(port: number) {
  return await new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, HOST);
  });
}

async function resolveRuntimePort() {
  if (process.env.UI_SMOKE_BASE_URL) return;
  let next = REQUESTED_PORT;
  for (let i = 0; i < 20; i += 1) {
    if (await isPortFree(next)) {
      runtimePort = next;
      runtimeBaseUrl = `http://${HOST}:${runtimePort}`;
      return;
    }
    next += 1;
  }
  throw new Error(`Unable to find free port starting from ${REQUESTED_PORT}`);
}

function startDevServer() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(
    `${npmCmd} run dev -- --hostname ${HOST} --port ${runtimePort}`,
    {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: true,
    },
  );

  child.stdout?.on("data", (chunk) => process.stdout.write(`[ui-smoke:dev] ${String(chunk)}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[ui-smoke:dev] ${String(chunk)}`));

  return child;
}

async function stopServer(child: ChildProcess) {
  if (child.killed || child.exitCode !== null) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve) => killer.once("exit", () => resolve()));
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function runFlow(page: Page, input: {
  id: FlowResult["id"];
  route: string;
  screenshotFile: string;
  action: () => Promise<void>;
}): Promise<FlowResult> {
  const started = Date.now();
  const issues: SmokeIssue[] = [];
  let status: FlowStatus = "pass";
  let error: string | null = null;

  const consoleHandler = (msg: { type: () => string; text: () => string }) => {
    const type = msg.type();
    const text = msg.text();
    if (type !== "error") return;
    if (text.includes("favicon.ico") || text.includes("Failed to load resource: the server responded with a status of 404")) {
      return;
    }
    issues.push({ source: "console", message: `[${type}] ${text}` });
  };
  const pageErrorHandler = (err: Error) => {
    issues.push({ source: "page", message: err.stack || err.message });
  };
  const reqFailHandler = (req: { method: () => string; url: () => string; failure: () => { errorText?: string } | null }) => {
    const failure = req.failure();
    const errorText = failure?.errorText || "request failed";
    if (errorText.includes("ERR_ABORTED")) return;
    issues.push({
      source: "network",
      message: `${req.method()} ${req.url()} :: ${errorText}`,
    });
  };

  page.on("console", consoleHandler);
  page.on("pageerror", pageErrorHandler);
  page.on("requestfailed", reqFailHandler);

  try {
    await page.goto(`${runtimeBaseUrl}${input.route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(FIXED_WAIT_MS);
    await input.action();
    await sleep(FIXED_WAIT_MS);
  } catch (err) {
    status = "fail";
    error = err instanceof Error ? err.message : String(err);
  }

  if (issues.length > 0) {
    status = "fail";
    if (!error) {
      error = `Captured ${issues.length} runtime issue(s)`;
    }
  }

  await page.screenshot({ path: input.screenshotFile, fullPage: true });

  page.off("console", consoleHandler);
  page.off("pageerror", pageErrorHandler);
  page.off("requestfailed", reqFailHandler);

  return {
    id: input.id,
    path: input.route,
    status,
    durationMs: Date.now() - started,
    screenshot: path.relative(ROOT, input.screenshotFile).replaceAll("\\", "/"),
    issues,
    error,
  };
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const stamp = nowTag();

  await resolveRuntimePort();
  const server = startDevServer();
  try {
    await waitForServer(runtimeBaseUrl);
    const browser = await puppeteer.launch({ headless: true, defaultViewport: VIEWPORT });
    const page = await browser.newPage();

    const flows: FlowResult[] = [];
    flows.push(
      await runFlow(page, {
        id: "agents",
        route: "/dashboard/agents",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-agents.png`),
        action: async () => {
          await page.waitForSelector('[data-testid="agents-page-title"]', { timeout: 20000 });
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "automations",
        route: "/dashboard/automations",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-automations.png`),
        action: async () => {
          await page.waitForSelector('[data-testid="automations-page-title"]', { timeout: 20000 });
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "report",
        route: "/dashboard/report",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-report.png`),
        action: async () => {
          await page.waitForSelector('[data-testid="report-selected-day-title"]', { timeout: 20000 });
          const dayButtons = await page.$$('[data-testid^="report-day-"]');
          if (dayButtons.length < 2) {
            throw new Error("Report flow requires at least 2 daily report entries to verify switching.");
          }
          const before = await page.$eval('[data-testid="report-selected-day-title"]', (node) => node.textContent?.trim() || "");
          await dayButtons[1].click();
          await sleep(FIXED_WAIT_MS);
          const after = await page.$eval('[data-testid="report-selected-day-title"]', (node) => node.textContent?.trim() || "");
          if (!after || before === after) {
            throw new Error("Switching report entries did not update selected day title.");
          }
        },
      }),
    );

    await browser.close();

    const passed = flows.filter((flow) => flow.status === "pass").length;
    const failed = flows.length - passed;
    const report: SmokeReport = {
      suite: "ui-smoke",
      ok: failed === 0,
      generatedAt: new Date().toISOString(),
      baseUrl: runtimeBaseUrl,
      viewport: VIEWPORT,
      flows,
      totals: { passed, failed },
    };

    const latestPath = path.join(REPORT_DIR, "latest.json");
    const timestampedPath = path.join(REPORT_DIR, `ui-smoke-${stamp}.json`);
    await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await copyFile(latestPath, timestampedPath);

    console.log(`UI smoke report written to ${path.relative(ROOT, latestPath)}`);
    console.log(`UI smoke archive written to ${path.relative(ROOT, timestampedPath)}`);

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await stopServer(server);
  }
}

void main().catch(async (err) => {
  const stamp = nowTag();
  const fallbackReport: SmokeReport = {
    suite: "ui-smoke",
    ok: false,
    generatedAt: new Date().toISOString(),
    baseUrl: runtimeBaseUrl,
    viewport: VIEWPORT,
    flows: [
      {
        id: "agents",
        path: "/dashboard/agents",
        status: "fail",
        durationMs: 0,
        screenshot: "",
        issues: [],
        error: err instanceof Error ? err.message : String(err),
      },
    ],
    totals: { passed: 0, failed: 1 },
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const latestPath = path.join(REPORT_DIR, "latest.json");
  const timestampedPath = path.join(REPORT_DIR, `ui-smoke-${stamp}.json`);
  await writeFile(latestPath, `${JSON.stringify(fallbackReport, null, 2)}\n`, "utf8");
  await copyFile(latestPath, timestampedPath);
  console.error(err);
  process.exitCode = 1;
});
