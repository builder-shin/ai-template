import { describe, expect, it } from "vitest";
import { resourceName } from "../rules/util.js";
import { at, removeParameter, ruleIds, validFixture } from "./lint.ts";

const WIDGETS = "/api/v1/widgets";

describe("jsonapi/collection-parameters", () => {
  it("컬렉션 GET에 page[size]가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "page[size]");
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });

  it("컬렉션 GET에 fields[...]가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "fields[widgets]");
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });

  it("x-jsonapi-sort가 없으면 잡는다", async () => {
    const doc = validFixture();
    delete at(doc, "paths", WIDGETS, "get")["x-jsonapi-sort"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });

  it("주 리소스가 아닌 fields[...]만 있으면 잡는다", async () => {
    const doc = validFixture();
    const operation = at(doc, "paths", WIDGETS, "get");
    removeParameter(operation, "fields[widgets]");
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    parameters.push({ name: "fields[users]", in: "query", schema: { type: "string" } });
    operation.parameters = parameters;
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });
});

describe("jsonapi/include-extension", () => {
  it("include 파라미터가 있는데 x-jsonapi-include가 없으면 잡는다", async () => {
    const doc = validFixture();
    delete at(doc, "paths", WIDGETS, "get")["x-jsonapi-include"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/include-extension"]);
  });

  it("x-jsonapi-include만 있고 include 파라미터가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "include");
    expect(await ruleIds(doc)).toEqual(["jsonapi/include-extension"]);
  });
});

describe("jsonapi/schema-naming", () => {
  it("리소스 이름으로 시작하지 않는 스키마를 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas").Gadget = { type: "object" };
    expect(await ruleIds(doc)).toEqual(["jsonapi/schema-naming"]);
  });

  it("점이 들어간 스키마 이름을 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas")["JsonApi.Widget"] = { type: "object" };
    expect(await ruleIds(doc)).toEqual(["jsonapi/schema-naming"]);
  });

  it("리소스 이름으로 시작하는 보조 스키마는 통과한다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas").WidgetStatus = { type: "string", enum: ["on", "off"] };
    expect(await ruleIds(doc)).toEqual([]);
  });

  it("type을 단수 PascalCase 리소스 이름으로 바꾼다", () => {
    expect(resourceName("posts")).toBe("Post");
    expect(resourceName("audit-logs")).toBe("AuditLog");
    expect(resourceName("email-verification-requests")).toBe("EmailVerificationRequest");
    expect(resourceName("categories")).toBe("Category");
    expect(resourceName("addresses")).toBe("Address");
  });

  it("type을 const로 적어도 리소스 type을 읽는다(Pydantic의 Literal 출력)", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas", "WidgetResource", "properties").type = {
      type: "string",
      const: "gadgets",
    };
    // 컬렉션 문서도 WidgetResource를 참조하므로 collection-parameters도 fields[gadgets]를 요구한다.
    expect(await ruleIds(doc)).toEqual([
      "jsonapi/collection-parameters",
      "jsonapi/schema-naming",
      "jsonapi/type-matches-path",
    ]);
  });

  it("생성 문서의 data가 $ref여도 type을 읽는다", async () => {
    const doc = validFixture();
    const schemas = at(doc, "components", "schemas");
    const properties = at(doc, "components", "schemas", "WidgetCreateDocument", "properties");
    schemas.WidgetCreateData = {
      type: "object",
      required: ["type", "attributes"],
      properties: {
        type: { type: "string", enum: ["gadgets"] },
        attributes: { $ref: "#/components/schemas/WidgetAttributes" },
      },
    };
    properties.data = { $ref: "#/components/schemas/WidgetCreateData" };
    expect(await ruleIds(doc)).toEqual(["jsonapi/schema-naming", "jsonapi/type-matches-path"]);
  });
});

describe("jsonapi/camel-case-properties", () => {
  it("snake_case 속성 이름을 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas", "WidgetAttributes", "properties").created_at = {
      type: "string",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/camel-case-properties"]);
  });
});
