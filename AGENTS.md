# Mission Control Agent Notes

## Path Compatibility

- Legacy path `src/server/services/report-service.ts` is a compatibility shim.
- Canonical report code is split:
  - `src/server/repositories/reports-repo.ts`
  - `src/server/services/daily-report-log-service.ts`

## Edit Discipline

- For `tsx` UI files, do not apply blind string replacement.
- Read the target file first, then patch by unique context.
- If replacement text is non-unique, switch to precise patch hunks.

## Execution Discipline

- Keep tasks bounded per run (one feature slice or one bug slice).
- Verify with `npm run typecheck`, `npm run lint`, and `npm run build` after code changes.
