# Nightly Ops Summary

- Generated At: 2026-03-27T15:34:22.532Z
- Bundle Generated At: 2026-03-27T15:30:04.421Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 257343
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 16457 | 0 | 16457 |
| canary_nightly | FAIL | 1 | 11150 | 16457 | 27607 |
| workspace_health_nightly | FAIL | 1 | 134171 | 27607 | 161778 |
| orchestrator_nightly | FAIL | 1 | 94584 | 161778 | 256362 |
| ops_health_snapshot | FAIL | 1 | 976 | 256362 | 257338 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

