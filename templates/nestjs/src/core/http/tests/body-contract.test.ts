import { Readable } from "node:stream";
import type { Request } from "express";
import { expect, it } from "vitest";
import { readBody } from "../body.js";
import { ApiError } from "../../jsonapi/errors.js";
import { validateRequest } from "../../jsonapi/validation.js";
import { defineOperation } from "../../jsonapi/operation.js";
import { z } from "zod";
import { errorsOf } from "../../jsonapi/tests/helpers.js";

const operation = defineOperation({
  method: "POST",
  path: "/api/v1/examples",
  operationId: "bodyContractExample",
  tags: ["examples"],
  summary: "본문 구조를 검사한다",
  auth: "none",
  body: z.object({ data: z.object({ type: z.literal("examples") }) }),
  responses: { 201: { description: "생성" } },
  errors: [],
});
function request(body: string): Request {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    headers: {
      "content-type": "application/vnd.api+json",
      "content-length": String(Buffer.byteLength(body)),
    },
  }) as unknown as Request;
}
it("깨진 JSON에는 존재하지 않는 문서 위치를 붙이지 않는다", async () => {
  const failure: unknown = await readBody(request("{")).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ApiError);
  expect((failure as ApiError).init).toMatchObject({
    status: 400,
    code: "jsonapi.invalid_document",
  });
  expect((failure as ApiError).init).not.toHaveProperty("source");
});
it("JSON 객체의 누락된 data는 실제 구조 위치를 가리킨다", async () => {
  const req = request("{}");
  await readBody(req);
  const failure = errorsOf(() =>
    validateRequest(operation, { search: "", params: {}, body: req.body as unknown }),
  );
  expect(failure.status).toBe(400);
  expect(failure.errors.map((error) => error.init)).toMatchObject([
    { code: "jsonapi.invalid_document", source: { pointer: "/data" } },
  ]);
});
