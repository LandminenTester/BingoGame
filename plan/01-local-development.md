# 01 — Local development

## Objective
Make the complete local stack start predictably.

## Scope
Add API/web Dockerfiles, Compose services, startup documentation, development CORS, and environment validation.

## Dependencies
Project foundation.

## Acceptance criteria
- PostgreSQL persists data in a named volume.
- The API reports database readiness after the database slice is complete.
- A developer can start all local services from the documented commands.

## Out of scope
Traefik and Portainer production routing.
