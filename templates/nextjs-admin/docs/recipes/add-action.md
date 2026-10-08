# 리소스 동작 추가

`src/resources/posts/actions.ts`의 publish·unpublish를 기준으로 삼는다. 상태 변경은 PATCH의 attributes.status만 보낸다.

1. 리소스 폴더의 `actions.ts`에 `import "server-only"`를 둔다. Server Action 함수에는 함수 본문 첫 줄에 `"use server"`를 둔다. 파일 전체에 use server를 붙이면 메타데이터 객체를 export할 수 없으므로 선언 객체와 함수를 함께 둘 때는 골든의 inline 형식을 따른다.
2. `ResourceAction<"type">`으로 `{ name, permission, action, visible?, confirmation? }`을 선언한다. name은 `publish`처럼 번역 namespace를 뺀 이름이다. action은 id를 받아 `Promise<FormResult>`를 반환한다. 파괴적 동작은 confirmation을 켠다.
3. 함수는 requireAdmin·자기 permission·최신 API 상세의 조건을 다시 확인한다. 버튼을 숨기거나 범용 실행기가 검사해도 직접 호출되는 함수를 보호해야 한다. 토큰은 createSessionApiClient로 읽고 권한의 최종 판정은 API가 맡는다.
4. `resource.ts`의 actions에 등록한다. `messages/{ko,en}.json`의 `resources.<type>.actions.<name>`을 채운다. visible은 최신 record로 판정하며 서버 선언에서만 실행한다.
5. ApiError는 toFormResult로 번역하고 retryAfter를 결과에 보존한다. 401은 redirectOnUnauthorized, Next의 redirect·notFound 제어 예외는 다시 던진다. 오류를 삼켜 성공으로 돌리지 않는다.
6. 성공한 범용 실행기는 현재 언어의 목록을 revalidate하고 버튼이 화면을 refresh한다. 동작 함수가 직접 이동해야 하는 특별한 흐름은 레시피에 근거를 적는다.
7. 실제 목에서 권한 없음·조건 불일치·성공 문서·404·429를 검사하고 DOM에서 visible·확인 취소·확인 제출·실패 안내를 확인한다. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 통과시킨다.
