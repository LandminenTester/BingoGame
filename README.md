# Twitch Bingo

An interactive, self-hosted Bingo companion for Twitch streamers and their communities. It provides Twitch authentication, persistent PostgreSQL game state, 25-field templates, password-protected lobbies, real-time cards and rankings, a scoped external API, and German-first localization.

## Local development

1. Copy `.env.example` to `.env` and set your local configuration.
2. Run `pnpm install`.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Run `pnpm dev`.

The web app is available at `http://localhost:5173`; the API health endpoint is at `http://localhost:3000/health`.

## Included features

- Twitch Authorization Code + PKCE login with durable hashed sessions.
- Private, public, and unlisted 25-field templates; immutable after lobby use.
- Six-character lobbies with optional Argon2id passwords, capacity, late-join setting, and a guarded lifecycle.
- Individual and streamer-controlled cards, late-join catch-up, server-owned results, and live rankings.
- Session history, channel statistics, revocable scoped API keys, and versioned read-only integration endpoints.
- Docker/Traefik/Portainer deployment files, health endpoints, PostgreSQL migrations, and GitHub CI.

## Verification

Run `pnpm build`, `pnpm lint`, and `pnpm test`. CI starts PostgreSQL, applies migrations, and executes the same checks on every push and pull request.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Portainer and Traefik deployment.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
