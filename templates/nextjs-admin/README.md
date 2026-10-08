# Next.js admin

비밀번호 로그인과 관리 권한을 확인하는 독립 BFF 템플릿이다. `pnpm setup` 뒤 `pnpm dev`로 admin(3001)과 목(4011)을 실행한다.

완료 기준은 `pnpm check`다. 사용자 흐름은 `pnpm test:e2e`로 실제 목과 Chromium에서 검사한다. [지침](AGENTS.md), [아키텍처](docs/architecture.md), [스택](docs/stack.md)을 따른다.
