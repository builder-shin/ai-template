import { expect, it } from "vitest";
import { loadMailTemplates } from "../../../core/mail/templates.js";
import { renderMail } from "../../../core/mail/render.js";
import { fileURLToPath } from "node:url";
const moduleDir = fileURLToPath(new URL("..", import.meta.url));
it.each(["ko", "en"] as const)(
  "%s 인증과 환영 메일의 세 형식을 실제 자산으로 렌더링한다",
  (locale) => {
    for (const mail of ["verify_email", "welcome"]) {
      const rendered = renderMail(loadMailTemplates(moduleDir, mail, locale), {
        greeting: "<이름>",
        link: "https://web.example.test/verify-email?token=fixture",
      });
      expect(rendered.subject.trim().length).toBeGreaterThan(0);
      expect(rendered.text).toContain("<이름>");
      expect(rendered.html).toContain("&lt;이름&gt;");
      if (mail === "verify_email")
        expect(rendered.text).toContain("https://web.example.test/verify-email?token=fixture");
    }
  },
);
