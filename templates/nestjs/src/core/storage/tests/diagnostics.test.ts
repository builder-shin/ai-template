import { expect, it } from "vitest";
import { storageFailure } from "../diagnostics.js";

it.each(["EHOSTUNREACH", "ENETUNREACH", "ECONNABORTED"])(
  "도달 불가와 중단 오류는 연결 실패로 분류한다: %s",
  (code) => {
    expect(storageFailure(Object.assign(new Error("private-host"), { code }))).toEqual({
      category: "connection",
    });
  },
);
