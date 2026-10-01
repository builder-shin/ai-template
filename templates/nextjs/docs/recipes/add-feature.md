# 기능 추가

1. 템플릿 루트에서 `pnpm gen:feature comments`를 실행한다. 이름은 20자 이하 영어 소문자 복수형 kebab-case다. 복합 이름은 `blog-posts`, 불규칙 단수형은 `people --singular person`처럼 쓴다.
2. 생성기가 `src/features/<이름>`, `src/app/[locale]/<이름>`, `src/app/[locale]/my-<이름>`, 두 HTTP 테스트를 복사한다. ko/en 메시지 namespace와 로그인 보호 경로도 등록한다. 이미 있는 기능·화면·테스트·namespace는 덮어쓰지 않는다.
3. 출력한 `경로:줄`의 고칠 곳을 확인한다. API 경로·JSON:API type·계약 타입·에러 코드·실시간 채널은 기존 posts 계약을 쓴다. 새 기능의 TypeSpec과 목 핸들러를 만든 뒤 `pnpm gen`하고 이 값을 바꾼다. 계약 생성물을 직접 고치지 않는다.
4. 속성·관계·상태·권한·입력칸 오류를 맞추고 ko/en 새 namespace의 문구를 고친다. 헤더·홈에 새 화면의 링크를 더한다. 등록된 내 기능 화면은 `/my-<이름>`에서 로그인 검사를 받는다.
5. 복사된 단위·실제 목·HTTP 테스트를 새 계약에 맞춘다. `pnpm check`, `pnpm build`, `pnpm test:e2e`로 확인한다.

생성기는 camel·Pascal·snake·대문자 식별자와 kebab 화면·파일 이름의 단수·복수 표기를 한 번씩 바꾼다. 번역 키도 이름을 바꾸지만 문구는 초안이므로 검토한다. HTTP 메서드 POST와 계약의 값은 그대로 둔다.

골든 코드의 `gen:feature:` 표시는 FastAPI `gen:module`과 같은 방식이다. `빼기`는 한 줄, `빼기 시작`·`빼기 끝`은 구간을 제외한다. `그대로`는 같은 줄을 바꾸지 않는다. `고칠 곳 — 설명`은 새 기능에 남기고 출력한다. 생성된 기능은 편집할 소스이며 `pnpm gen`의 직접 수정 금지 생성물과 구분한다.

업로드와 Markdown 미리보기에는 JS가 필요하다. 일반 입력·상태 변경·삭제 확인 폼은 JS 없이 제출되고, 로딩은 스피너·스켈레톤으로만 표시한다.
