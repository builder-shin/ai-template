import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { OPERATIONS, EVENTS, MESSAGES } from "../../src/modules/registry.js";
import { emitOperation, emitSchemas } from "../../src/core/jsonapi/openapi/emit.js";
import { comparable } from "../../src/core/jsonapi/openapi/normalize.js";
import { differences } from "../../scripts/schema-diff.js";
import { PermissionRegistry } from "../../src/modules/roles/index.js";
const repo = resolve(import.meta.dirname, "../../../..");
const yaml = createRequire(resolve(repo, "package.json"))("yaml") as {
  parse: (text: string) => {
    paths: Record<string, Record<string, Record<string, unknown>>>;
    components: { schemas: Record<string, unknown> };
  };
};
const contract = yaml.parse(readFileSync(resolve(repo, "contract/openapi.yaml"), "utf8"));
it("matches every declaration in the nineteen-operation slice", () => {
  for (const decl of OPERATIONS) {
    const expected = contract.paths[decl.path]?.[decl.method.toLowerCase()];
    expect(expected).toBeDefined();
    const diff = differences(
      comparable(expected),
      comparable(emitOperation(decl)),
      `${decl.interface}_${decl.name}`,
    );
    expect(diff).toEqual([]);
  }
});
it("registers all components reachable from slice operations and realtime payloads", () => {
  const names = new Set<string>();
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node as unknown[]) visit(v);
      return;
    }
    const r = node as Record<string, unknown>;
    if (typeof r.$ref === "string") {
      const name = r.$ref.split("/").at(-1);
      if (name && !names.has(name)) {
        names.add(name);
        visit(contract.components.schemas[name]);
      }
    }
    for (const v of Object.values(r)) visit(v);
  }
  for (const op of OPERATIONS) visit(contract.paths[op.path]?.[op.method.toLowerCase()]);
  for (const event of EVENTS) visit({ $ref: `#/components/schemas/${event.payload}` });
  for (const message of MESSAGES) {
    visit({ $ref: `#/components/schemas/${message.payload}` });
    visit({ $ref: `#/components/schemas/${message.ack}` });
  }
  expect(Object.keys(emitSchemas()).sort()).toEqual([...names].sort());
});
it("retains the original real contract-to-permission-registry assertion", () => {
  const codes = (contract.components.schemas.PermissionCode as { enum: string[] }).enum;
  expect(
    new PermissionRegistry()
      .list()
      .map((p) => p.code)
      .sort(),
  ).toEqual([...codes].sort());
});
