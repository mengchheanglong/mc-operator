import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const dailyServicePath = new URL("../src/server/services/daily-report-log-service.ts", import.meta.url);
const reportClientPath = new URL("../src/app/dashboard/report/ReportPageClient.tsx", import.meta.url);

const dailyService = readFileSync(dailyServicePath, "utf8");
const reportClient = readFileSync(reportClientPath, "utf8");

assert.match(
  dailyService,
  /\.orderBy\(asc\(reports\.date\), asc\(reports\.id\)\)/,
  "Daily entry query must order by date + id for deterministic chronology.",
);
assert.match(
  dailyService,
  /function compareDailyEntries[\s\S]*left\.date\.localeCompare\(right\.date\)[\s\S]*left\.id\.localeCompare\(right\.id\)/,
  "Daily entry sorter must use id as a tie-breaker.",
);
assert.match(dailyService, /## Summary/, "Daily markdown should include a Summary section.");
assert.match(dailyService, /## Events/, "Daily markdown should include an Events section.");
assert.match(dailyService, /## Actions/, "Daily markdown should include an Actions section.");
assert.match(dailyService, /## Outcomes/, "Daily markdown should include an Outcomes section.");
assert.match(dailyService, /## Follow-ups/, "Daily markdown should include a Follow-ups section.");
assert.match(
  dailyService,
  /<!-- REPORT_ENTRY id=\$\{entry\.id\} ts=\$\{entry\.date\}/,
  "Daily markdown should include machine-friendly report entry markers.",
);
assert.match(dailyService, /## Entries/, "Daily markdown should keep the Entries section for compatibility.");

assert.match(
  reportClient,
  /const requestSeqRef = useRef\(0\);/,
  "Report page must guard against stale fetch responses.",
);
assert.match(
  reportClient,
  /const sortedLogs = useMemo\(/,
  "Report page should sort logs deterministically in the UI.",
);
assert.match(
  reportClient,
  /window\.history\.replaceState\(/,
  "Report page should sync selected day to URL in one place.",
);
assert.doesNotMatch(
  reportClient,
  /switchingDay/,
  "Legacy switchingDay state should be removed to avoid flicker/stale transitions.",
);

console.log("Reports daily model checks passed.");
