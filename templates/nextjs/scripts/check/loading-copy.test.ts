import { expect, it } from "vitest";
import { checkHarness } from "./harness";

const base = { "AGENTS.md": "규칙", "CLAUDE.md": "@AGENTS.md", ".env.example": "" };
it.each([
  ["src/app/a.tsx", "export default () => <p>Loading...</p>;"],
  ["src/components/a.tsx", 'const message = "로딩 중...";'],
  ["src/features/a/view.tsx", 'export default () => <span>{"불러오는 중"}</span>;'],
  ["messages/en.json", '{"submit":{"pending":"Loading…"}}'],
  ["messages/ko.json", '{"page":{"pending":"불러오는 중..."}}'],
] as const)("%s의 로딩 문구를 막는다", (path, content) => {
  expect(checkHarness({ ...base, [path]: content }, []).join()).toMatch(/로딩 문구/);
});
it("aria-label만 허용하고 경로·식별자·주석·테스트·사본은 검사하지 않는다", () => {
  expect(
    checkHarness(
      {
        ...base,
        "src/components/spinner.tsx":
          'import Loading from "./loading"; const loading = true; // Loading 예시\nexport default () => <svg aria-label="Loading" />;',
        "src/components/a.test.tsx": 'const fixture = "Loading...";',
        "contract/mock/a.tsx": 'const fixture = "Loading...";',
        "messages/en.json": '{"accessibility":{"spinner":"Loading"},"page":{"title":"Home"}}',
      },
      [],
    ),
  ).toEqual([]);
});
