# NestJS backend template

Node 24.15 이상·25 미만과 pnpm 12.6.0을 쓰는 ESM 템플릿이다. 현재 단계는 골격과 설정이다.

`pnpm install --frozen-lockfile`로 고정 의존성을 설치하고 `pnpm test`로 단위 시험을 실행한다.
`.env.example`의 공개 값이 개발 설정의 원본이며 52개 키를 모두 전달해야 한다.
설정 로더는 환경 변수만 검증하고 `.env`를 직접 열지 않는다.

`pnpm fix`는 포맷, `pnpm build`는 SWC 컴파일이다.
나머지 명령과 hook 모듈은 후속 Task에서 구현하며, 미구현 명령은 담당 Task를 알리고 1로 끝난다.
`pnpm check`는 현재 Task 2 안내로 실패하는 것이 예상 결과다.

명령·구조·규칙은 [AGENTS.md](AGENTS.md), 마이그레이션은 [레시피](docs/recipes/migration.md)를 따른다.
