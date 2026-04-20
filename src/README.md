# Mission Control Frontend

Next.js 16 frontend for Mission Control.

## Architecture

The frontend is backend-first. Pages talk to the Nest backend through a single
catch-all proxy route instead of maintaining per-feature Next.js API handlers.

## Project Structure

```text
src/
  app/                       # Next.js app router pages and the catch-all proxy route
    api/[...path]/route.ts   # Frontend -> backend proxy entrypoint
  components/layout/         # App shell and layout components
  features/                  # Feature-local API clients
  platform/http/             # Backend proxy infrastructure
  state/                     # Global frontend state
```

## Backend Boundary

All frontend API requests flow through `src/app/api/[...path]/route.ts`, which
uses `proxyBackendRequest()` from `src/platform/http/backend-proxy.ts`.

## State Management

Global shell state lives in `src/state/app-store.ts`.

## API Clients

Feature-local API helpers live under `src/features/*/api.ts`.

```ts
import { quests } from "@/features/quests/api";
import { reports } from "@/features/reports/api";
import { notes } from "@/features/notes/api";

await quests.list({ status: "open" });
await reports.list();
await notes.create({ content: "Follow up with backend" });
```

## Development

When adding a new page:

1. Create `src/app/<feature>/page.tsx`.
2. Add or extend the corresponding feature API client in `src/features/<feature>/api.ts`.
3. Use the catch-all proxy route for backend access instead of adding a new frontend API route.
4. Keep app-level state in `src/state/app-store.ts` only when it is truly shared shell state.
