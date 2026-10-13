import { Controller, Delete, Get, Module } from "@nestjs/common";
import { expect, it } from "vitest";
import { unexpectedOverlaps } from "../routes.js";
import { testApp } from "./fixtures.js";

const specific = { method: "DELETE", path: "/api/v1/sessions/current" };
const dynamic = { method: "DELETE", path: "/api/v1/sessions/:id" };
it("route overlap audit는 허용 목록 밖의 모든 겹침을 찾는다", () => {
  expect(unexpectedOverlaps([specific, dynamic], [])).toEqual([[specific, dynamic]]);
  expect(unexpectedOverlaps([specific, dynamic], [[dynamic, specific]])).toEqual([]);
  const post = { method: "POST", path: specific.path };
  const disjoint = { method: "DELETE", path: "/api/v1/users/:id" };
  const other = { method: "DELETE", path: "/api/v1/sessions/latest" };
  expect(
    unexpectedOverlaps([specific, post, disjoint, dynamic, other], [[specific, dynamic]]),
  ).toEqual([[dynamic, other]]);
});
it("매개변수 이름과 TypeSpec 표기가 달라도 겹침을 찾는다", () => {
  const a = { method: "GET", path: "/api/v1/:type/current" };
  const b = { method: "GET", path: "/api/v1/sessions/{id}" };
  expect(unexpectedOverlaps([a, b], [])).toEqual([[a, b]]);
});
@Controller("/api/v1/sessions")
class SpecificController {
  @Delete("current") current() {
    return { data: { id: "current" } };
  }
}
@Controller("/api/v1/sessions")
class DynamicController {
  @Delete(":id") byId() {
    return { data: { id: "dynamic" } };
  }
}
@Module({ controllers: [SpecificController, DynamicController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class SpecificFirst {}
@Module({ controllers: [DynamicController, SpecificController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class DynamicFirst {}
it.each([SpecificFirst, DynamicFirst])(
  "구체 경로는 선언 순서와 관계없이 먼저 선택한다: %s",
  async (module) => {
    const { http } = await testApp([module]);
    const res = await http.delete("/api/v1/sessions/current");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text) as unknown).toEqual({ data: { id: "current" } });
    expect(JSON.parse((await http.delete("/api/v1/sessions/abc")).text) as unknown).toEqual({
      data: { id: "dynamic" },
    });
  },
);
@Controller("/api/v1/duplicate")
class DuplicateA {
  @Get() get() {
    return {};
  }
}
@Controller("/api/v1/duplicate")
class DuplicateB {
  @Get() get() {
    return {};
  }
}
@Module({ controllers: [DuplicateA, DuplicateB] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class DuplicateModule {}
it("같은 메서드와 경로를 두 번 등록하면 부팅을 거절한다", async () => {
  await expect(testApp([DuplicateModule])).rejects.toThrow(/duplicate/i);
});
