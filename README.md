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
- Current production dependency audit is clean; remaining audit findings are limited to the `drizzle-kit` dev toolchain.
