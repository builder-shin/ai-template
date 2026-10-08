import { expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { resourceFormResult } from "./form-result";
it("단일·다중 관계 pointer를 선언한 입력칸에 붙인다", () => {
  const error = new ApiError({
    status: 422,
    traceId: "",
    errors: [
      { code: "validation.required", params: {}, pointer: "/data/relationships/coverImage/data" },
      { code: "resource.not_found", params: {}, pointer: "/data/relationships/roles/data/0/id" },
    ],
  });
  expect(resourceFormResult(error, "ko", ["coverImage", "roles"])).toMatchObject({
    ok: false,
    formError: null,
    fieldErrors: { coverImage: [expect.any(String)], roles: [expect.any(String)] },
  });
  expect(resourceFormResult(error, "ko", []).formError).toBeTruthy();
});
