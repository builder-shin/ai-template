# NestJS backend template

Node 24.15 이상·25 미만과 pnpm 12.6.0을 쓰는 ESM 백엔드 템플릿이다.
인증·세션·OAuth·관리 권한·글·파일·메일 잡·실시간·관측과 검사 하네스를 제공한다.

`pnpm setup`은 고정 의존성을 설치하고 환경 파일·개발 인프라·세 DB와 버킷을 준비한다.
독립 git 루트에서는 lefthook을 설치하며 Betterleaks를 확인하고 개발 관리자와 글을 시드한다.
`.env.example`의 공개 값이 개발 설정의 원본이며 52개 키를 모두 전달해야 한다.
설정 로더는 환경 변수만 검증한다. 실행 스크립트는 필요한 키가 없을 때 Node의 환경 파일 로더를 쓴다.

`pnpm check --fast`는 포맷·Prisma 생성·린트·타입·하네스·단위 시험을 검사한다.
`pnpm check`와 `pnpm test`는 준비된 인프라에서 통합 시험까지 실행한다.
통합 시험은 app_test와 Redis 15를 사용하며 시험마다 상태를 비운다.
`pnpm fix`는 포맷과 린트를 고치고 `pnpm build`는 SWC로 컴파일한다.

`pnpm dev`는 API·worker·scheduler를 관리한다. `pnpm gen:module widgets`는 골든을
복사하고 등록·권한·이벤트·모델·파일 참조 보호와 단위 시험을 추가한다.
생성기는 DB에 연결하지 않으며 SQL 초안과 제품별 필드·문구는 이어서 검토한다.
pre-commit은 포맷 결과를 다시 스테이징하고 린트·비밀 검사를 실행한다.
pre-push와 단독 프로젝트 CI는 전체 check를 실행하고 CI는 E2E·이미지 빌드도 수행한다.

명령과 규칙은 [AGENTS.md](AGENTS.md), 구성은 [아키텍처](docs/architecture.md),
버전과 제한은 [스택](docs/stack.md), 변경은 [모듈 레시피](docs/recipes/module.md)를 따른다.
