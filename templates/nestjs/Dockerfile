# 독립 Nest 프로젝트를 문맥으로 빌드하고 설정은 실행할 때 전달한다.
FROM node:24.19.0-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@12.6.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# 클라이언트 생성은 이 주소에 연결하지 않는다.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm exec prisma generate # betterleaks:allow 사유: 연결하지 않는 빌드 주소
RUN pnpm build

FROM base AS production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --no-create-home app
COPY --from=production --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --from=build --chown=10001:10001 /app/prisma ./prisma
COPY --from=build --chown=10001:10001 /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
USER 10001:10001
EXPOSE 8000
CMD ["node", "--import", "./dist/core/telemetry/register.js", "dist/main.js"]
