# 기능 추가

모든 명령과 경로는 이 프로젝트 루트 기준이다. 골든 posts의 읽기·쓰기·폼·실시간 흐름을 새 기능의 초안으로 복사한다.

## 파일 순서

1. 템플릿 루트에서 `pnpm gen:feature comments`를 실행한다. 이름은 20자 이하 영어 소문자 복수형 kebab-case다. 복합 이름은 `blog-posts`, 불규칙 단수형은 `people --singular person`처럼 쓴다.
2. 생성기가 `src/features/<이름>`, `src/app/[locale]/<이름>`, `src/app/[locale]/my-<이름>`, 두 HTTP 테스트를 복사한다. ko/en 메시지 namespace와 로그인 보호 경로도 등록한다. 이미 있는 기능·화면·테스트·namespace는 덮어쓰지 않는다.
3. 출력한 `경로:줄`의 고칠 곳을 확인한다. API 경로·JSON:API type·계약 타입·에러 코드·실시간 채널은 기존 posts 계약을 쓴다. [계약 확장](change-contract.md) 순서로 새 TypeSpec과 목 핸들러를 만든 뒤 `pnpm gen`하고 이 값을 바꾼다. 계약 생성물을 직접 고치지 않는다.
4. `src/features/comments/model.ts`·`state.ts` → `queries.ts` → `actions.ts` → 컴포넌트·`realtime.tsx` → `index.ts` 순서로 속성·관계·상태·권한·입력칸 오류를 맞춘다. 새 채널은 [실시간 구독](add-realtime.md)의 공통 타입도 맞춘다.
5. `messages/ko.json`·`messages/en.json`의 새 namespace를 고친 뒤 `src/app/[locale]/comments/`·`my-comments/`의 화면을 맞춘다. `src/components/header.tsx`·`src/app/[locale]/page.tsx`에 진입 링크를 더한다. 등록된 내 기능 화면은 `/my-comments`에서 로그인 검사를 받는다.
6. 복사된 기능 옆 단위·실제 목 테스트와 `scripts/http/`의 두 HTTP 테스트를 새 계약에 맞춘다. 새 사용자 흐름은 `e2e/`에서 역할·번역한 이름으로 검사한다. 일반 흐름에 대상별 분기를 넣지 않는다.

생성기는 camel·Pascal·snake·대문자 식별자와 kebab 화면·파일 이름의 단수·복수 표기를 한 번씩 바꾼다. 번역 키도 이름을 바꾸지만 문구는 초안이므로 검토한다. HTTP 메서드 POST와 계약의 값은 그대로 둔다.

골든 코드의 `gen:feature:` 표시에서 `빼기`는 한 줄, `빼기 시작`·`빼기 끝`은 구간을 제외한다. `그대로`는 같은 줄을 바꾸지 않는다. `고칠 곳 — 설명`은 새 기능에 남기고 출력한다. 생성된 기능은 편집할 소스이며 `pnpm gen`의 직접 수정 금지 생성물과 구분한다.

## 규칙

- app과 다른 기능은 공개 `index.ts`만 import한다. `lib`는 기능을 import하지 않는다. `queries.ts`·`actions.ts`와 API·세션 기반은 server-only다.
- Server Component가 읽고 Server Action이 쓴다. 클라이언트 데이터 캐시는 만들지 않는다. 폼은 `useActionState`·`<form action>`·로케일별 permalink·`toFormResult`의 입력칸 목록을 따른다.
- 문구·오류·접근 가능한 이름은 ko/en 카탈로그에 둔다. 로딩은 스피너·스켈레톤만 쓴다. 업로드와 Markdown 미리보기에는 JS가 필요하며 일반 입력·상태 변경·삭제 확인 폼은 JS 없이 제출된다.

## 확인

개발 서버를 종료한 뒤 프로젝트 루트에서 순서대로 실행한다. E2E의 3100·4110은 비워 둔다.

```sh
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

새 기능의 권한 거절·필드 오류·ko/en 이동·실시간 갱신과 JS 없는 폼을 확인한다. 준비된 외부 FastAPI 대상은 `e2e/AGENTS.md`의 설정으로 같은 E2E를 실행한다.
