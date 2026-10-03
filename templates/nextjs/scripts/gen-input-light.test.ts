import { expect, it, vi } from "vitest";

// 입력 선택은 생성기 패키지를 불러오지 않아야 Stop hook에서도 가볍다.
vi.mock("openapi-typescript", () => { throw new Error("생성기를 불러왔다"); });
vi.mock("yaml", () => { throw new Error("YAML 파서를 불러왔다"); });

it("입력 선택만 할 때 생성기와 YAML 파서를 불러오지 않는다", async () => {
  const { readWebOpenapi } = await import("./gen-input");
  expect(readWebOpenapi(import.meta.dirname, "contract")).toBe("contract");
});
