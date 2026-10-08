# 리소스 추가

골든은 `src/resources/posts/resource.ts`와 `actions.ts`다. 화면은 범용 컴포넌트가 만든다. 글 골든에는 작성·수정 폼이 없으므로 폼은 계약의 쓰기 스키마와 `src/lib/resources/definition.ts`를 따른다.

1. `contract/typespec/src/`에서 JSON:API type·목록 GET·쿼리·쓰기 operation을 확인한다. 계약을 늘리면 [계약 확장](change-contract.md)을 먼저 따른다. `src/lib/api/schema.d.ts`는 직접 고치지 않는다.
2. `pnpm gen:resource <type>`을 실행한다. type은 50자 이하 소문자 kebab-case다. 기본 입력은 `contract/openapi.yaml`이며 `gen.config.json`의 contract·openapi 설정을 따른다. `openapi`가 있으면 API 타입 생성과 같은 백엔드 스펙을 읽는다.
3. 출력은 `src/resources/<type>/resource.ts`, `messages/{ko,en}.json`, `src/resources/index.ts`다. 기존 등록 순서를 보존하고 마지막에 추가한다. 목록 없는 type·기존 리소스 폴더·문구 namespace·등록·링크 경로·잘못된 입력은 쓰기 전에 거절한다. 덮어쓰기 옵션은 없다.
4. 선언을 검토한다. 열·상세는 응답의 attributes·relationships, create·edit 입력은 요청 스키마와 응답 필드의 교집합이다. GET 상세·POST·PATCH·DELETE가 있는 화면만 만든다. 생성 초안은 수정 가능한 수기 파일이며 `pnpm gen`이 다시 만들지 않는다.
5. 목록의 `filter[...]` 쿼리를 검토한다. enum은 values, 날짜는 date, 이름이 같은 관계는 relation이며 나머지는 text다. `filter[role]`처럼 관계 이름과 다른 쿼리는 text 초안으로 남으므로 범용 화면이 지원하는 메타데이터에 맞춰 검토한다. 페이지 크기는 20이다.
6. sort는 `x-jsonapi-sort`, 쿼리 enum, 속성 키 순서로 후보를 뽑는다. `sort` 쿼리가 없으면 생략한다. 현재 선언 타입이 속성 키만 받으므로 `id` 같은 속성 밖 후보는 제외한다. 서버가 실제 허용하는 필드만 남긴다. include는 쿼리가 있을 때 관계 키와 계약 확장의 교집합을 쓴다.
7. 각 permission을 검토한다. 생성기는 operation의 `x-permission`을 쓰며 없으면 `admin:access`를 넣는다. 실제 리소스 읽기·쓰기 권한으로 바꾼다. 백엔드는 최종 권한을 확인한다. 글은 생성·수정 operation이 있어도 관리 앱에서 작성·수정 선언을 제거한다.
8. 최상위 fields의 표시 종류·enum values·관계의 type·label·search를 검토한다. 관계 label 후보는 name·title·code·email, 없으면 id다. 대상 목록에 `filter[q]`가 있을 때 search를 켠다. 여러 줄·복합 속성·파일 입력은 계약과 제품 요구에 맞춰 바꾼다. [필드 종류](add-field-kind.md)를 따른다.
9. ko/en의 title·fields·enums 자리표시자를 번역한다. 점이 있는 enum은 중첩 객체다. 예: `user.roles_changed`는 `enums.action.user.roles_changed`에 둔다. [동작](add-action.md)과 실시간 채널은 사람이 선언한다. 채널을 선언하면 목록·상세가 이벤트를 100ms 창으로 묶어 갱신한다.
10. 계약 조각 생성 테스트, 실제 목 데이터·Action 검사, DOM·E2E를 더한다. 권한별 메뉴·화면·직접 Action 호출, 필드 오류·403·404·429·관계 옵션 실패를 확인한다. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 실행하고 시작한 서버를 종료한다.

리소스끼리 내부를 import하지 않는다. 화면은 등록 목록만 가져온다. 선언과 서버 모듈에는 `import "server-only"`를 둔다. 범용 화면 전체를 바꾸지 않고 필드 표시·입력만 바꾼다.
