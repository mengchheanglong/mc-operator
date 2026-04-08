# Nightly Ops Summary

- Generated At: 2026-03-23T15:37:53.616Z
- Bundle Generated At: 2026-03-23T15:30:05.165Z
- Overall: PASS
- Failed Count: 0
- Duration (ms): 467232
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 24391 | 0 | 24391 |
| canary_nightly | PASS | 0 | 69011 | 24391 | 93402 |
| workspace_health_nightly | PASS | 0 | 169482 | 93402 | 262884 |
| orchestrator_nightly | PASS | 0 | 201681 | 262884 | 464565 |
| ops_health_snapshot | PASS | 0 | 2663 | 464565 | 467228 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

