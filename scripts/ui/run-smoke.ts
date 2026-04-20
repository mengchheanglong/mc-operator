import { execFileSync, spawn, type ChildProcess } from "node:child_process";
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
  id:
    | "health"
    | "quests"
    | "reports"
    | "docs"
    | "notes"
    | "projects"
    | "views"
    | "agents"
    | "automation"
    | "directive"
    | "ops"
    | "workspace-bootstrap";
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
const REQUESTED_BACKEND_PORT = Number(process.env.UI_SMOKE_BACKEND_PORT || "3201");
let runtimePort = REQUESTED_PORT;
let runtimeBaseUrl = process.env.UI_SMOKE_BASE_URL || `http://${HOST}:${runtimePort}`;
let backendPort = REQUESTED_BACKEND_PORT;
let backendBaseUrl = `http://${HOST}:${backendPort}`;
const VIEWPORT = { width: 1440, height: 900 };
const FIXED_WAIT_MS = 400;
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "ui-smoke");
const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");
const SERVER_TIMEOUT_MS = Number(process.env.UI_SMOKE_SERVER_TIMEOUT_MS || "240000");
const SERVER_READY_ROUTE = process.env.UI_SMOKE_READY_ROUTE || "/health";

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
      const res = await fetch(`${url}${SERVER_READY_ROUTE}`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for app server at ${url}`);
}

async function waitForBackend(url: string, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/v1/health`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for backend at ${url}`);
}

async function isResponsiveBaseUrl(url: string) {
  try {
    const res = await fetch(`${url}${SERVER_READY_ROUTE}`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function findExistingBaseUrl() {
  const configuredBaseUrl = process.env.UI_SMOKE_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return null;
  }

  if (await isResponsiveBaseUrl(configuredBaseUrl)) {
    return configuredBaseUrl;
  }

  return null;
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

async function resolveBackendPort() {
  if (process.env.UI_SMOKE_BASE_URL) return;
  let next = REQUESTED_BACKEND_PORT;
  for (let i = 0; i < 20; i += 1) {
    if (await isPortFree(next)) {
      backendPort = next;
      backendBaseUrl = `http://${HOST}:${backendPort}`;
      return;
    }
    next += 1;
  }
  throw new Error(`Unable to find free backend port starting from ${REQUESTED_BACKEND_PORT}`);
}

function startWebServer() {
  const child = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      HOSTNAME: HOST,
      PORT: String(runtimePort),
      MISSION_CONTROL_BACKEND_URL: backendBaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[ui-smoke:dev] ${String(chunk)}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[ui-smoke:dev] ${String(chunk)}`));

  return child;
}

function buildWebApp() {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
      cwd: ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        MISSION_CONTROL_BACKEND_URL: backendBaseUrl,
      },
      stdio: "inherit",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return;
  }

  execFileSync("npm", ["run", "build"], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      MISSION_CONTROL_BACKEND_URL: backendBaseUrl,
    },
    stdio: "inherit",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function startBackendServer() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const command = `${npmCmd} --prefix ./backend run dev`;
  const child = spawn(command, {
    cwd: ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      MISSION_CONTROL_BACKEND_HOST: HOST,
      MISSION_CONTROL_BACKEND_PORT: String(backendPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: true,
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[ui-smoke:backend] ${String(chunk)}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[ui-smoke:backend] ${String(chunk)}`));

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
  let navigationAborted = false;

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
    try {
      await page.goto(`${runtimeBaseUrl}${input.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("ERR_ABORTED")) {
        throw err;
      }
      navigationAborted = true;
    }
    await sleep(FIXED_WAIT_MS);
    await input.action();
    await sleep(FIXED_WAIT_MS);
    const currentUrl = page.url();
    if (!currentUrl.includes(input.route)) {
      throw new Error(`Navigation settled on unexpected route: ${currentUrl}`);
    }
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
  const existingBaseUrl = await findExistingBaseUrl();
  let webServer: ChildProcess | null = null;
  let backendServer: ChildProcess | null = null;
  try {
    if (existingBaseUrl) {
      runtimeBaseUrl = existingBaseUrl;
    } else {
      await resolveRuntimePort();
      await resolveBackendPort();
      backendServer = startBackendServer();
      await waitForBackend(backendBaseUrl, SERVER_TIMEOUT_MS);
      buildWebApp();
      webServer = startWebServer();
    }
    await waitForServer(runtimeBaseUrl, SERVER_TIMEOUT_MS);
    const browser = await puppeteer.launch({ headless: true, defaultViewport: VIEWPORT });
    const page = await browser.newPage();

    const flows: FlowResult[] = [];
    flows.push(
      await runFlow(page, {
        id: "health",
        route: "/health",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-health.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Backend Health"),
            { timeout: 20000 },
          );
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "quests",
        route: "/quests",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-quests.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Quests"),
            { timeout: 20000 },
          );
          const button = await page.$("button");
          if (!button) {
            throw new Error("Quest route rendered without actionable controls.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "reports",
        route: "/reports",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-reports.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Reports"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (!bodyText.includes("All Categories") || !bodyText.includes("All Statuses")) {
            throw new Error("Reports route did not render expected filter controls.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "docs",
        route: "/docs",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-docs.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Documents"),
            { timeout: 20000 },
          );
          const searchInput = await page.$('input[placeholder="Search documents..."]');
          const fileTypeSelect = await page.$("select");
          if (!searchInput || !fileTypeSelect) {
            throw new Error("Docs route did not render expected search controls.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "notes",
        route: "/notes",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-notes.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Notes"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (
            !bodyText.includes("Add a new note...") &&
            !bodyText.includes("No notes yet. Add one above!")
          ) {
            throw new Error("Notes route did not render expected note controls.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "projects",
        route: "/projects",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-projects.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Projects"),
            { timeout: 20000 },
          );
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "views",
        route: "/views",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-views.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Saved Views"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (!bodyText.includes("Quests") || !bodyText.includes("Reports")) {
            throw new Error("Views route did not render expected surface controls.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "agents",
        route: "/agents",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-agents.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Agent Catalog"),
            { timeout: 20000 },
          );
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "automation",
        route: "/automation",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-automation.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Automation Workspace"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (
            !bodyText.includes("Templates") ||
            !bodyText.includes("Workspace Runs")
          ) {
            throw new Error("Automation route did not render expected sections.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "ops",
        route: "/ops",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-ops.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Operations Dashboard"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (!bodyText.includes("System Health") || !bodyText.includes("Guardrails")) {
            throw new Error("Ops route did not render expected health cards.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "workspace-bootstrap",
        route: "/workspace/bootstrap",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-workspace-bootstrap.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Workspace Bootstrap"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (!bodyText.includes("Bootstrap Workspace")) {
            throw new Error("Workspace bootstrap route did not render the action control.");
          }
        },
      }),
    );

    flows.push(
      await runFlow(page, {
        id: "directive",
        route: "/directive",
        screenshotFile: path.join(SCREENSHOT_DIR, `${stamp}-directive.png`),
        action: async () => {
          await page.waitForFunction(
            () => document.body.innerText.includes("Directive Workspace"),
            { timeout: 20000 },
          );
          const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
          if (
            !bodyText.includes("capability registry") ||
            (!bodyText.includes("lifecycle detail") &&
              !bodyText.includes("no directive capabilities yet."))
          ) {
            throw new Error("Directive route did not render expected detail panels.");
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
    if (webServer) await stopServer(webServer);
    if (backendServer) await stopServer(backendServer);
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
        id: "health",
        path: "/health",
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
