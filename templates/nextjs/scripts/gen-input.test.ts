import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { stringify } from "yaml";
import { generateFiles, staleFiles } from "./generate";
import { readWebOpenapi } from "./gen-input";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-gen-input-"));
});
afterEach(() => {
  // 프로젝트가 아닌 이 테스트의 설정·스펙 픽스처만 정리한다.
  if (dirname(root) === tmpdir() && basename(root).startsWith("aitpl-gen-input-"))
    rmSync(root, { recursive: true, force: true });
});
function configure(value: unknown) {
  writeFileSync(join(root, "gen.config.json"), JSON.stringify(value));
}
function fixture(name: string) {
  return {
    openapi: "3.1.0",
    info: { title: name, version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        ErrorCode: { type: "string", enum: [`${name}.failed`] },
        [`${name}Payload`]: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    "x-realtime-events": [{ name: `${name}.changed`, payload: `${name}Payload` }],
  };
}
const contract = stringify(fixture("contract"));
const mock = "// TypeSpec 목 타입\n";

describe("web 생성 입력", () => {
  it("설정이 없으면 TypeSpec 입력으로 web과 목을 만든다", async () => {
    const files = await generateFiles(root, contract, mock);
    expect(files["contract/openapi.yaml"]).toBe(contract);
    expect(files["contract/mock/src/generated/api.ts"]).toBe(mock);
    expect(files["src/lib/api/schema.d.ts"]).toContain("contractPayload:");
    expect(files["src/lib/generated/realtime.ts"]).toContain('"contract.changed"');
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"contract.failed"');
    expect(existsSync(join(root, "gen.config.json"))).toBe(false);
  });

  it.each(["json", "yaml"])("%s 입력은 web에만 쓰고 최신 여부에도 반영한다", async (format) => {
    const name = `backend.${format}`;
    configure({ openapi: name });
    writeFileSync(
      join(root, name),
      format === "json" ? JSON.stringify(fixture("backend")) : stringify(fixture("backend")),
    );
    const files = await generateFiles(root, contract, mock);
    expect(files["contract/openapi.yaml"]).toBe(contract);
    expect(files["contract/mock/src/generated/api.ts"]).toBe(mock);
    expect(files["src/lib/api/schema.d.ts"]).toContain("backendPayload:");
    expect(files["src/lib/api/schema.d.ts"]).not.toContain("contractPayload:");
    expect(files["src/lib/generated/realtime.ts"]).toContain('"backend.changed"');
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"backend.failed"');
    expect(staleFiles(await generateFiles(root, contract, mock), files)).toEqual([]);
    writeFileSync(
      join(root, name),
      format === "json" ? JSON.stringify(fixture("changed")) : stringify(fixture("changed")),
    );
    if (format === "json")
      expect(JSON.parse(readFileSync(join(root, name), "utf8"))).toEqual(fixture("changed"));
    expect(staleFiles(await generateFiles(root, contract, mock), files)).toEqual([
      "src/lib/api/schema.d.ts",
      "src/lib/generated/error-codes.ts",
      "src/lib/generated/realtime.ts",
    ]);
    expect(readFileSync(join(root, "gen.config.json"), "utf8")).toBe(
      JSON.stringify({ openapi: name }),
    );
  });

  it("web 루트 기준의 상위 상대 경로를 읽는다", () => {
    configure({ openapi: `../${basename(root)}/backend.json` });
    writeFileSync(join(root, "backend.json"), "스펙 픽스처");
    expect(readWebOpenapi(root, contract)).toBe("스펙 픽스처");
  });

  it.each(["json", "yaml"])("BOM이 붙은 설정과 %s 스펙을 읽는다", async (format) => {
    writeFileSync(join(root, "gen.config.json"), '\uFEFF{"openapi":"backend.' + format + '"}');
    const spec =
      format === "json" ? JSON.stringify(fixture("backend")) : stringify(fixture("backend"));
    writeFileSync(join(root, `backend.${format}`), "\uFEFF" + spec);
    expect(readWebOpenapi(root, contract)).toBe(spec);
    expect((await generateFiles(root, contract, mock))["src/lib/api/schema.d.ts"]).toContain(
      "backendPayload:",
    );
  });

  it("스펙 대신 폴더를 가리키면 파일을 지정하도록 안내한다", () => {
    configure({ openapi: "backend" });
    mkdirSync(join(root, "backend"));
    expect(() => readWebOpenapi(root, contract)).toThrow(/backend.*파일이 아니다 —.*파일/);
  });

  it.each(["x-realtime-events", "components.schemas.ErrorCode"])(
    "%s가 없으면 백엔드에서 선언하도록 안내한다",
    async (missing) => {
      const spec = fixture("backend");
      if (missing === "x-realtime-events") Reflect.deleteProperty(spec, missing);
      else Reflect.deleteProperty(spec.components.schemas, "ErrorCode");
      configure({ openapi: "backend.json" });
      writeFileSync(join(root, "backend.json"), JSON.stringify(spec));
      await expect(generateFiles(root, contract, mock)).rejects.toThrow(
        new RegExp(`${missing.replaceAll(".", "\\.")}.*—.*백엔드.*선언`),
      );
    },
  );

  it.each(
    [
      null,
      [],
      "backend.json",
      {},
      { openapi: "backend.json", unknown: true },
      { openapi: null },
      { openapi: 42 },
      { openapi: [] },
      { openapi: "" },
      { openapi: "   " },
      { openapi: join(tmpdir(), "backend.json") },
      { openapi: "C:\\backend.json" },
      { openapi: "/backend.json" },
    ].map((value) => [value]),
  )("잘못된 설정 %j를 고칠 방법과 함께 거절한다", (value) => {
    configure(value);
    expect(() => readWebOpenapi(root, contract)).toThrow(/gen\.config\.json.*—.*openapi/);
  });

  it("깨진 설정 JSON을 짧은 안내로 거절한다", () => {
    writeFileSync(join(root, "gen.config.json"), "{");
    expect(() => readWebOpenapi(root, contract)).toThrow(/gen\.config\.json.*—.*JSON/);
  });

  it("없는 스펙은 백엔드 gen을 먼저 실행하도록 안내한다", () => {
    configure({ openapi: "missing.json" });
    expect(() => readWebOpenapi(root, contract)).toThrow(/missing\.json.*—.*백엔드.*gen.*먼저/);
  });
});
