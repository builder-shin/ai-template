# 리소스 추가

골든은 `src/resources/posts/resource.ts`와 `actions.ts`다. 화면은 범용 컴포넌트가 만든다. 글 골든에는 작성·수정 폼이 없으므로 폼은 계약의 쓰기 스키마와 `src/lib/resources/definition.ts`를 따른다.

1. `contract/typespec/src/`에서 JSON:API type·목록 GET·쿼리·쓰기 operation을 확인한다. 계약을 늘리면 [계약 확장](change-contract.md)을 먼저 따른다. `src/lib/api/schema.d.ts`는 직접 고치지 않는다.
2. `pnpm gen:resource <type>`을 실행한다. type은 50자 이하 소문자 kebab-case다. 기본 입력은 `contract/openapi.yaml`이며 `gen.config.json`의 contract·openapi 설정을 따른다. `openapi`가 있으면 API 타입 생성과 같은 백엔드 스펙을 읽는다.
3. 출력은 `src/resources/<type>/resource.ts`, `messages/{ko,en}.json`, `src/resources/index.ts`다. 반환값과 CLI 성공 출력의 파일 경로는 앱 기준 상대 경로이며 Windows에서도 `/`로 구분한다. 기존 등록 순서를 보존하고 마지막에 추가한다. 목록 없는 type·기존 리소스 폴더·문구 namespace·등록·링크 경로·잘못된 입력은 쓰기 전에 거절한다. 덮어쓰기 옵션은 없다.
4. 선언을 검토한다. 열·상세는 응답의 attributes·relationships, create·edit 입력은 요청 스키마와 응답 필드의 교집합이다. GET 상세·POST·PATCH·DELETE가 있는 화면만 만든다. 생성 초안은 수정 가능한 수기 파일이며 `pnpm gen`이 다시 만들지 않는다.
5. 목록의 `filter[...]` 쿼리를 검토한다. enum은 values, 날짜는 date, 이름이 같은 관계는 relation이며 나머지는 text다. `filter[role]`처럼 관계 이름과 다른 쿼리는 text 초안으로 남으므로 범용 화면이 지원하는 메타데이터에 맞춰 검토한다. 페이지 크기는 20이다.
6. sort는 `x-jsonapi-sort`, 쿼리 enum, 속성 키 순서로 후보를 뽑는다. `sort` 쿼리가 없으면 생략한다. 현재 선언 타입이 속성 키만 받으므로 `id` 같은 속성 밖 후보는 제외한다. 서버가 실제 허용하는 필드만 남긴다. include는 쿼리가 있을 때 관계 키와 `x-jsonapi-include`의 교집합을 쓰며, `x-jsonapi-include`가 없으면 모든 관계를 넣는다.
7. 각 permission을 검토한다. 생성기는 operation의 `x-permission`을 쓰며 없으면 `admin:access`를 넣는다. 실제 리소스 읽기·쓰기 권한으로 바꾼다. 백엔드는 최종 권한을 확인한다. 글은 생성·수정 operation이 있어도 관리 앱에서 작성·수정 선언을 제거한다.
8. 최상위 fields의 표시 종류·enum values·관계의 type·label·search를 검토한다. 관계 키의 type은 계약의 대상이며 그 밖의 필드는 목록이 있는 ResourceType을 받는다. label은 그 대상의 속성 키다. 생성기의 후보는 name·title·code·email·filename, 없으면 첫 속성이다. 목록 없는 파일은 단건 응답의 filename을 쓰며 id는 라벨 키가 아니다. 파일 표시는 지원하지만 기본 선택기는 대상 목록이 필요하므로 파일 입력 초안은 제거하거나 별도 입력으로 바꾼다. 쓰기 계약의 단일 관계는 relation, 다중 관계는 relation-many만 선언한다.
9. 대상 목록에 `filter[q]`가 있을 때 search를 켠다. 검색 가능한 관계 옵션은 첫 페이지 20개만 읽고 대상 검색으로 찾는다. 검색 없는 대상만 마지막 페이지까지 읽는다. 목록·폼·실시간 갱신마다 검색 가능한 대상의 전체 페이지를 읽지 않는다. 폼 옵션은 관계·열거값 입력에만 주며, 관계 현재값은 단건 included의 라벨이나 id로 보충하고 추가 요청하지 않는다. 대상 목록의 403은 해당 입력만 비활성화하고 번역 안내를 옆에 보이며 다른 입력과 저장을 유지한다. 다른 오류는 기존 경계로 던진다. 폼의 빈 단일 관계는 resource.none(선택 안 함/None), 필터는 resource.all(전체/All)이다. 등록한 상세 화면과 보기 권한이 있는 대상에만 관계 링크를 만들고 그 밖에는 이름만 보인다. 여러 줄·복합 속성·파일 입력은 [필드 종류](add-field-kind.md)를 따른다.
10. ko/en의 title·fields·enums 자리표시자를 번역한다. 점이 있는 enum은 중첩 객체다. 예: `user.roles_changed`는 `enums.action.user.roles_changed`에 둔다. [동작](add-action.md)과 실시간 채널은 사람이 선언한다. 채널을 선언하면 목록·상세가 첫 이벤트부터 1초 고정 창으로 묶어 갱신한다. 상세는 자신의 레코드 이벤트만 반영하고 숨은 탭은 다시 보일 때 한 번 갱신한다.
11. 계약 조각 생성 테스트, 실제 목 데이터·Action 검사, DOM·E2E를 더한다. 권한별 메뉴·화면·직접 Action 호출, 필드 오류·403·404·429·관계 옵션 실패를 확인한다. 저장·취소는 상세가 있으면 상세로, 없으면 목록으로 돌아가는지 확인한다. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 실행하고 시작한 서버를 종료한다.

리소스끼리 내부를 import하지 않는다. 화면은 등록 목록만 가져온다. 선언과 서버 모듈에는 `import "server-only"`를 둔다. 범용 화면 전체를 바꾸지 않고 필드 표시·입력만 바꾼다.
