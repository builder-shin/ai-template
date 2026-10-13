import { expect, it } from "vitest";
import { renderMail } from "../render.js";
it("HTML에서만 값을 이스케이프한다", () => {
  expect(
    renderMail(
      { subject: "{{name}}", text: "{{name}}", html: "<p>{{name}}</p>" },
      { name: "<b>Ada</b>" },
    ),
  ).toEqual({
    subject: "<b>Ada</b>",
    text: "<b>Ada</b>",
    html: "<p>&lt;b&gt;Ada&lt;/b&gt;</p>",
  });
});
it("따옴표와 앰퍼샌드를 HTML에서 이스케이프하고 치환 값을 다시 처리하지 않는다", () => {
  expect(
    renderMail(
      { subject: "{{이름}}", text: "{{이름}}/{{이름}}", html: "{{이름}}" },
      { 이름: "&\"'<>{{다른값}}" },
    ),
  ).toEqual({
    subject: "&\"'<>{{다른값}}",
    text: "&\"'<>{{다른값}}/&\"'<>{{다른값}}",
    html: "&amp;&quot;&#39;&lt;&gt;{{다른값}}",
  });
});
it.each(["subject", "text", "html"] as const)("%s의 누락 값을 거절한다", (field) => {
  const templates = { subject: "", text: "", html: "", [field]: "{{x}}" };
  expect(() => renderMail(templates, {})).toThrow("메일 값이 없다: x");
});
it("빈 값은 허용하고 상속된 값은 쓰지 않는다", () => {
  expect(renderMail({ subject: "{{x}}", text: "", html: "" }, { x: "" }).subject).toBe("");
  expect(() => renderMail({ subject: "{{toString}}", text: "", html: "" }, {})).toThrow(
    "메일 값이 없다: toString",
  );
});
