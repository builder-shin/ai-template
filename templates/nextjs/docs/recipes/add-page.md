# 페이지 추가

예시: `/about`에 정적인 소개 페이지를 더한다.

1. `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`를 읽는다.
2. `src/app/about/page.tsx`를 만든다.

```tsx
export default function AboutPage() {
  return (
    <main>
      <h1>서비스 소개</h1>
      <p>서비스가 하는 일을 적는다.</p>
    </main>
  );
}
```

3. 기능 데이터가 필요하면 기능의 공개 `index.ts`에서 가져온다. 클라이언트에서 백엔드를 직접 부르지 않는다.
4. 로딩 경계가 필요하면 `loading.tsx`에 스켈레톤만 둔다. 로딩 문구는 적지 않는다.
5. i18n을 붙인 프로젝트에서는 로케일 라우트 안에 페이지를 만들고 ko/en 카탈로그를 함께 고친다.
6. `pnpm fix`, `pnpm check`를 돌린다. `pnpm dev`로 `/about`의 제목과 문서를 확인한다.
