# Server Action 추가

모든 명령과 경로는 이 프로젝트 루트 기준이다. 골든 예시는 `src/features/posts/actions.ts`의 `publishPostAction`과 `editor.tsx`의 `PostMutationForm`이다.

## 파일 순서

1. 설치된 Next 문서 `node_modules/next/dist/docs/01-app/02-guides/forms.md`와 [스택](../stack.md)의 React 문서를 읽는다. 새 API가 필요하면 [계약 확장](change-contract.md)을 먼저 끝낸다.
2. 기능의 `state.ts`에 직렬화 가능한 결과·입력 타입을 둔다. `FormResult`는 `src/lib/api/errors.ts`에서 type import한다. 다시 표시할 입력과 `retryAfter?: number | null`은 결과 타입에 보존하며 비밀번호·토큰은 넣지 않는다.
3. 기능 옆 `actions.integration.test.ts`에 실제 목을 부르는 성공·권한 거절·필드 오류·429 검사를 먼저 추가하고 RED를 확인한다. 계정은 `src/lib/testing/account.ts`, 별도 설정의 목은 `scripts/test/mock-server.ts`를 테스트에서만 쓴다.
4. `actions.ts` 첫 줄에 `"use server"`, 이어서 `import "server-only"`를 둔다. `(state, FormData)`를 받는 async 함수를 만든다. id가 있으면 첫 인자로 받고 화면에서 `bind(null, id)`한다. `getLocale`로 언어를 읽고 `createSessionApiClient({ locale })`로 생성 타입의 POST·PATCH·DELETE를 부른다. 폼 문자열은 종류만 확인하고 계약의 속성 이름으로 전달한다. 권한·길이·상태 전이 검증은 백엔드가 맡는다.
5. 오류는 `redirectOnUnauthorized(error, 로케일별_현재_폼_경로)`를 먼저 거친다. 예상한 4xx `ApiError`만 `toFormResult(error, locale, ["title", "body"])`처럼 **실제 입력칸 목록**으로 변환한다. 429의 `error.retryAfter`와 필요한 입력을 결과에 보존한다. 5xx·비API 오류는 throw하여 공통 오류 경계로 보낸다. refresh는 proxy만 하며 쿠키를 Action에서 임의로 갱신하지 않는다.
6. 성공한 요청 뒤 ko/en의 영향받는 경로를 `getPathname`·`revalidatePath`로 갱신한다. `redirect`는 API 호출의 try/catch 밖에서 실행한다. 변경된 서버 데이터를 클라이언트 캐시에 저장하지 않는다.
7. `messages/ko.json`·`messages/en.json`에 버튼·결과·대기 안내를 넣고 폼 컴포넌트를 맞춘다. `useActionState(action, 초기값, 로케일별_permalink)`의 반환 함수를 `<form action>`에 연결한다. 계약 속성과 같은 `name`, HTML의 required·type·maxLength, fieldErrors의 `aria-invalid`·`aria-describedby`를 쓴다. `SubmitButton`은 `<form>` 안에 둬 `useFormStatus`로 제출을 막고 스피너·실시간 폼 대기를 연결한다.
8. 기능의 `index.ts`에서 Action·폼을 내보내고 Server Component 페이지에서 공개 인터페이스만 가져온다. 기존 글 발행 연결은 다음처럼 쓴다. 새 동작은 자기 기능의 타입·문구·경로에 맞춘다.

```tsx
import { PostMutationForm, publishPostAction } from "@/features/posts";
import { getPathname } from "@/lib/i18n/navigation";

// 페이지가 조회한 글의 id와 현재 locale을 쓴다.
<PostMutationForm
  intent="publish"
  action={publishPostAction.bind(null, post.id)}
  permalink={getPathname({ locale, href: `/my-posts/${post.id}/edit` })}
/>;
```

## 규칙

- 같은 기능 안은 상대 import, 다른 기능·app은 공개 `index.ts`를 쓴다. API·세션·Action·queries는 server-only이며 클라이언트에 인증 토큰을 넘기지 않는다.
- 읽기는 Server Component, 쓰기는 Action이다. `useActionState`·`<form action>`·`toFormResult`와 permalink를 유지해 JS 없이도 제출한다.
- 문구·오류·접근성 이름은 ko/en으로 표시한다. 제출 중 로딩 문구는 쓰지 않고 스피너·스켈레톤만 쓴다. 429 대기 안내는 오류 결과의 번역이며 로딩 표시가 아니다.

## 확인

프로젝트 루트에서 RED·GREEN에 같은 명령을 쓴다. posts 외의 기능은 그 기능의 테스트 경로로 바꾼다.

```sh
pnpm exec vitest run src/features/posts/actions.integration.test.ts src/features/posts/editor.test.tsx
```

`scripts/http/my-posts.integration.test.ts`를 모델로 실제 SSR 폼을 ko/en에서 JS 없이 제출하고 오류 복원·303 이동을 확인한다. 새 사용자 흐름은 `e2e/`에 추가한다. 개발 서버를 종료하고 3100·4110을 비운 뒤 순서대로 실행한다.

```sh
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```
