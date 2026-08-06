# Production deployment

Deploy `docker-compose.production.yml` as a Portainer stack in an environment that already provides the external Docker network `traefik`.

## Required environment

Set these values in Portainer, never in Git:

- `POSTGRES_PASSWORD`: strong unique database password
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `TWITCH_REDIRECT_URI=https://bingo.landminentester.de/api/auth/twitch/callback`
- `WEB_ORIGIN=https://bingo.landminentester.de`
- `SESSION_SECRET`: long random secret

The API applies Prisma migrations before starting. Confirm `https://bingo.landminentester.de/api/ready` returns `200` after deployment.

## Backup and rollback

Back up the `postgres_data` volume before schema upgrades. To roll back an application image, redeploy the previous Git commit/image; database migrations must be rolled back with a dedicated forward migration rather than by deleting database data.

## Traefik

Traefik must provide TLS for `bingo.landminentester.de`. The compose labels route `/api` and WebSocket upgrades to the API service; all other requests go to the Vue frontend.
