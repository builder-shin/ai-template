# {{NAME}}

FastAPI와 Next.js BFF 조합 프로젝트다. Node 24, pnpm 12.6.0, uv와 Docker가 필요하다.

```sh
pnpm setup
pnpm dev
```

web은 http://localhost:3000, api는 http://127.0.0.1:8000에서 열린다.
인프라는 `apps/api/compose.yaml`에 있고 루트 compose는 없다.

- `pnpm check`: 루트와 두 앱 검사.
- `pnpm gen`: api OpenAPI → web 타입. TypeSpec·목은 프론트 테스트의 대역이다.
- `pnpm test:e2e`: api E2E 후 실제 api 위에서 web E2E. api 18000, web 3100을 쓴다.
- `pnpm fix`, `pnpm test`, `pnpm db:migrate`, `pnpm db:reset`: [루트 지침](AGENTS.md)의 명령 표를 따른다.

구조는 `apps/api/`, `apps/web/`, `scripts/`다. 자세한 규칙과 인프라 포트는 [AGENTS.md](AGENTS.md), 앱별 절차는 [api](apps/api/AGENTS.md)와 [web](apps/web/AGENTS.md)을 따른다.
각 앱 setup이 환경 키를 준비한다. 고정 포트를 사용하므로 여러 프로젝트의 동시 실행은 지원하지 않는다.

## web 이미지

BuildKit이 필요하며 프로젝트 루트를 빌드 문맥으로 쓴다. 루트에서 실행한다.

```sh
DOCKER_BUILDKIT=1 docker build -f apps/web/Dockerfile . --tag {{NAME}}-web
docker run --rm --publish 127.0.0.1:3200:3000 \
  --env API_BASE_URL --env APP_URL --env NEXT_PUBLIC_REALTIME_URL \
  --env TIME_ZONE --env SESSION_SECRET {{NAME}}-web
```

실행 전에 호출 환경에 다음 값을 설정한다. 서버 설정과 비밀은 이미지에 넣지 않는다.

| 키                         | 값                                                 |
| -------------------------- | -------------------------------------------------- |
| `API_BASE_URL`             | 컨테이너에서 닿는 api URL과 `/api/v1`              |
| `APP_URL`                  | 브라우저의 web Origin(예: `http://127.0.0.1:3200`) |
| `NEXT_PUBLIC_REALTIME_URL` | 브라우저에서 닿는 api Origin                       |
| `TIME_ZONE`                | 시간대(예: `Asia/Seoul`)                           |
| `SESSION_SECRET`           | 32바이트 이상의 난수 비밀                          |
