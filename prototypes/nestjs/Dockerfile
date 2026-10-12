# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.6.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused pnpm exec prisma generate && pnpm build # betterleaks:allow nonconnecting codegen credential

FROM base AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --create-home app
COPY --from=production-deps --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --chown=10001:10001 package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY --chown=10001:10001 prisma ./prisma
ENV NODE_ENV=production
USER 10001:10001
EXPOSE 8000
# Compose owns readiness; worker, scheduler and migrate use this same image.
CMD ["node", "dist/main.js"]
