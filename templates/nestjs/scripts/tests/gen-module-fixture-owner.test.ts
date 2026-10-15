import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { genModule } from "../gen-module.js";
import { generatorFixture, generatorFixtureOwner } from "./fixtures/generated-module.js";

it.each(["설정", "본문"])(
  "중첩 %s 오류 뒤에도 각 범위의 사본을 한 번씩 정리한다",
  async (phase) => {
    const copies: { root: string; closes: number }[] = [];
    const create = (sourceRoot?: string) => {
      const fixture = generatorFixture(sourceRoot);
      const record = { root: fixture.root, closes: 0 };
      copies.push(record);
      return {
        ...fixture,
        close: () => {
          record.closes++;
          fixture.close();
        },
      };
    };
    const parent = generatorFixtureOwner(create);
    const nested = generatorFixtureOwner(create);
    const error = new Error(`${phase} 오류 fixture`);
    try {
      await expect(async () => {
        parent.create();
        const outer = nested.create();
        try {
          await genModule(outer.root, "fixture-owner-widgets");
          if (phase === "설정") throw error;
          nested.create(outer.root);
        } finally {
          nested.close(outer);
        }
        throw error;
      }).rejects.toBe(error);
    } finally {
      nested.closeAll();
      parent.closeAll();
    }
    expect(copies).toHaveLength(phase === "설정" ? 2 : 3);
    expect(copies.map(({ root, closes }) => ({ exists: existsSync(root), closes }))).toEqual(
      copies.map(() => ({ exists: false, closes: 1 })),
    );
  },
);
