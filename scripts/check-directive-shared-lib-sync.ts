import fs from "node:fs";
import path from "node:path";
import {
  loadForgeBoundaryInventory,
  resolveCanonicalPath,
  resolveHostPath,
} from "./directive-forge-boundary-inventory-lib";

type SyncPair = {
  canonicalPath: string;
  hostMirrorPath: string;
  hostHeaderPattern: RegExp;
};

function normalizeContent(input: string) {
  return input.replace(/\r\n/g, "\n").trim();
}

const pairs: SyncPair[] = loadForgeBoundaryInventory()
  .mirrorEntries.filter(
    (entry) => entry.group === "shared_lib" && Boolean(entry.hostMirrorPath),
  )
  .map((entry) => ({
    canonicalPath: resolveCanonicalPath(entry.canonicalPath),
    hostMirrorPath: resolveHostPath(entry.hostMirrorPath as string),
    hostHeaderPattern:
      /^\/\/ Canonical Directive shared lib lives[\s\S]*?production builds\.\n?/,
  }));

function main() {
  const checks = pairs.map((pair) => {
    const canonicalExists = fs.existsSync(pair.canonicalPath);
    const hostMirrorExists = fs.existsSync(pair.hostMirrorPath);

    let ok = canonicalExists && hostMirrorExists;
    let reason = "";

    if (!canonicalExists) {
      reason = `canonical shared lib missing: ${pair.canonicalPath}`;
    } else if (!hostMirrorExists) {
      reason = `host mirror missing: ${pair.hostMirrorPath}`;
    } else {
      const canonicalRaw = fs.readFileSync(pair.canonicalPath, "utf8");
      const hostMirrorRaw = fs.readFileSync(pair.hostMirrorPath, "utf8");
      const canonicalBody = normalizeContent(canonicalRaw);
      const hostMirrorBody = normalizeContent(
        hostMirrorRaw.replace(pair.hostHeaderPattern, "").trim(),
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
