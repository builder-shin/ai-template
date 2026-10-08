import { describe, expect, it } from "vitest";
import { mergeMessages } from "./merge";

describe("공유·앱 메시지 병합", () => {
  it("같은 namespace의 서로 다른 하위 키와 앱 문구를 보존한다", () => {
    const shared = { common: { spinner: "진행 중", nested: { retry: "다시 시도" } } };
    const app = { common: { nested: { save: "저장" } }, home: { title: "홈" } };
    const before = JSON.stringify({ shared, app });
    expect(mergeMessages(shared, app)).toEqual({
      common: { spinner: "진행 중", nested: { retry: "다시 시도", save: "저장" } },
      home: { title: "홈" },
    });
    expect(JSON.stringify({ shared, app })).toBe(before);
  });

  it("같은 문구인 중복 키도 경로와 고칠 방법을 안내하고 거절한다", () => {
    expect(() =>
      mergeMessages({ common: { title: "Title" } }, { common: { title: "Title" } }),
    ).toThrow("common.title이 공유·앱 카탈로그에 겹친다 — 중복 키를 한 카탈로그에만 둔다.");
  });

  it.each([
    [{ common: "문구" }, { common: { title: "Title" } }],
    [{ common: { title: "Title" } }, { common: "문구" }],
  ])("문자열과 namespace의 충돌도 거절한다", (shared, app) => {
    expect(() => mergeMessages(shared, app)).toThrow("common이 공유·앱 카탈로그에 겹친다");
  });
});
