import { expect, it } from "vitest";
import { compareComponents } from "../../src/spec-compare/schemas.ts";
const doc = (schemas: Record<string, unknown>) => ({ components: { schemas } });
it("필수 속성이 빠지면 컴포넌트 이름과 JSON pointer로 차이를 낸다", () => {
  expect(
    compareComponents(
      doc({ PostAttributes: { type: "object", required: ["title", "body"] } }),
      doc({ PostAttributes: { type: "object", required: ["title"] } }),
      { subset: false },
    ),
  ).toEqual(['PostAttributes/required: 계약=["title","body"], 구현=["title"]']);
});
it("subset은 구현에 없는 이름을 건너뛰지만 공유 이름의 차이는 검사한다", () => {
  expect(
    compareComponents(
      doc({ Missing: { type: "string" }, Shared: { minLength: 1 } }),
      doc({ Shared: { minLength: 2 } }),
      { subset: true },
    ),
  ).toEqual(["Shared/minLength: 계약=1, 구현=2"]);
});
it("전체 비교는 없는 컴포넌트를 보고하고 구현의 추가 이름은 허용한다", () => {
  expect(
    compareComponents(doc({ Missing: { type: "string" } }), doc({ Extra: { type: "number" } }), {
      subset: false,
    }),
  ).toEqual(['Missing: 계약={"type":"string"}, 구현=undefined']);
});
it("설명과 키 순서 및 required와 enum 순서는 구조 차이가 아니다", () => {
  expect(
    compareComponents(
      doc({
        A: {
          description: "설명",
          type: "object",
          required: ["title", "body"],
          properties: { state: { type: "string", enum: ["a", "b"] } },
        },
      }),
      doc({
        A: {
          properties: { state: { enum: ["b", "a"], type: "string" } },
          required: ["body", "title"],
          type: "object",
          description: "다른 설명",
        },
      }),
      { subset: false },
    ),
  ).toEqual([]);
});
it("nullable type 배열과 anyOf 및 const와 단일 enum은 같은 구조다", () => {
  expect(
    compareComponents(
      doc({
        A: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
        B: { type: "string", enum: ["posts"] },
      }),
      doc({
        A: { type: ["string", "null"], format: "date-time" },
        B: { type: "string", const: "posts" },
      }),
      { subset: false },
    ),
  ).toEqual([]);
});
it("단순 객체의 additionalProperties와 unevaluatedProperties를 같은 제약으로 비교한다", () => {
  expect(
    compareComponents(
      doc({ A: { type: "object", unevaluatedProperties: { type: "string" } } }),
      doc({
        A: {
          type: "object",
          additionalProperties: { type: "string" },
          propertyNames: { type: "string" },
        },
      }),
      { subset: false },
    ),
  ).toEqual([]);
});
it.each([
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "$ref",
  "additionalProperties",
])("계약 제약은 지우지 않는다: %s", (key) => {
  expect(
    compareComponents(doc({ A: { [key]: "expected" } }), doc({ A: { [key]: "actual" } }), {
      subset: false,
    }),
  ).toEqual([`A/${key}: 계약="expected", 구현="actual"`]);
});
it("속성 이름의 JSON pointer는 슬래시와 물결표를 이스케이프한다", () => {
  expect(
    compareComponents(
      doc({ A: { properties: { "a/b~c": { minLength: 1 } } } }),
      doc({ A: { properties: { "a/b~c": { minLength: 2 } } } }),
      { subset: false },
    ),
  ).toEqual(["A/properties/a~1b~0c/minLength: 계약=1, 구현=2"]);
});
it("조합 스키마의 unevaluatedProperties는 additionalProperties와 합치지 않는다", () => {
  expect(
    compareComponents(
      doc({ A: { allOf: [{ type: "object" }], unevaluatedProperties: false } }),
      doc({ A: { allOf: [{ type: "object" }], additionalProperties: false } }),
      { subset: false },
    ),
  ).toHaveLength(2);
});
it("다른 제약이 달라도 순서만 바뀐 required는 추가 차이로 보고하지 않는다", () => {
  expect(
    compareComponents(
      doc({ A: { required: ["a", "b"], minLength: 1 } }),
      doc({ A: { required: ["b", "a"], minLength: 2 } }),
      { subset: false },
    ),
  ).toEqual(["A/minLength: 계약=1, 구현=2"]);
});
it("nullable의 바깥 format도 type 배열의 format과 동등하게 비교한다", () => {
  expect(
    compareComponents(
      doc({ A: { anyOf: [{ type: "string" }, { type: "null" }], format: "uri-reference" } }),
      doc({ A: { type: ["string", "null"], format: "uri-reference" } }),
      { subset: false },
    ),
  ).toEqual([]);
});
it("description과 title라는 속성 이름 및 enum 객체 값은 검사 대상이다", () => {
  expect(
    compareComponents(
      doc({
        A: {
          properties: { description: { minLength: 1 }, title: { minLength: 1 } },
          enum: [{ description: "a" }],
        },
      }),
      doc({
        A: {
          properties: { description: { minLength: 2 }, title: { minLength: 2 } },
          enum: [{ description: "b" }],
        },
      }),
      { subset: false },
    ),
  ).toHaveLength(3);
});
it("enum 안의 객체 값은 스키마가 아니므로 내부 배열 순서를 보존한다", () => {
  expect(
    compareComponents(
      doc({ A: { enum: [{ required: ["a", "b"] }] } }),
      doc({ A: { enum: [{ required: ["b", "a"] }] } }),
      { subset: false },
    ),
  ).toEqual(['A/enum: 계약=[{"required":["a","b"]}], 구현=[{"required":["b","a"]}]']);
});
it("const와 enum이 함께 선언되면 enum 제약을 덮어쓰지 않는다", () => {
  expect(
    compareComponents(
      doc({ A: { type: "string", const: "a", enum: ["b"] } }),
      doc({ A: { type: "string", const: "a", enum: ["a"] } }),
      { subset: false },
    ),
  ).toEqual(['A/enum: 계약=["b"], 구현=["a"]']);
});
