# 페이지 추가

예시: `/about`과 `/en/about`에 소개 페이지를 더한다.

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

4. 기능 데이터가 필요하면 기능의 공개 `index.ts`에서 가져온다. 클라이언트에서 백엔드를 직접 부르지 않는다.
5. 로딩 경계가 필요하면 `loading.tsx`에 스켈레톤만 둔다. 로딩 문구는 적지 않는다.
6. 날짜는 `getFormatter`(서버)나 `useFormatter`(클라이언트)로 표시해 요청의 `TIME_ZONE`을 따른다.
7. `pnpm fix`, `pnpm check`를 돌린다. `pnpm dev`로 `/about`과 `/en/about`의 제목과 문서를 확인한다.
