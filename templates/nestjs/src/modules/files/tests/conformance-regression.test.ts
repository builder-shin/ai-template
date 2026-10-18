import { afterEach, expect, it } from "vitest";
import { fixture, attributes, principal } from "./fixtures.js";
const fixtures: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});

it.each([
  {
    name: "타입",
    input: { ...attributes, contentType: "application/pdf" },
    code: "file.type_not_allowed",
    pointer: "contentType",
    params: { allowed: "image/png" },
  },
  {
    name: "크기",
    input: { ...attributes, size: 10 ** 12 },
    code: "file.too_large",
    pointer: "size",
    params: { max: 100 },
  },
  {
    name: "할당량",
    input: attributes,
    code: "file.quota_exceeded",
    pointer: "size",
    params: { quota: 100 },
  },
])(
  "파일 $name 오류는 위치와 한도 매개변수를 담고 저장하지 않는다",
  async ({ name, input, code, pointer, params }) => {
    const f = fixture();
    fixtures.push(f);
    if (name === "할당량") f.add({ size: 90n });
    const before = structuredClone(f.files);
    await expect(f.service.create(principal, input)).rejects.toMatchObject({
      init: {
        status: 422,
        code,
        source: { pointer: "/data/attributes/" + pointer },
        meta: { params },
      },
    });
    expect(f.files).toEqual(before);
    expect(f.events).not.toContain("insert");
  },
);
