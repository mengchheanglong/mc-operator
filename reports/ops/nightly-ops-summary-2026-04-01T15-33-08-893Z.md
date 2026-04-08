# Nightly Ops Summary

- Generated At: 2026-04-01T15:33:08.893Z
- Bundle Generated At: 2026-04-01T15:30:03.128Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 185288
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 12105 | 0 | 12105 |
| canary_nightly | FAIL | 1 | 7551 | 12105 | 19656 |
| workspace_health_nightly | FAIL | 1 | 88761 | 19656 | 108417 |
| orchestrator_nightly | FAIL | 1 | 76260 | 108417 | 184677 |
| ops_health_snapshot | FAIL | 1 | 606 | 184677 | 185283 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

