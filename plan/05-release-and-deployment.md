# 05 — History, public API, and deployment

## Objective
Prepare a secure deployable prototype.

## Scope
History/statistics reset confirmation, scoped hashed API keys, read-only versioned external API, OpenAPI, rate limits, structured logs, tests, Docker production images, Traefik/Portainer stack, backups, and release notes.

## Acceptance criteria
- A revoked API key immediately fails.
- The stack deploys through Portainer behind HTTPS with WebSocket forwarding.
- Automated tests cover key host, player, and API authorization paths.
