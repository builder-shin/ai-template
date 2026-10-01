import { describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import { errorCodes } from "../../src/lib/generated/error-codes";
import { checkI18n } from "./i18n";
import { runChecks } from "./runner";

const catalog = () => ({
  home: { title: "Home" },
  errors: { auth: { unauthenticated: "Sign in" } },
});

async function step(catalogs: Parameters<typeof checkI18n>[0], codes = ["auth.unauthenticated"]) {
  return runChecks([{ name: "i18n", args: [], key: "fixture" }], {}, async () => {
    const problems = checkI18n(catalogs, codes);
    return { ok: problems.length === 0, output: problems.join("\n") };
  });
}

describe("i18n 검사 단계", () => {
  it("정상 카탈로그와 모든 생성 에러 코드를 통과시킨다", async () => {
    expect(checkI18n({ ko, en }, errorCodes)).toEqual([]);
    expect((await step({ ko: catalog(), en: catalog() })).ok).toBe(true);
  });

  it.each(["ko", "en"] as const)("%s의 일반 키 누락은 실패하고 캐시하지 않는다", async (locale) => {
    const catalogs = { ko: catalog(), en: catalog() };
    Reflect.deleteProperty(catalogs[locale].home, "title");
    const result = await step(catalogs);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(`✗ i18n\n${locale}: home.title`);
    expect(result.cache).not.toHaveProperty("i18n");
  });

  it.each(["ko", "en"] as const)("%s의 에러 코드 누락은 실패한다", async (locale) => {
    const catalogs = { ko: catalog(), en: catalog() };
    Reflect.deleteProperty(catalogs[locale].errors.auth, "unauthenticated");
    const result = await step(catalogs);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(`${locale}: errors.auth.unauthenticated`);
  });

  it("두 로케일에서 함께 빠진 에러 코드도 실패한다", async () => {
    const result = await step({ ko: catalog(), en: catalog() }, ["resource.not_found"]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("ko: errors.resource.not_found");
    expect(result.output).toContain("en: errors.resource.not_found");
  });

  it("빈 번역도 실패한다", async () => {
    const en = catalog();
    en.home.title = "  ";
    expect((await step({ ko: catalog(), en })).ok).toBe(false);
  });

  it("한국어가 보존되고 로딩 문구는 카탈로그에 없다", () => {
    expect(ko.home.title).toBe("Web 템플릿");
    expect(JSON.stringify({ ko, en })).not.toMatch(/loading|로딩|불러오는 중/i);
  });
});
