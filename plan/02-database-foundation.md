# 02 — Database foundation

## Objective
Turn the Prisma placeholder into the persistent game domain.

## Scope
Complete migrations and repositories for Twitch users, templates/fields, lobbies/participants, immutable cards/card fields, confirmed events, results, API keys, audit events, and statistics.

## Dependencies
Local PostgreSQL and environment configuration.

## Acceptance criteria
- An empty PostgreSQL database migrates successfully.
- Integration tests cover migration and basic repository operations.
- Card layout never changes after creation.

## Out of scope
OAuth and WebSocket delivery.
