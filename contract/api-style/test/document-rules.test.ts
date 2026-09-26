import { describe, expect, it } from "vitest";
import { at, ruleIds, validFixture } from "./lint.ts";

const WIDGETS = "/api/v1/widgets";
const WIDGET = "/api/v1/widgets/{id}";

describe("유효한 픽스처", () => {
  it("어떤 규칙도 위반하지 않는다", async () => {
    expect(await ruleIds(validFixture())).toEqual([]);
  });
});

describe("jsonapi/media-type", () => {
  it("JSON:API 경로에서 다른 미디어 타입을 쓰면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "get", "responses", "200", "content");
    content["application/json"] = content["application/vnd.api+json"];
    delete content["application/vnd.api+json"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/media-type"]);
  });

  it("헬스체크처럼 API 밖의 경로는 검사하지 않는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", "/health/live", "get", "responses", "200", "content");
    expect(Object.keys(content)).toEqual(["application/json"]);
    expect(await ruleIds(doc)).toEqual([]);
  });
});

describe("jsonapi/error-response", () => {
  it("4xx 응답이 ErrorDocument를 참조하지 않으면 잡는다", async () => {
    const doc = validFixture();
    const media = at(doc, "paths", WIDGETS, "get", "responses", "400", "content");
    at(media, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/WidgetDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/error-response"]);
  });

  it("4xx 응답이 하나도 없으면 잡는다", async () => {
    const doc = validFixture();
    const responses = at(doc, "paths", WIDGET, "delete", "responses");
    delete responses["404"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/error-response"]);
  });
});

describe("jsonapi/request-document", () => {
  it("POST 본문이 CreateDocument가 아니면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "post", "requestBody", "content");
    at(content, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/WidgetUpdateDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/request-document"]);
  });
});

describe("jsonapi/type-matches-path", () => {
  it("응답 리소스의 type이 경로와 다르면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "post", "responses", "201", "content");
    at(content, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/UserDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/type-matches-path"]);
  });

  it("별칭으로 등록한 경로(me → users)는 통과한다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", "/api/v1/me", "get", "responses", "200", "content");
    expect(at(content, "application/vnd.api+json").schema).toEqual({
      $ref: "#/components/schemas/UserDocument",
    });
    expect(await ruleIds(doc)).toEqual([]);
  });
});
