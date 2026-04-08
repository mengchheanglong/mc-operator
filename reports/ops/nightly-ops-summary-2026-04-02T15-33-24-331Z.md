# Nightly Ops Summary

- Generated At: 2026-04-02T15:33:24.331Z
- Bundle Generated At: 2026-04-02T15:30:02.909Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 200918
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 11805 | 0 | 11805 |
| canary_nightly | FAIL | 1 | 7908 | 11805 | 19713 |
| workspace_health_nightly | FAIL | 1 | 90111 | 19713 | 109824 |
| orchestrator_nightly | FAIL | 1 | 90265 | 109824 | 200089 |
| ops_health_snapshot | FAIL | 1 | 825 | 200089 | 200914 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

