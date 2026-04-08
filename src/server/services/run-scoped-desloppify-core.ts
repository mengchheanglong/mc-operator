import { spawn } from "node:child_process";
import path from "node:path";

export type DesloppifyFailureClass =
  | "invalid_input"
  | "timeout"
  | "execution_failed"
  | "tool_missing"
  | "parse_failed";

export interface DesloppifyCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface LengthGateResult {
  minChars: number;
  actualChars: number;
  triggered: boolean;
}

function isSpawnMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}

export function evaluateLengthGate(input: { minChars?: number; content?: string }): LengthGateResult {
  const minCharsRaw = Number(input.minChars ?? 0);
  const minChars = Number.isFinite(minCharsRaw) ? Math.max(0, Math.floor(minCharsRaw)) : 0;
  const actualChars = typeof input.content === "string" ? input.content.length : 0;
  return {
    minChars,
    actualChars,
    triggered: minChars > 0 && actualChars < minChars,
  };
}

export function classifyDesloppifyFailure(input: { timedOut?: boolean; exitCode?: number; stderr?: string }): DesloppifyFailureClass {
  if (input.timedOut) return "timeout";
  const stderr = String(input.stderr || "").toLowerCase();
  if (stderr.includes("no module named desloppify") || stderr.includes("modulenotfounderror") || stderr.includes("not recognized")) {
    return "tool_missing";
  }
  if ((input.exitCode ?? 1) !== 0) return "execution_failed";
  return "invalid_input";
}

export function normalizeDesloppifyFailureClass(error: unknown): DesloppifyFailureClass {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (message.includes("invalid_input:")) return "invalid_input";
  if (lower.includes("timeout")) return "timeout";
  if (lower.includes("parse_failed")) return "parse_failed";
  if (lower.includes("no module named desloppify") || lower.includes("modulenotfounderror")) return "tool_missing";
  return "execution_failed";
}

export function extractJsonPayload(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Try extracting from first JSON token when output has text prefix.
  }

  const start = trimmed.search(/[{\[]/);
  if (start < 0) return null;
  const source = trimmed.slice(start);
  const open = source[0];
  const close = open === "{" ? "}" : open === "[" ? "]" : "";
  if (!close) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === open) depth += 1;
    if (char === close) depth -= 1;

    if (depth === 0) {
      try {
        return JSON.parse(source.slice(0, i + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function runWithPythonBinary(input: {
  pythonBin: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  toolRootPath: string;
}): Promise<DesloppifyCommandResult> {
  const started = Date.now();
  const command = `${input.pythonBin} -m desloppify ${input.args.join(" ")}`;
  const delimiter = process.platform === "win32" ? ";" : ":";
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${path.resolve(input.toolRootPath)}${delimiter}${String(process.env.PYTHONPATH)}`
      : path.resolve(input.toolRootPath),
  };

  return await new Promise<DesloppifyCommandResult>((resolve, reject) => {
    const child = spawn(input.pythonBin, ["-m", "desloppify", ...input.args], {
      cwd: input.cwd,
      env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}

export async function runDesloppifyCommand(input: {
  args: string[];
  cwd: string;
  timeoutMs: number;
  toolRootPath: string;
  pythonBin?: string;
}): Promise<DesloppifyCommandResult> {
  const candidates = input.pythonBin ? [input.pythonBin] : ["python", "py"];

  for (let index = 0; index < candidates.length; index += 1) {
    const pythonBin = candidates[index] ?? "python";
    try {
      return await runWithPythonBinary({
        pythonBin,
        args: input.args,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        toolRootPath: input.toolRootPath,
      });
    } catch (error) {
      const isLast = index === candidates.length - 1;
      if (!isLast && isSpawnMissing(error)) continue;
      throw error;
    }
  }

  throw new Error("execution_failed: unable to execute desloppify command");
}
