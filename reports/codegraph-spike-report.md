1) Files changed

- `C:/Users/User/.openclaw/workspace/scripts/codegraph-summary.mjs`
- `C:/Users/User/.openclaw/workspace/mission-control/src/server/services/codegraph-summary-service.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/src/server/services/context-pack-service.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/src/server/services/workspace-context-writer.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/src/types/context-pack.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/scripts/check-codegraph-spike.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/scripts/run-codegraph-spike.ts`
- `C:/Users/User/.openclaw/workspace/mission-control/package.json`
- Generated artifacts:
  - `C:/Users/User/.openclaw/workspace/mission-control/.openclaw/context/codegraph-summary.json`
  - `C:/Users/User/.openclaw/workspace/mission-control/.openclaw/context/codegraph-summary.md`

2) Commands run

- `node ../scripts/codegraph-summary.mjs --repo . --max-stats-lines 6 --max-line-chars 120 --max-markdown-chars 900 --max-insights 3 --out-json .openclaw/context/codegraph-summary.json --out-md .openclaw/context/codegraph-summary.md`
- `npm run spike:codegraph`
- `npm run check:codegraph-spike`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

3) Raw outputs

### spike script run (adapter)

```text
{"generatedAt":"2026-03-14T17:42:03.451Z","status":"ok","repoPath":"C:\\Users\\User\\.openclaw\\workspace\\mission-control","bounded":{"maxStatsLines":6,"maxLineChars":120,"maxMarkdownChars":900,"maxInsights":3},"indexed":false,"indexedRepositoryCount":0,"statsPreview":["spawnSync cgc.cmd EINVAL"],"insights":["spawnSync cgc.cmd EINVAL"],"markdown":"### codegraph_summary\n- repo: C:\\Users\\User\\.openclaw\\workspace\\mission-control\n- indexed: no\n- indexed_repositories: 0\n- stats:\n  - spawnSync cgc.cmd EINVAL\n- insights:\n  - spawnSync cgc.cmd EINVAL","markdownChars":198,"markdownTokensEstimated":50,"usedCommands":[{"command":"cgc list","ok":false},{"command":"cgc index C:\\Users\\User\\.openclaw\\workspace\\mission-control","ok":false},{"command":"cgc stats C:\\Users\\User\\.openclaw\\workspace\\mission-control","ok":false},{"command":"cgc stats","ok":false}],"failures":[{"command":"cgc list","output":"spawnSync cgc.cmd EINVAL"},{"command":"cgc index C:\\Users\\User\\.openclaw\\workspace\\mission-control","output":"spawnSync cgc.cmd EINVAL"},{"command":"cgc stats C:\\Users\\User\\.openclaw\\workspace\\mission-control","output":"spawnSync cgc.cmd EINVAL"},{"command":"cgc stats","output":"spawnSync cgc.cmd EINVAL"}]}
```

### spike metrics script

```text
> mission-control@1.0.0 spike:codegraph
> node --experimental-strip-types ./scripts/run-codegraph-spike.ts mission-control

Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/server' imported from C:\Users\User\.openclaw\workspace\mission-control\src\server\context\user-context.ts
...
Node.js v24.14.0
(Command exited with code 1)
```

### new spike check

```text
> mission-control@1.0.0 check:codegraph-spike
> node --experimental-strip-types ./scripts/check-codegraph-spike.ts

AssertionError [ERR_ASSERTION]: Context pack service should gate bounded spike mode.
...
(Command exited with code 1)
```

### typecheck

```text
> mission-control@1.0.0 typecheck
> tsc --noEmit --project tsconfig.typecheck.json --incremental false
```

### lint

```text
> mission-control@1.0.0 lint
> eslint . --ext .js,.jsx,.ts,.tsx

Process exited with code 0.
```

### build

```text
> mission-control@1.0.0 build
> next build

▲ Next.js 16.1.6 (Turbopack)
✓ Compiled successfully in 13.2s
✓ Generating static pages using 19 workers (3/3)
Process exited with code 0.
```

4) Metrics table (baseline chars/tokens, with-codegraph chars/tokens, delta)

| Metric | Baseline | With-codegraph | Delta |
|---|---:|---:|---:|
| Brief chars | N/A (spike runner failed to execute due TS path alias resolution in node strip-types mode) | N/A | N/A |
| Brief tokens (estimated) | N/A | N/A | N/A |
| Adapter markdown chars | 0 (no adapter block) | 198 | +198 |
| Adapter markdown tokens (estimated) | 0 | 50 | +50 |

5) Quality rubric results

- Relevance: **2/5**
  - The summary shape is compact and bounded, but the content is mostly failure diagnostics (`spawnSync cgc.cmd EINVAL`) rather than repo graph intelligence.
- Actionability: **2/5**
  - Adapter includes attempted commands, but execution currently fails from Node spawn path behavior in this environment, reducing practical guidance.
- Non-redundancy: **4/5**
  - The block is short and isolated; minimal overlap risk when present.

6) Recommendation: adopt/iterate/reject + rationale

**Recommendation: iterate**

Rationale:
- Positive: bounded integration points are minimal and reversible; lint/typecheck/build pass in touched project.
- Blocking gaps:
  1. Adapter currently returns failure-only summaries (`cgc.cmd` spawn EINVAL), so quality value is low.
  2. Spike metrics script (`spike:codegraph`) cannot run under current `node --experimental-strip-types` setup because of `@/` alias resolution.
  3. Check script assertion expects env-string presence in a different file shape and currently fails.
- Therefore this is not ready for direct adoption, but the scaffold is close.

7) If adopt: minimal next step for production rollout

If/when promoted after iteration:
- Fix runner execution path by using a runtime that resolves TS path aliases (or refactor spike scripts to avoid alias imports), and fix adapter command spawning on Windows (`cgc` invocation from Node).
- Re-run `spike:codegraph` to collect true baseline/with metrics and confirm `codegraph_summary` block injection stays within budget.
- Gate rollout behind `MISSION_CONTROL_CODEGRAPH_SPIKE_BOUNDED=1` in staging only, then promote after one successful end-to-end run on at least one indexed real repo.
