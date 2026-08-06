FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @twitch-bingo/api build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @twitch-bingo/api exec prisma migrate deploy && pnpm --filter @twitch-bingo/api start"]
