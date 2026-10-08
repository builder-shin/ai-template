import { expect, it } from "vitest";
import { checkHarness } from "./harness";

const base = { "AGENTS.md": "규칙", "CLAUDE.md": "@AGENTS.md", ".env.example": "" };
it.each([
  ["src/app/a.tsx", "export default () => <p>Loading...</p>;"],
  ["src/components/a.tsx", 'const message = "로딩 중...";'],
  ["src/features/a/view.tsx", 'export default () => <span>{"불러오는 중"}</span>;'],
  ["src/app/template.tsx", "export default () => <p>{`Loading ${n}`}</p>;"],
  ["src/app/template.tsx", "export default () => <p>{`${n} Loading ${total}`}</p>;"],
  ["src/app/template.tsx", "export default () => <p>{`${n} 불러오는 중`}</p>;"],
  ["src/app/a.tsx", 'export default () => <p title="Loading" />;'],
  ["src/app/a.tsx", 'export default () => <span className="sr-only">Loading</span>;'],
  ["src/app/a.tsx", 'const copy = {"status": "Loading"};'],
  ["messages/en.json", '{"submit":{"pending":"Loading…"}}'],
  ["messages/ko.json", '{"page":{"pending":"불러오는 중..."}}'],
  ["messages/shared/en.json", '{"submit":{"pending":"Loading…"}}'],
  ["messages/shared/ko.json", '{"page":{"pending":"불러오는 중..."}}'],
] as const)("%s의 로딩 문구를 막는다", (path, content) => {
  expect(checkHarness({ ...base, [path]: content }, []).join()).toMatch(/로딩 문구/);
});
it("aria-label만 접근성 예외로 두고 URL 속성·속성 이름·식별자·주석·테스트·사본은 검사하지 않는다", () => {
  expect(
    checkHarness(
      {
        ...base,
        "src/components/spinner.tsx":
          'import Loading from "./loading"; const loading = true; // Loading 예시\nexport default () => <svg aria-label="Loading" />;',
        "src/components/a.test.tsx": 'const fixture = "Loading...";',
        "src/app/a.tsx":
          'const state = {"loading": true}; export default () => <a href="/loading" />;',
        "src/app/b.tsx":
          'export default () => <a href={"/loading"}><img src={`/loading/${n}`} /></a>;',
        "contract/mock/a.tsx": 'const fixture = "Loading...";',
        "messages/en.json": '{"accessibility":{"spinner":"Loading"},"page":{"title":"Home"}}',
        "messages/shared/en.json": '{"accessibility":{"spinner":"Loading"}}',
      },
      [],
    ),
  ).toEqual([]);
});
