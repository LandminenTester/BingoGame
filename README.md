# Twitch Bingo

An interactive Bingo companion for Twitch streamers and their communities. This repository currently contains the runnable prototype shell: a bilingual Vue interface with representative mock data and a Fastify health service.

## Local development

1. Copy `.env.example` to `.env` and set secrets when authentication is implemented.
2. Run `pnpm install`.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Run `pnpm dev`.

The web app is available at `http://localhost:5173`; the API health endpoint is at `http://localhost:3000/health`.

## Status

The project includes Twitch OAuth endpoints, Prisma-backed lobby data, WebSocket synchronization, and a scoped read API. See `plan/` for the remaining implementation slices.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Portainer and Traefik deployment.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
