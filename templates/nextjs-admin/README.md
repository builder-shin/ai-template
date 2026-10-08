# Next.js admin

비밀번호 로그인과 관리 권한을 확인하는 독립 BFF 템플릿이다. `pnpm setup` 뒤 `pnpm dev`로 admin(3001)과 목(4011)을 실행한다.

글 골든은 `src/resources/posts/`다. 목록의 검색·상태·작성자 필터, 정렬·페이지와 상세, 발행·발행 취소·삭제를 제공한다. 작성자 옵션은 대상 검색으로 찾고 실시간 변경은 목록·상세에 반영한다. 글 작성·수정 화면은 없다.

완료 기준은 `pnpm check`다. `pnpm test:e2e`로 실제 목과 Chromium에서 인증·글·권한·언어 시나리오 11개를 검사한다. [지침](AGENTS.md), [아키텍처](docs/architecture.md), [스택](docs/stack.md)을 따른다.
