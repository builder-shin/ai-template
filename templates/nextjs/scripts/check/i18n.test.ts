import { describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import sharedKo from "../../messages/shared/ko.json";
import sharedEn from "../../messages/shared/en.json";
import { errorCodes } from "../../src/lib/generated/error-codes";
import { checkI18n } from "./i18n";
import { runChecks } from "./runner";

const catalog = () => ({
  home: { title: "Home" },
});
const sharedCatalog = () => ({
  errors: { auth: { unauthenticated: "Sign in" } },
});

async function step(
  catalogs: Parameters<typeof checkI18n>[0],
  codes = ["auth.unauthenticated"],
  shared: Parameters<typeof checkI18n>[2] = { ko: sharedCatalog(), en: sharedCatalog() },
) {
  return runChecks([{ name: "i18n", args: [], key: "fixture" }], {}, async () => {
    const problems = checkI18n(catalogs, codes, shared);
    return { ok: problems.length === 0, output: problems.join("\n") };
  });
}

describe("i18n 검사 단계", () => {
  it.each(["ko", "en"] as const)("%s의 공유 키 누락을 앱 번역으로 가릴 수 없다", (locale) => {
    const shared = { ko: { common: { title: "제목" } }, en: { common: { title: "Title" } } };
    Reflect.deleteProperty(shared[locale].common, "title");
    const app = { ko: {}, en: {}, [locale]: { common: { title: "App title" } } };
    expect(checkI18n(app, [], shared)).toContain(
      `messages/shared/${locale}.json: common.title — 빠진 번역을 추가한다.`,
    );
  });

  it.each(["ko", "en"] as const)("%s의 앱 키 누락을 공유 번역으로 가릴 수 없다", (locale) => {
    const app = { ko: { home: { title: "홈" } }, en: { home: { title: "Home" } } };
    Reflect.deleteProperty(app[locale].home, "title");
    const shared = { ko: {}, en: {}, [locale]: { home: { title: "Shared title" } } };
    expect(checkI18n(app, [], shared)).toContain(
      `messages/${locale}.json: home.title — 빠진 번역을 추가한다.`,
    );
  });

  it.each(["ko", "en"] as const)("%s의 공유·앱 중복 키는 같은 문구여도 실패한다", (locale) => {
    const app = { ko: {}, en: {}, [locale]: { common: { title: "Title" } } };
    const shared = { ko: {}, en: {}, [locale]: { common: { title: "Title" } } };
    expect(checkI18n(app, [], shared).join("\n")).toContain(
      `messages/${locale}.json: common.title이 messages/shared/${locale}.json과 겹친다 — 중복 키를 한 카탈로그에만 둔다.`,
    );
  });

  it("서로 다른 하위 키는 같은 namespace에 함께 둘 수 있다", () => {
    const app = { ko: { common: { app: "앱" } }, en: { common: { app: "App" } } };
    const shared = { ko: { common: { shared: "공통" } }, en: { common: { shared: "Shared" } } };
    expect(checkI18n(app, [], shared)).toEqual([]);
  });

  it("문자열과 namespace가 겹쳐도 실패한다", () => {
    const app = { ko: { common: "앱" }, en: { common: "App" } };
    const shared = { ko: { common: { title: "공통" } }, en: { common: { title: "Shared" } } };
    expect(checkI18n(app, [], shared).join("\n")).toContain(
      "common이 messages/shared/ko.json과 겹친다",
    );
  });

  it("에러 코드 번역은 앱에 있어도 공유 카탈로그에서 빠지면 실패한다", () => {
    const problems = checkI18n(
      { ko: sharedCatalog(), en: sharedCatalog() },
      ["auth.unauthenticated"],
      { ko: {}, en: {} },
    );
    expect(problems).toContain(
      "messages/shared/ko.json: errors.auth.unauthenticated — 빠진 번역을 추가한다.",
    );
    expect(problems).toContain(
      "messages/shared/en.json: errors.auth.unauthenticated — 빠진 번역을 추가한다.",
    );
  });

  it("정상 카탈로그와 모든 생성 에러 코드를 통과시킨다", async () => {
    expect(checkI18n({ ko, en }, errorCodes, { ko: sharedKo, en: sharedEn })).toEqual([]);
    expect((await step({ ko: catalog(), en: catalog() })).ok).toBe(true);
  });

  it.each(["ko", "en"] as const)("%s의 일반 키 누락은 실패하고 캐시하지 않는다", async (locale) => {
    const catalogs = { ko: catalog(), en: catalog() };
    Reflect.deleteProperty(catalogs[locale].home, "title");
    const result = await step(catalogs);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(`✗ i18n\nmessages/${locale}.json: home.title`);
    expect(result.cache).not.toHaveProperty("i18n");
  });

  it.each(["ko", "en"] as const)("%s의 에러 코드 누락은 실패한다", async (locale) => {
    const catalogs = { ko: sharedCatalog(), en: sharedCatalog() };
    Reflect.deleteProperty(catalogs[locale].errors.auth, "unauthenticated");
    const result = await step({ ko: catalog(), en: catalog() }, undefined, catalogs);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(`messages/shared/${locale}.json: errors.auth.unauthenticated`);
  });

  it("두 로케일에서 함께 빠진 에러 코드도 실패한다", async () => {
    const result = await step({ ko: catalog(), en: catalog() }, ["resource.not_found"]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("messages/shared/ko.json: errors.resource.not_found");
    expect(result.output).toContain("messages/shared/en.json: errors.resource.not_found");
  });

  it("빈 번역도 실패한다", async () => {
    const en = catalog();
    en.home.title = "  ";
    expect((await step({ ko: catalog(), en })).ok).toBe(false);
  });

  it("공유 카탈로그의 빈 번역도 실패하고 캐시하지 않는다", async () => {
    const shared = { ko: sharedCatalog(), en: sharedCatalog() };
    shared.en.errors.auth.unauthenticated = "  ";
    const result = await step({ ko: catalog(), en: catalog() }, undefined, shared);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(
      "messages/shared/en.json: errors.auth.unauthenticated — 빈 번역을 채운다.",
    );
    expect(result.cache).not.toHaveProperty("i18n");
  });

  it("중복 키가 있는 단계는 실패하고 캐시하지 않는다", async () => {
    const result = await step({ ko: sharedCatalog(), en: sharedCatalog() }, undefined, {
      ko: sharedCatalog(),
      en: sharedCatalog(),
    });
    expect(result.ok).toBe(false);
    expect(result.output).toContain(
      "errors.auth.unauthenticated이 messages/shared/ko.json과 겹친다",
    );
    expect(result.cache).not.toHaveProperty("i18n");
  });

  it("한국어가 보존되고 로딩 문구는 카탈로그에 없다", () => {
    expect(ko.home.title).toBe("Web 템플릿");
    expect(JSON.stringify({ ko, en, sharedKo, sharedEn })).not.toMatch(/loading|로딩|불러오는 중/i);
  });
});
