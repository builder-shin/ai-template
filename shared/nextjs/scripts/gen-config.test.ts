import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGenConfig, resolveContractPaths } from "./gen-config.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-gen-config-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function contract() {
  mkdirSync(join(root, "contract/mock"), { recursive: true });
  mkdirSync(join(root, "contract/typespec"), { recursive: true });
}
describe("계약 경로", () => {
  it("설정이 없으면 앱 안의 계약을 쓴다", () => {
    contract();
    expect(readGenConfig(root)).toEqual({});
    expect(resolveContractPaths(root)).toEqual({
      root: join(root, "contract"),
      mock: join(root, "contract/mock"),
      typespec: join(root, "contract/typespec"),
      openapi: join(root, "contract/openapi.yaml"),
    });
  });
  it("../../contract를 앱 루트에서 해석한다", () => {
    contract();
    const app = join(root, "apps/web");
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, "gen.config.json"),
      JSON.stringify({ contract: "../../contract", openapi: "backend.yaml" }),
    );
    expect(resolveContractPaths(app).root).toBe(join(root, "contract"));
    expect(readGenConfig(app).openapi).toBe("backend.yaml");
  });
  it("없는 계약 폴더는 위치를 고치도록 안내한다", () => {
    writeFileSync(join(root, "gen.config.json"), JSON.stringify({ contract: "missing" }));
    expect(() => resolveContractPaths(root)).toThrow(
      /missing.*폴더.*—.*gen\.config\.json.*contract/,
    );
  });
  it("목·TypeSpec 폴더가 없는 계약도 거절한다", () => {
    mkdirSync(join(root, "contract"));
    expect(() => resolveContractPaths(root)).toThrow(/mock.*폴더.*—/);
  });
  it.each([null, 1, [], "", " ", "/contract", "C:\\contract"])(
    "잘못된 계약 값 %j를 거절한다",
    (value) => {
      writeFileSync(join(root, "gen.config.json"), JSON.stringify({ contract: value }));
      expect(() => readGenConfig(root)).toThrow(/gen\.config\.json.*—.*contract.*상대 경로/);
    },
  );
});
