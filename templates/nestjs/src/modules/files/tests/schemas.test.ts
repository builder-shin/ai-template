import { expect, it } from "vitest";
import { fileCreateDocumentSchema, fileUpdateDocumentSchema } from "../index.js";
const id = "01900000-0000-7000-8000-000000000001";
it("파일 생성은 파일 이름과 MIME 타입과 양의 정수 바이트를 받는다", () => {
  const document = {
    data: {
      type: "files",
      attributes: { filename: "그림.png", contentType: "image/png", size: 23 },
    },
  };
  expect(fileCreateDocumentSchema.parse(document)).toEqual(document);
});
it.each([0, -1, 1.5])("파일 크기 %s는 생성 속성에서 거절한다", (size) => {
  expect(
    fileCreateDocumentSchema.safeParse({
      data: { type: "files", attributes: { filename: "a", contentType: "image/png", size } },
    }).success,
  ).toBe(false);
});
it("파일 이름은 유니코드 문자 255개를 허용하고 256개를 거절한다", () => {
  const attributes = { filename: "𐐀".repeat(255), contentType: "image/png", size: 23 };
  expect(fileCreateDocumentSchema.safeParse({ data: { type: "files", attributes } }).success).toBe(
    true,
  );
  expect(
    fileCreateDocumentSchema.safeParse({
      data: { type: "files", attributes: { ...attributes, filename: "𐐀".repeat(256) } },
    }).success,
  ).toBe(false);
});
it("완료 문서는 ready와 속성이 없는 문서를 모두 받는다", () => {
  for (const data of [
    { type: "files", id },
    { type: "files", id, attributes: { status: "ready" } },
  ])
    expect(fileUpdateDocumentSchema.parse({ data })).toEqual({ data });
});
