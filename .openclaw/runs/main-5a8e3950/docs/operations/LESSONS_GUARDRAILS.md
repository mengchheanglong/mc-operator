# LESSONS_GUARDRAILS

Phase 8 guardrails for the bounded Lessons → Rules → Runtime Injection loop.

## Source of truth

- Raw incidents: `.openclaw/lessons/workflow-lessons.jsonl`
- Single rule catalog: `.openclaw/lessons/workflow-rules.json`
- Injection telemetry: `.openclaw/lessons/runtime-injection-telemetry.jsonl`
- Reports:
  - `reports/lessons/latest.json`
  - `reports/lessons/injection-latest.json`

## Promotion and status

- Lessons are normalized into `pattern`, `trigger`, `prevention`, `verification`.
- Rule status lifecycle:
  - `candidate`: below promotion threshold
  - `active`: count >= `promotionThreshold` (default 2)
  - `deprecated`: previously active but now below threshold
- Rules are deduplicated by runType + issueKey + normalized trigger.

## Runtime injection limits

- Inject only `active` rules.
- Selection is relevance-first (exact issue key, then same family, then by count recency).
- Hard limits:
  - max rules injected: 3 (default)
  - max chars injected: 480 (default)
- Telemetry records:
  - source
  - rulesInjected
  - charsInjected
  - budgetChars
  - ruleSources

## Commands

- `npm run lessons:update`
  - updates catalog
  - writes lessons reports
  - appends daily delta under `reports/lessons/daily-YYYY-MM-DD.md`
- `npm run check:lessons`
  - fails on malformed catalog
  - fails on invalid statuses
  - fails when active rules violate threshold
  - fails on telemetry budget overruns
