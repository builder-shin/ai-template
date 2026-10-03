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
