import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateMetadata, generateWeb, staleFiles } from "./generate";

const spec = {
  components: {
    schemas: { ErrorCode: { enum: ["auth.unauthenticated", "resource.not_found"] }, Changed: {} },
  },
  "x-realtime-events": [{ name: "me.updated", payload: "Changed" }],
};

describe("계약 생성", () => {
  it("실제 계약으로 web 생성물을 모두 재현한다", async () => {
    const files = await generateWeb(readFileSync("contract/openapi.yaml", "utf8"));
    for (const [path, expected] of Object.entries(files)) {
      expect(expected.startsWith("// 직접 수정 금지")).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(expected);
    }
    expect(files["src/lib/generated/realtime.ts"]).toContain('"post.deleted"');
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"auth.refresh_token_reused"');
  });
  it("계약의 에러 코드와 실시간 payload 타입을 생성한다", () => {
    const files = generateMetadata(spec);
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"resource.not_found"');
    expect(files["src/lib/generated/realtime.ts"]).toContain(
      '"me.updated": components["schemas"]["Changed"]',
    );
    expect(Object.values(files).every((text) => text.startsWith("// 직접 수정 금지"))).toBe(true);
  });
  it("없는 payload 참조를 거절한다", () => {
    expect(() =>
      generateMetadata({ ...spec, "x-realtime-events": [{ name: "changed", payload: "Missing" }] }),
    ).toThrow(/Missing/);
  });
  it("빠진 파일과 바뀐 파일을 모두 찾는다", () => {
    expect(staleFiles({ a: "new", b: "same", c: "missing" }, { a: "old", b: "same" })).toEqual([
      "a",
      "c",
    ]);
    expect(staleFiles({ a: "same" }, { a: "same" })).toEqual([]);
  });
});
