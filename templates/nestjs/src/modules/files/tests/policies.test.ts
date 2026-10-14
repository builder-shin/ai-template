import { expect, it } from "vitest";
import type { Tx } from "../../../core/db/unit-of-work.js";
import { registerFileReadRule, readableFileIds } from "../index.js";
import { file, principal } from "./fixtures.js";
it("소유자는 등록 규칙 없이 자기 파일만 읽는다", async () => {
  expect(
    await readableFileIds({} as Tx, principal, [file, { ...file, id: "other", ownerId: "u2" }]),
  ).toEqual(new Set(["f1"]));
});
it("등록 규칙이 허용한 요청 id만 익명으로 읽는다", async () => {
  registerFileReadRule((_tx, viewer, ids) => {
    expect(viewer).toBeUndefined();
    expect(ids).toEqual(["public", "hidden"]);
    return Promise.resolve(new Set(["public", "outside"]));
  });
  expect(
    await readableFileIds({} as Tx, undefined, [
      { ...file, id: "public" },
      { ...file, id: "hidden" },
    ]),
  ).toEqual(new Set(["public"]));
});
