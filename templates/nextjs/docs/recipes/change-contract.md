# 계약 확장

모든 명령과 경로는 이 프로젝트 루트 기준이다. `contract/typespec/`와 `contract/mock/`는 이 프로젝트의 workspace다. 외부 저장소나 동기화 명령 없이 TypeSpec과 목 수기 소스를 고치고 `pnpm gen`한다.

예시: 글 응답에 읽기 전용 `excerpt`를 더한다. 본문의 처음 120개 Unicode 코드 포인트이며 Markdown 원문 그대로다. 선택 필드로 더해 기존 응답·클라이언트와 호환되게 하고 생성·수정 입력에는 넣지 않는다.

## 파일 순서

1. `docs/conventions/jsonapi.md`, `docs/conventions/error-codes.md`, `contract/typespec/src/resources/posts.tsp`, `contract/mock/src/modules/posts/routes.ts`·`documents.ts`를 읽는다. 이 예시는 기존 가시성·권한·상태 전이·operationId·에러·실시간 이벤트 이름을 바꾸지 않는다.
2. `contract/mock/test/post-excerpt.test.ts`를 먼저 만든다. 기존 `test/posts.ts`·`accounts.ts`의 실제 앱 도우미를 쓴다. 예를 들어 첫 검사는 다음과 같다.

```ts
import { expect, it } from "vitest";
import { newUser, send } from "./accounts.ts";
import { addPost, POSTS, postsApp } from "./posts.ts";

it("발행 글 단건 응답에 본문 앞 120글자를 준다", async () => {
  const { app, state } = postsApp();
  const author = await newUser(app, state);
  const post = addPost(state, author.userId, { body: "가".repeat(121) });
  const response = await send(app, "GET", `${POSTS}/${post.id}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: { attributes: { excerpt: "가".repeat(120) } },
  });
});
```

3. 같은 파일에 빈 본문·120글자·이모지의 절단, 목록 응답, `fields[posts]=excerpt`의 속성 선택, 남의 초안 404를 추가한다. 프로젝트 루트에서 아래 명령으로 excerpt가 없어서 실패하는 RED를 확인한다. 실제 제품 응답을 위조하거나 기존 검사를 약화하지 않는다.

```sh
pnpm --dir contract/mock exec vitest run test/post-excerpt.test.ts
```

4. `contract/typespec/src/resources/posts.tsp`의 `PostAttributes`에 아래 필드를 더한다. `PostCreateAttributes`·`PostUpdateAttributes`는 그대로 둔다. 새 리소스나 operation이면 `src/main.tsp`의 import와 JSON:API 문서·응답 상태·인증·권한·쿼리 선언도 함께 등록한다.

```tsp
/** 본문의 처음 120개 코드 포인트. Markdown 원문이다. */
@maxLength(120) excerpt?: string;
```

5. `pnpm --dir contract/typespec format`, `pnpm gen`을 차례로 실행한다. `contract/openapi.yaml`, `contract/mock/src/generated/api.ts`, `src/lib/api/schema.d.ts`, `src/lib/generated/`를 다시 만든다. 생성물은 Edit·Write로 직접 고치지 않는다. 새 에러는 `contract/typespec/src/errors.tsp`·규약·ko/en `errors`를 함께 맞춘다. 새 실시간 선언은 `contract/typespec/src/realtime.tsp`에서 시작한다.
6. `contract/mock/src/modules/posts/documents.ts`의 `postResource`가 조립하는 `attributes`에 아래 한 줄을 더한다. 기존 handler인 `routes.ts`의 `Posts_list`·`Posts_get`은 이 함수를 쓰므로 두 응답이 함께 확장된다. 생성·수정 응답과 `events.ts`의 이벤트도 같은 리소스를 쓴다. 저장 값이 아니므로 `model.ts`·`service.ts`·시드를 바꾸지 않는다.

```ts
excerpt: Array.from(post.body).slice(0, 120).join(""),
```

7. 계약은 타입별 `fields[<type>]` 매개변수를 선언한다. 파서는 요청한 멤버 이름을 집합으로 받고 renderer는 조립된 리소스의 속성·관계를 그 집합으로 거른다. `fields[posts]=excerpt`도 같은 방식으로 처리한다. 별도 필드 허용 목록이나 JSON 응답 복사본을 만들지 않는다. GREEN을 같은 명령으로 확인하고 기존 목록·쓰기·이벤트 검사도 확인한다.
8. UI에서 쓰려면 `src/features/posts/model.ts`의 `Post`와 응답 변환 → `queries.ts` → ko/en 카탈로그 → 컴포넌트 → `index.ts` → 페이지 순서로 연결한다. 선택 필드가 없는 응답도 처리한다. 외부 백엔드를 쓰는 프로젝트는 그 구현을 같은 계약에 맞춘 뒤 연결한다. 새 채널은 [실시간 구독](add-realtime.md)의 공통 listener 타입도 맞춘다.

## 규칙

- 계약의 원본은 TypeSpec이다. JSON:API type·data.id·status·pointer·에러 코드·쿼리·인증을 핸들러와 함께 맞춘다. 목 라우트는 `api.route(operationId, ...)`·`render`를 쓰며 경로·검증을 따로 복제하지 않는다.
- app·다른 기능은 공개 `index.ts`로 연결한다. API·세션·queries·Action은 server-only다. 읽기는 Server Component, 쓰기는 Action이며 클라이언트 데이터 캐시는 만들지 않는다.
- 새 폼은 `useActionState`·`<form action>`·`toFormResult`의 입력칸 목록·로케일별 permalink를 따른다. 문구·오류·접근성 이름은 ko/en, 로딩은 스피너·스켈레톤만 쓴다.
- 테스트 지원은 테스트에서만 import한다. `.env`를 읽거나 출력하지 않는다. 설정 키는 `.env.example`과 `src/lib/env.ts`로 확인한다.

## 확인

목 수기 소스는 web 포맷 대상에서 제외되므로 수정한 파일을 먼저 정리한다. 개발 서버를 종료하고 E2E의 3100·4110을 비운 뒤 프로젝트 루트에서 순서대로 실행한다.

```sh
pnpm exec prettier --write --ignore-path .gitignore contract/mock/src/modules/posts/documents.ts contract/mock/test/post-excerpt.test.ts
pnpm --dir contract/mock exec vitest run test/post-excerpt.test.ts test/posts-read.test.ts test/posts-write.test.ts test/posts-events.test.ts
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

check는 생성물 최신 여부·계약 패키지 타입·목 테스트·web 경계·i18n·실제 HTTP 통합을 검사한다. 새 화면은 컴포넌트·HTTP·E2E에서 두 언어로 확인하며 외부 대상 설정은 `e2e/AGENTS.md`를 따른다.
