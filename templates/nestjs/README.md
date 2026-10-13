# NestJS backend template

Node 24.15 이상·25 미만과 pnpm 12.6.0을 쓰는 ESM 백엔드 템플릿이다.
계정 Prisma 모델, 트랜잭션, DB 가드, Redis 연결과 검사 하네스를 제공한다.

`pnpm setup`은 고정 의존성을 설치하고 환경 파일·개발 인프라·세 DB를 준비한다.
`.env.example`의 공개 값이 개발 설정의 원본이며 52개 키를 모두 전달해야 한다.
설정 로더는 환경 변수만 검증한다. 실행 스크립트는 필요한 키가 없을 때 Node의 환경 파일 로더를 쓴다.

`pnpm check --fast`는 포맷·Prisma 생성·린트·타입·하네스·단위 시험을 검사한다.
`pnpm check`와 `pnpm test`는 준비된 인프라에서 통합 시험까지 실행한다.
통합 시험은 app_test와 Redis 15를 사용하며 시험마다 상태를 비운다.
`pnpm fix`는 포맷과 린트를 고치고 `pnpm build`는 SWC로 컴파일한다.

API·개발 서버·E2E·모듈 생성기와 hook 모듈은 후속 Task에서 구현한다.
명령·구조·규칙은 [AGENTS.md](AGENTS.md), 마이그레이션은 [레시피](docs/recipes/migration.md)를 따른다.
