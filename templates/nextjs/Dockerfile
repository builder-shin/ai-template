# 복사한 web 프로젝트만 빌드 문맥으로 쓴다. 서버 설정과 비밀은 실행할 때 전달한다.
FROM node:24.19.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY contract ./contract
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
# 빌드에 URL을 전달해도 실행 단계의 환경에는 물려주지 않는다.
ARG API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home app
# standalone의 서버·추적 의존성과 별도 정적 자산만 가져간다.
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/public ./public
RUN mkdir -p .next/cache && chown 10001:10001 .next/cache
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
