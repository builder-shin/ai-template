# Next.js web 템플릿

Node 24와 pnpm 12.6.0을 설치한 뒤 이 폴더를 독립 프로젝트로 복사한다.

```sh
pnpm setup
pnpm dev
```

http://localhost:3000 에서 홈 화면을 연다. `setup`은 여러 번 실행해도 기존 환경 값을 보존한다.
기본 API 주소에서는 목 서버도 4010에 함께 뜬다. `API_BASE_URL`을 백엔드 주소로 설정하면 web만 시작한다. Ctrl+C로 함께 내린다.

ko/en 화면, BFF 세션·proxy 갱신, 가입·메일 인증·로그인·비밀번호 재설정·소셜 로그인, 글·내 글·커버 업로드, 내 정보·아바타·세션·탈퇴와 실시간 갱신을 제공한다. 하네스가 타입·모듈 경계·생성물·번역을 검사하며 실제 목과 Next에 붙는 HTTP 통합 검사와 Chromium E2E 20개를 포함한다.

단독 프로젝트는 자체 TypeSpec·목 workspace를 쓴다. 조합에서는 생성기가 백엔드 OpenAPI 입력과 백엔드 모드 API 주소를 설정하며, 백엔드 gen 뒤 web gen 순서로 타입을 맞춘다. 목은 개발·통합 테스트의 대역으로 남고 실제 백엔드 연결은 E2E로 확인한다.

```sh
pnpm check
pnpm fix
pnpm test
pnpm test:e2e
```

빌드는 예시 환경으로도 가능하다. 운영 서버 시작 전에 `SESSION_SECRET`을 32바이트 이상의 새 비밀로 설정한다. 예시 비밀로는 운영 서버를 시작할 수 없다.
단독 프로젝트의 `.github/workflows/ci.yml`은 고정 의존성·Chromium 설치 뒤 check·mock E2E·이미지 빌드를 실행한다. 조합 프로젝트는 루트 CI가 두 앱을 함께 검사한다.

- [작업 지침](AGENTS.md)
- [아키텍처](docs/architecture.md)
- [버전과 문서](docs/stack.md)
