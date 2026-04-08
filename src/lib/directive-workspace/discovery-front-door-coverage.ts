// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-front-door-coverage.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";
import {
  getDiscoveryIntakeArtifactPath,
  type DiscoveryIntakeQueueDocument,
  type DiscoveryIntakeQueueEntry,
} from "./discovery-intake-queue-writer";

const DEFAULT_MINIMUM_NATIVE_POST_PRIMARY_ENTRIES = 10;
const DEFAULT_REQUIRED_NATIVE_INTAKE_LINK_COVERAGE_PERCENT = 100;

type DiscoveryIntakeQueueDocumentWithTransition = DiscoveryIntakeQueueDocument & {
  transitionedAt?: string | null;
};

export type DiscoveryFrontDoorCoverageSnapshot = {
  queueMode: string;
  transitionDate: string | null;
  queueEntryCount: number;
  intakeMarkdownCount: number;
  routingMarkdownCount: number;
  historicalIntakeToRoutingCoveragePercent: number | null;
  postPrimaryEntryCount: number;
  postPrimaryBackfillLikeEntryCount: number;
  postPrimaryNativeLikeEntryCount: number;
  postPrimaryEntriesWithIntakeLinkCount: number;
  postPrimaryNativeLikeEntriesWithIntakeLinkCount: number;
  postPrimaryIntakeLinkCoveragePercent: number | null;
  postPrimaryNativeLikeIntakeLinkCoveragePercent: number | null;
  postPrimaryEntriesMissingIntakeLink: string[];
  postPrimaryNativeLikeEntriesMissingIntakeLink: string[];
  thresholds: {
    minimumNativePostPrimaryEntries: number;
    requiredNativeIntakeLinkCoveragePercent: number;
  };
  routineSatisfied: boolean;
  recommendedGapStatus: "resolved" | "open";
};

function loadQueueDocument(directiveRoot: string) {
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");
  return JSON.parse(
    fs.readFileSync(queuePath, "utf8"),
  ) as DiscoveryIntakeQueueDocumentWithTransition;
}

function countMarkdownArtifacts(directoryPath: string) {
  if (!fs.existsSync(directoryPath)) {
    return 0;
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => name !== "README.md")
    .length;
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function isBackfillLikeEntry(entry: DiscoveryIntakeQueueEntry) {
  return /\bbackfill\b/i.test(String(entry.notes ?? ""));
}

function isPostPrimaryEntry(entry: DiscoveryIntakeQueueEntry, transitionDate: string | null) {
  if (!transitionDate) {
    return false;
  }
  return entry.received_at >= transitionDate;
}

function collectMissingIntakeLinks(entries: DiscoveryIntakeQueueEntry[]) {
  return entries
    .filter((entry) => !getDiscoveryIntakeArtifactPath(entry))
    .map((entry) => entry.candidate_id);
}

export function analyzeDiscoveryFrontDoorCoverage(input: {
  directiveRoot: string;
  queueDocument?: DiscoveryIntakeQueueDocumentWithTransition;
  minimumNativePostPrimaryEntries?: number;
  requiredNativeIntakeLinkCoveragePercent?: number;
}): DiscoveryFrontDoorCoverageSnapshot {
  const queue =
    input.queueDocument ?? loadQueueDocument(input.directiveRoot);
  const transitionDate = queue.transitionedAt ?? queue.updatedAt ?? null;
  const intakeMarkdownCount = countMarkdownArtifacts(
    path.join(input.directiveRoot, "discovery", "intake"),
  );
  const routingMarkdownCount = countMarkdownArtifacts(
    path.join(input.directiveRoot, "discovery", "routing-log"),
  );
  const historicalIntakeToRoutingCoveragePercent = toPercent(
    intakeMarkdownCount,
    routingMarkdownCount,
  );

  const postPrimaryEntries = queue.entries.filter((entry) =>
    isPostPrimaryEntry(entry, transitionDate),
  );
  const postPrimaryBackfillLikeEntries = postPrimaryEntries.filter(isBackfillLikeEntry);
  const postPrimaryNativeLikeEntries = postPrimaryEntries.filter(
    (entry) => !isBackfillLikeEntry(entry),
  );
  const postPrimaryEntriesWithIntakeLinkCount = postPrimaryEntries.filter((entry) =>
    Boolean(getDiscoveryIntakeArtifactPath(entry)),
  ).length;
  const postPrimaryNativeLikeEntriesWithIntakeLinkCount =
    postPrimaryNativeLikeEntries.filter((entry) =>
      Boolean(getDiscoveryIntakeArtifactPath(entry)),
    ).length;
  const postPrimaryEntriesMissingIntakeLink =
    collectMissingIntakeLinks(postPrimaryEntries);
  const postPrimaryNativeLikeEntriesMissingIntakeLink =
    collectMissingIntakeLinks(postPrimaryNativeLikeEntries);

  const minimumNativePostPrimaryEntries =
    input.minimumNativePostPrimaryEntries ??
    DEFAULT_MINIMUM_NATIVE_POST_PRIMARY_ENTRIES;
  const requiredNativeIntakeLinkCoveragePercent =
    input.requiredNativeIntakeLinkCoveragePercent ??
    DEFAULT_REQUIRED_NATIVE_INTAKE_LINK_COVERAGE_PERCENT;
  const postPrimaryIntakeLinkCoveragePercent = toPercent(
    postPrimaryEntriesWithIntakeLinkCount,
    postPrimaryEntries.length,
  );
  const postPrimaryNativeLikeIntakeLinkCoveragePercent = toPercent(
    postPrimaryNativeLikeEntriesWithIntakeLinkCount,
    postPrimaryNativeLikeEntries.length,
  );

  const routineSatisfied =
    queue.status === "primary" &&
    postPrimaryNativeLikeEntries.length >= minimumNativePostPrimaryEntries &&
    postPrimaryNativeLikeEntriesMissingIntakeLink.length === 0 &&
    postPrimaryNativeLikeIntakeLinkCoveragePercent ===
      requiredNativeIntakeLinkCoveragePercent;

  return {
    queueMode: queue.status,
    transitionDate,
    queueEntryCount: queue.entries.length,
    intakeMarkdownCount,
    routingMarkdownCount,
    historicalIntakeToRoutingCoveragePercent,
    postPrimaryEntryCount: postPrimaryEntries.length,
    postPrimaryBackfillLikeEntryCount: postPrimaryBackfillLikeEntries.length,
    postPrimaryNativeLikeEntryCount: postPrimaryNativeLikeEntries.length,
    postPrimaryEntriesWithIntakeLinkCount,
    postPrimaryNativeLikeEntriesWithIntakeLinkCount,
    postPrimaryIntakeLinkCoveragePercent,
    postPrimaryNativeLikeIntakeLinkCoveragePercent,
    postPrimaryEntriesMissingIntakeLink,
    postPrimaryNativeLikeEntriesMissingIntakeLink,
    thresholds: {
      minimumNativePostPrimaryEntries,
      requiredNativeIntakeLinkCoveragePercent,
    },
    routineSatisfied,
    recommendedGapStatus: routineSatisfied ? "resolved" : "open",
  };
}
