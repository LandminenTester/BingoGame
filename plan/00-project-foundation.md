# 00 — Project foundation

## Objective
Create a reproducible pnpm TypeScript monorepo and a runnable mocked product shell.

## Scope
Workspace tooling, shared domain contracts, Fastify health endpoints, Vue UI, bilingual messages, themes, mock fixtures, and base Docker Postgres service.

## Acceptance criteria
- `pnpm build`, `pnpm lint`, and `pnpm test` pass.
- The web app renders a responsive 5×5 mock card and local interactions.
- `/health` and `/ready` return JSON.

## Out of scope
Database access, Twitch OAuth, and real-time transport.
