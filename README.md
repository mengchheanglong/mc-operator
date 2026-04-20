# Mission Control

Mission Control is a local-first operator control plane for AI-assisted software work. It provides a single workspace for project selection, quests, reports, docs, notes, saved views, agent operations, automation runs, directive capability intake, and ops health.

For the current local-first phase, the project is treated as product-complete: the active frontend routes, backend APIs, smoke coverage, and release docs now describe the same system.

## Architecture

- Next.js App Router frontend under `src/app`
- Feature-local clients under `src/features`
- Single browser-to-backend proxy under `src/app/api/[...path]/route.ts`
- Nest backend under `backend/src`
- SQLite-backed state for operational records
- Filesystem-backed docs, reports, workspace runs, and generated artifacts

The UI is intentionally thin. Most business logic and persistence live in the backend modules.

## Main Surfaces

- `/health`
- `/quests`
- `/reports`
- `/docs`
- `/notes`
- `/projects`
- `/views`
- `/agents`
- `/automation`
- `/directive`
- `/ops`
- `/workspace/bootstrap`

## Local Run

```bash
npm install
npm run dev
```

Backend-only development:

```bash
npm run backend:dev
```

## Verification

Fast checks:

```bash
npm run typecheck
npm run build
npm test
```

Product gate:

```bash
npm run verify:product
```

`verify:product` runs:

- current regression tests
- frontend typecheck
- backend API suite coverage check
- isolated UI smoke
- smoke report integrity check

## Runtime Notes

- `.env` is not committed. Start from `.env.example`.
- Project knowledge lives inside each repo under `.openclaw/knowledge`.
- Generated context under `.openclaw/context/` is ignored.
- UI smoke artifacts under `reports/ui-smoke/` are generated runtime output and are ignored.

## Release Docs

- [Project completion status](./docs/PROJECT_COMPLETION_PLAN.md)
- [Release checklist](./docs/RELEASE_CHECKLIST.md)
- [UI smoke guardrails](./docs/operations/UI_SMOKE_GUARDRAILS.md)
