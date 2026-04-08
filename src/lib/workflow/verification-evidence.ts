export interface VerificationCommandEvidence {
  command: string;
  output: string;
  status?: "success" | "warning" | "error";
}

export interface VerificationEvidence {
  summary: string;
  commands: VerificationCommandEvidence[];
}

function normalizeCommandStatus(value: unknown): VerificationCommandEvidence["status"] {
  if (value === "warning" || value === "error") return value;
  return value === "success" ? "success" : undefined;
}

export function normalizeVerificationEvidence(input: unknown): VerificationEvidence | null {
  if (!input || typeof input !== "object") return null;
  const row = input as { summary?: unknown; commands?: unknown };
  const summary = String(row.summary || "").trim();
  const commands: VerificationCommandEvidence[] = Array.isArray(row.commands)
    ? row.commands.reduce<VerificationCommandEvidence[]>((acc, item) => {
        if (!item || typeof item !== "object") return acc;
        const command = String((item as { command?: unknown }).command || "").trim();
        const output = String((item as { output?: unknown }).output || "").trim();
        const status = normalizeCommandStatus((item as { status?: unknown }).status);
        if (!command || !output) return acc;
        acc.push({ command, output, status });
        return acc;
      }, [])
    : [];

  if (!summary) return null;
  return { summary, commands };
}

export function validateVerificationEvidence(input: unknown): { ok: boolean; reason?: string; value?: VerificationEvidence } {
  const normalized = normalizeVerificationEvidence(input);
  if (!normalized) {
    return { ok: false, reason: "verificationEvidence.summary is required." };
  }

  if (Array.isArray((input as { commands?: unknown })?.commands) && normalized.commands.length === 0) {
    return {
      ok: false,
      reason: "verificationEvidence.commands must include entries with command and output.",
    };
  }

  return { ok: true, value: normalized };
}
