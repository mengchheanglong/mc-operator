# Security

This project is local-first, but it still handles sensitive repo context, local automation hooks, and project data. Treat it like an internal tool that can become high-impact if exposed carelessly.

## Core Rules

- Keep secrets in environment variables. Do not hardcode API keys, tokens, or webhook secrets in code or scripts.
- Prefer minimal, proven security patterns over custom auth logic.
- Validate and constrain all external input before using it.
- Log destructive or high-impact actions.
- Keep local, test, and production environments separate.

## Secrets

- Use [`.env.example`](C:/Users/User/.openclaw/workspace/mission-control/.env.example) as the config template.
- Keep real secrets only in local `.env` or deployment secret managers.
- Rotate automation or API secrets when they leak or when trust changes.
- Replace placeholder values like `OPENCLAW_AUTOMATION_TOKEN=change-me` before exposing integrations to anything outside the machine.

## Dependencies

- Check package risk before adding dependencies.
- Prefer compatible maintained versions over automatic churn.
- Use `npm audit --omit=dev` to assess production risk.
- Do not run `npm audit fix` blindly; review the impact first.

## API and Endpoint Safety

- Treat all write endpoints as sensitive.
- Require auth for automation or external write paths.
- Validate request bodies and reject malformed or oversized input.
- Do not trust UI-only checks as security boundaries.
- Add rate limiting if an endpoint becomes internet-facing.

## Automation and Webhooks

- Protect Mission Control automation endpoints with `OPENCLAW_AUTOMATION_TOKEN`.
- Verify webhook authenticity when a provider supports signatures.
- Keep test webhooks away from real business or production actions.
- Do not let automation write outside intended scopes without explicit review.

## Data Handling

- Keep project data scoped to the active project.
- Avoid leaking one project’s context into another project’s prompt pack or reports.
- Back up the SQLite database and verify restore procedures occasionally.
- Archive old projects instead of deleting them casually.

## Logging and Auditing

- Log critical operations such as deletes, automation-triggered writes, or major config changes.
- Remove noisy debug logging before production use.
- Never log secrets or raw tokens.

## Environment Separation

- Local defaults are fine for development.
- Production should use explicit hostnames, auth, and deployment-specific secrets.
- Keep production and test data stores separate.

## Practical Checklist

Before shipping a meaningful change, check:

1. Secrets are not committed or hardcoded.
2. New endpoints validate input and require appropriate auth.
3. New dependencies were reviewed for security and maintenance risk.
4. Logs do not expose sensitive values.
5. Verification passed: lint, typecheck, build, and any relevant runtime checks.
