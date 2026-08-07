FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @bingo-buddy/api exec prisma generate && pnpm --filter @bingo-buddy/api build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @bingo-buddy/api exec prisma migrate deploy && pnpm --filter @bingo-buddy/api start"]
