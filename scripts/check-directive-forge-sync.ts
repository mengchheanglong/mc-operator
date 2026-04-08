import fs from "node:fs";
import path from "node:path";
import {
  loadForgeBoundaryInventory,
  resolveCanonicalPath,
  resolveHostPath,
  type ForgeBoundaryMirrorEntry,
} from "./directive-forge-boundary-inventory-lib";

type SyncPair = {
  canonicalPath: string;
  hostMirrorPath: string;
  hostHeaderPattern: RegExp;
  compareBodyOnly?: boolean;
};

function normalizeContent(input: string) {
  return input.replace(/\r\n/g, "\n").trim();
}

function toSyncPair(entry: ForgeBoundaryMirrorEntry): SyncPair {
  const fileName = path.basename(entry.canonicalPath);
  const hostHeaderPattern =
    fileName === "v0.ts"
      ? /^\/\/ Canonical Forge core lives[\s\S]*?production builds\.\n?/
      : /^\/\/ Canonical Forge .*? lives[\s\S]*?production builds\.\n?/;

  return {
    canonicalPath: resolveCanonicalPath(entry.canonicalPath),
    hostMirrorPath: resolveHostPath(entry.hostMirrorPath as string),
    hostHeaderPattern,
    compareBodyOnly: entry.compareBodyOnly,
  };
}

const pairs: SyncPair[] = loadForgeBoundaryInventory()
  .mirrorEntries.filter((entry) => entry.group === "forge_core")
  .map(toSyncPair);

function stripLeadingImportBlock(input: string) {
  return input.replace(/^(?:import[\s\S]*?from\s*["'][^"']+["'];\n*)+/u, "");
}

function main() {
  const checks = pairs.map((pair) => {
    const canonicalExists = fs.existsSync(pair.canonicalPath);
    const hostMirrorExists = fs.existsSync(pair.hostMirrorPath);

    let ok = canonicalExists && hostMirrorExists;
    let reason = "";

    if (!canonicalExists) {
      reason = `canonical Forge file missing: ${pair.canonicalPath}`;
    } else if (!hostMirrorExists) {
      reason = `host mirror missing: ${pair.hostMirrorPath}`;
    } else {
      const canonicalRaw = fs.readFileSync(pair.canonicalPath, "utf8");
      const hostMirrorRaw = fs.readFileSync(pair.hostMirrorPath, "utf8");
      const canonicalBody = normalizeContent(
        pair.compareBodyOnly ? stripLeadingImportBlock(canonicalRaw) : canonicalRaw,
      );
      const hostMirrorBody = normalizeContent(
        (
          pair.compareBodyOnly
            ? stripLeadingImportBlock(hostMirrorRaw.replace(pair.hostHeaderPattern, ""))
            : hostMirrorRaw.replace(pair.hostHeaderPattern, "")
        ).trim(),
      );

      ok = canonicalBody === hostMirrorBody;
      if (!ok) {
        reason = "host mirror drift detected";
      }
    }

    return {
      ok,
      canonicalPath: pair.canonicalPath,
      hostMirrorPath: pair.hostMirrorPath,
      reason: reason || null,
    };
  });

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
    process.exit(1);
  }
}

main();
