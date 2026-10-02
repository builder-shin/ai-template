# 페이지 추가

예시: `/about`과 `/en/about`에 소개 페이지를 더한다.

모든 명령과 경로는 이 프로젝트 루트 기준이다.

## 파일 순서

1. `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`를 읽는다.
2. `messages/ko.json`과 `messages/en.json`에 `about.title`, `about.description`을 함께 추가한다.
3. `src/app/[locale]/about/page.tsx`를 만든다.

```tsx
import { getTranslations } from "next-intl/server";

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("description")}</p>
    </main>
  );
}
```

4. 기능 데이터가 필요하면 `src/features/<기능>/queries.ts`·`index.ts`를 먼저 맞추고 페이지에서 공개 인터페이스를 가져온다. queries는 `import "server-only"`를 둔다. 클라이언트에서 백엔드를 직접 부르거나 데이터 캐시를 만들지 않는다.
5. 로딩 경계가 필요하면 `loading.tsx`에 스켈레톤만 둔다. 로딩 문구는 적지 않는다.
6. 날짜는 `getFormatter`(서버)나 `useFormatter`(클라이언트)로 표시해 요청의 `TIME_ZONE`을 따른다.
7. `src/components/header.tsx`나 `src/app/[locale]/page.tsx`에 `lib/i18n/navigation`의 `Link`로 진입 링크를 더한다. 링크 이름도 카탈로그에서 가져온다. 로그인 필수 페이지라면 `src/lib/session/redirect.ts`의 `requiresLogin` 안 배열에 경로를 더한다. [proxy 단위 검사](../../scripts/session-proxy.test.ts)·[보호 경로 HTTP 검사](../../scripts/http/protected-path.integration.test.ts)·[인증 E2E](../../e2e/auth.spec.ts)를 모델로 직접 접근·하위 경로·returnTo를 검사한다.

## 규칙

- 페이지는 Server Component로 읽는다. 다른 기능의 내부 파일은 import하지 않으며 API·세션은 server-only로 유지한다.
- 쓰기는 [Server Action](add-action.md)에 둔다. 폼은 `useActionState`·`<form action>`·`toFormResult`를 따른다.
- 제목·설명·링크·접근성 이름은 ko/en 카탈로그에 둔다. 로딩은 스피너·스켈레톤만 쓰고 문구는 적지 않는다.

## 확인

사용자에게 보이는 동작은 기능 옆 컴포넌트 테스트나 `scripts/http/`의 실제 페이지 검사로 확인한다. 새 흐름이 있으면 `e2e/`에 ko/en 접근·링크·로그인 보호를 추가한다. 문서만 베끼는 테스트는 만들지 않는다.

프로젝트 루트에서 순서대로 실행한다. 개발 서버를 종료하고 E2E의 3100·4110을 비워 둔다.

```sh
pnpm fix
pnpm check
pnpm build
pnpm test:e2e
```

화면을 직접 확인할 때는 검사 뒤 `pnpm dev`로 `/about`·`/en/about`을 열어 제목·언어·키보드 이동을 확인하고 서버를 종료한다.
