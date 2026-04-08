# Backend Read / Write Policy

Mission Control uses a split policy for `quests`, `docs`, and `reports`.

## Reads

- `GET /api/quests`, `GET /api/docs`, and `GET /api/reports` may fall back to local Mission Control data when the backend is unavailable.
- This keeps the dashboard readable when `backend` is temporarily down.

## Writes

- `POST`, `PUT`, and `DELETE` for these surfaces are backend-authoritative.
- If the backend is unavailable, writes must fail fast with:
  - `code: "backend_required_for_write"`
  - a clear operator message

## Restore Writes

Start the backend again:

```bash
npm run backend:dev
```

If the frontend is running separately, keep `npm run dev` active and restart the backend only.
