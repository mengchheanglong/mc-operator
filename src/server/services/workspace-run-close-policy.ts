export type WorktreeRemoveFailureKind = "missing" | "locked" | "permission" | "unknown";

function asMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "");
}

export function classifyWorktreeRemoveFailure(error: unknown): WorktreeRemoveFailureKind {
  const normalized = asMessage(error).toLowerCase();
  if (!normalized) return "unknown";

  const missingPatterns = [
    "is not a working tree",
    "not a git repository",
    "could not find worktree",
    "does not exist",
    "no such file or directory",
    "cannot find the path specified",
  ];
  if (missingPatterns.some((pattern) => normalized.includes(pattern))) {
    return "missing";
  }

  const lockPatterns = [
    "in use by another process",
    "resource busy",
    "device or resource busy",
    "unable to unlink",
    "cannot unlink",
    "directory not empty",
    "worktree is locked",
    "would be overwritten by removal",
  ];
  if (lockPatterns.some((pattern) => normalized.includes(pattern))) {
    return "locked";
  }

  const permissionPatterns = [
    "access is denied",
    "permission denied",
    "operation not permitted",
  ];
  if (permissionPatterns.some((pattern) => normalized.includes(pattern))) {
    return "permission";
  }

  return "unknown";
}

export function computeCleanupRetryDelayMs(attempt: number) {
  const boundedAttempt = Math.max(1, Math.min(6, Number.isFinite(attempt) ? Math.floor(attempt) : 1));
  return Math.min(30 * 60 * 1000, 60 * 1000 * 2 ** (boundedAttempt - 1));
}
