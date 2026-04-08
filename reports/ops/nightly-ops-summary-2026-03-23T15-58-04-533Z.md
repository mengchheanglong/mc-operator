# Nightly Ops Summary

- Generated At: 2026-03-23T15:58:04.533Z
- Bundle Generated At: 2026-03-23T15:52:00.447Z
- Overall: PASS
- Failed Count: 0
- Duration (ms): 363543
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 9102 | 0 | 9102 |
| canary_nightly | PASS | 0 | 65145 | 9102 | 74247 |
| workspace_health_nightly | PASS | 0 | 152632 | 74247 | 226879 |
| orchestrator_nightly | PASS | 0 | 136064 | 226879 | 362943 |
| ops_health_snapshot | PASS | 0 | 596 | 362943 | 363539 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

