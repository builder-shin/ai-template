import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { schema } from "./spec.ts";

const docPath = fileURLToPath(new URL("../../../docs/conventions/error-codes.md", import.meta.url));

/** 표의 첫 칸에 백틱으로 적힌 코드를 순서대로 모은다. */
function documentedCodes(): string[] {
  return readFileSync(docPath, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\|\s*`([^`]+)`\s*\|/.exec(line)?.[1])
    .filter((code): code is string => code !== undefined);
}

describe("docs/conventions/error-codes.md", () => {
  it("계약의 ErrorCode와 같은 코드를 같은 순서로 적는다", () => {
    expect(documentedCodes()).toEqual(schema("ErrorCode").enum);
  });
});
