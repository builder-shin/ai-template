# {{NAME}}

FastAPI와 Next.js BFF 조합 프로젝트다. Node 24, pnpm 12.6.0, uv와 Docker가 필요하다.

```sh
pnpm setup
pnpm dev
```

api는 http://127.0.0.1:8000에서 열린다. 프론트 개발 주소: {{FRONTEND_URLS}}.
인프라는 `apps/api/compose.yaml`에 있고 루트 compose는 없다.
각 앱 setup이 환경 키를 준비한다. 고정 포트를 사용하므로 여러 프로젝트의 동시 실행은 지원하지 않는다.

- `pnpm check`: 루트와 api와 있는 프론트 검사.
- `pnpm gen`: api OpenAPI → 프론트 타입. 루트 `contract/`의 TypeSpec·목은 프론트 테스트의 대역이다.
- `pnpm test:e2e`: api E2E 후 실제 api 위에서 프론트 E2E. 포트: api 18000, {{FRONTEND_E2E_PORTS}}.
- `pnpm fix`, `pnpm test`, `pnpm db:migrate`, `pnpm db:reset`: [루트 지침](AGENTS.md)의 명령 표를 따른다.

구조는 `apps/api/`, {{FRONTEND_PATHS}}, `contract/`, `scripts/`다. 프론트들이 쓰는 계약은 루트 `contract/` 하나이며 앱 안에는 계약을 복사하지 않는다. 각 프론트의 `gen.config.json`은 api OpenAPI와 `../../contract`를 선택한다. 자세한 규칙과 인프라 포트는 [AGENTS.md](AGENTS.md), 앱별 절차: [api](apps/api/AGENTS.md), {{FRONTEND_GUIDES}}.
루트 계약 검사에는 첫 프론트에서 복사한 `tsconfig.base.json`·`docs/conventions/`와 같은 버전의 Node 타입·Vitest·YAML을 쓴다.

## 프론트 이미지

BuildKit이 필요하며 프로젝트 루트를 빌드 문맥으로 쓴다. 루트에서 실행한다.

{{FRONTEND_IMAGES}}

실행 전에 호출 환경에 다음 값을 설정한다. 서버 설정과 비밀은 이미지에 넣지 않는다.

| 키                         | 값                                           |
| -------------------------- | -------------------------------------------- |
| `API_BASE_URL`             | 컨테이너에서 닿는 api URL과 `/api/v1`        |
| `APP_URL`                  | 브라우저 앱 Origin({{FRONTEND_APP_ORIGINS}}) |
| `NEXT_PUBLIC_REALTIME_URL` | 브라우저에서 닿는 api Origin                 |
| `TIME_ZONE`                | 시간대(예: `Asia/Seoul`)                     |
| `SESSION_SECRET`           | 32바이트 이상의 난수 비밀                    |

{{FRONTEND_HEALTHCHECK}}

루트·각 프론트 사본의 공통 파일을 함께 맞춘다: `tsconfig.base.json`, `docs/conventions/`.
