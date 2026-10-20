import { expect, it } from "vitest";
import { resources } from "../src/resources";
import { ko, en } from "../src/lib/i18n/catalogs";
import { missingResourceMessages } from "../src/lib/resources/messages";

it("제품의 모든 표시 열거값에는 ko/en 문구가 있다", () => {
  expect(missingResourceMessages(resources, { ko, en })).toEqual([]);
});
