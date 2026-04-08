import fs from "node:fs";
import path from "node:path";
import { analyzeDiscoveryFrontDoorCoverage } from "../src/lib/directive-workspace/discovery-front-door-coverage";

type CapabilityGapRecord = {
  gap_id: string;
  resolved_at?: string | null;
};

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const issues: string[] = [];

  if (!fs.existsSync(gapsPath)) {
    issues.push("missing discovery/capability-gaps.json");
  }

  const coverage = analyzeDiscoveryFrontDoorCoverage({ directiveRoot });
  let gapResolved = false;

  if (fs.existsSync(gapsPath)) {
    const gaps = JSON.parse(fs.readFileSync(gapsPath, "utf8")) as {
      gaps?: CapabilityGapRecord[];
    };
    const coverageGap = (gaps.gaps || []).find(
      (gap) => gap.gap_id === "gap-discovery-front-door-coverage",
    );
    if (!coverageGap) {
      issues.push("missing gap-discovery-front-door-coverage in capability-gaps.json");
    } else {
      gapResolved = Boolean(coverageGap.resolved_at);
    }
  }

  if (coverage.queueMode !== "primary") {
    issues.push(`discovery queue must be in primary mode; got ${coverage.queueMode}`);
  }
  if (coverage.postPrimaryNativeLikeEntryCount < coverage.thresholds.minimumNativePostPrimaryEntries) {
    issues.push(
      `native post-primary entries below threshold: ${coverage.postPrimaryNativeLikeEntryCount}/${coverage.thresholds.minimumNativePostPrimaryEntries}`,
    );
  }
  if (coverage.postPrimaryNativeLikeEntriesMissingIntakeLink.length > 0) {
    issues.push(
      `native post-primary entries missing intake linkage: ${coverage.postPrimaryNativeLikeEntriesMissingIntakeLink.join(", ")}`,
    );
  }
  if (coverage.routineSatisfied && !gapResolved) {
    issues.push(
      "front-door coverage routine is satisfied but gap-discovery-front-door-coverage is still unresolved",
    );
  }
  if (!coverage.routineSatisfied && gapResolved) {
    issues.push(
      "gap-discovery-front-door-coverage is resolved but executable front-door routine thresholds are not satisfied",
    );
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        metrics: coverage,
        issues,
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
