# Mission Control

Mission Control is a local-first Next.js workspace for supporting AI-assisted development across multiple projects.

It is designed to work as a persistent control room for:

- project docs and decisions
- quests, notes, and reports
- prompt-pack generation for IDE agents
- repo intelligence, verification commands, and code-intel readiness

## Stack

- Next.js 16
- React 18
- TypeScript
- SQLite with Drizzle
- Tailwind CSS

## Core Commands

```bash
npm install
npm run dev
npm run verify
```

## Verification

`npm run verify` runs:

- lint
- typecheck
- production build

## Notes

- Generated workspace context files under `.openclaw/context/` are ignored by Git.
- `.env` is not committed. Use `.env.example` as the template.
- Project docs now live with each repo under `.openclaw/knowledge`; the shared global knowledge directory is only a fallback/source for shared docs.
- Current production dependency audit is clean; remaining audit findings are limited to the `drizzle-kit` dev toolchain.
- See [SECURITY.md](SECURITY.md) for the project security baseline.

## Automation

Mission Control exposes a small automation surface for local tools like n8n.

- Use `OPENCLAW_AUTOMATION_TOKEN` to protect automation endpoints.
- Use `MISSION_CONTROL_BASE_URL` so local automation tools can call Mission Control with absolute URLs.
- Use `N8N_BASE_URL`, `N8N_WEBHOOK_BASE_URL`, and optional `N8N_API_KEY` to let Mission Control inspect the local n8n instance.
- Build Codex/OpenClaw session briefs from `/api/automation/session-brief`.
- Write workflow outcomes back into Mission Control through `/api/automation/reports`.
- Inspect n8n connection status from `/api/automation/n8n/status`.
- See [docs/N8N_WORKFLOWS.md](docs/N8N_WORKFLOWS.md) for the recommended local workflow shape.
