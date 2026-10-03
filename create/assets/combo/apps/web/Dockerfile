# 조합 루트를 빌드 문맥으로 쓴다. 서버 설정과 비밀은 실행할 때 전달한다.
FROM node:24.19.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@12.6.0
# pnpm install은 루트 manifest가 있으면 필터 밖의 루트 도구도 설치하므로 뺀다.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/contract ./apps/web/contract
# 루트 도구와 api 대신 web과 그 workspace 의존성만 설치한다.
RUN pnpm --filter web... install --frozen-lockfile

FROM dependencies AS build
COPY apps/web ./apps/web
# 빌드에 URL을 전달해도 실행 단계의 환경에는 물려주지 않는다.
ARG API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
# pnpm run의 workspace 자동 설치를 피하고 설치된 Next만 실행한다.
WORKDIR /app/apps/web
RUN NEXT_OUTPUT=standalone node node_modules/next/dist/bin/next build

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home app
# 추적 루트의 workspace 배치를 보존하고 web의 정적 자산을 같은 위치에 둔다.
COPY --from=build --chown=10001:10001 /app/apps/web/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=10001:10001 /app/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache && chown 10001:10001 apps/web/.next/cache
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
