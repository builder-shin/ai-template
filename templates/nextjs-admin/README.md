# Next.js admin

비밀번호 로그인과 관리 권한을 확인하는 독립 BFF 템플릿이다. `pnpm setup` 뒤 `pnpm dev`로 admin(3001)과 목(4011)을 실행한다.

완료 기준은 `pnpm check`다. 사용자 흐름은 `pnpm test:e2e`로 실제 목과 Chromium에서 검사한다. [지침](AGENTS.md), [아키텍처](docs/architecture.md), [스택](docs/stack.md)을 따른다.

글 관리 골든은 목록·필터·정렬·상세·발행·발행 취소·삭제·실시간을 제공한다. `pnpm gen:resource <type>`으로 새 선언·ko/en 문구·메뉴 등록 초안을 만든 뒤 [리소스 추가](docs/recipes/add-resource.md)를 따른다. 소셜로만 가입해 비밀번호가 없는 계정은 비밀번호를 설정한 뒤 로그인한다.
