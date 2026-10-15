import { expect, it } from "vitest";
import { FilesRepository } from "../index.js";
import type { Tx } from "../../../core/db/unit-of-work.js";

it.each(["avatar", "post", "widget", "none"])(
  "%s 참조를 검사한 뒤 연결된 파일을 보존하고 없는 파일만 지운다",
  async (reference) => {
    const effects: string[] = [];
    const tx = {
      $queryRaw: () => {
        effects.push("lock");
        return Promise.resolve([]);
      },
      user: { count: () => Promise.resolve(reference === "avatar" ? 1 : 0) },
      post: { count: () => Promise.resolve(reference === "post" ? 1 : 0) },
      file: {
        findUnique: () => Promise.resolve({ id: "f", key: "cover", detachedAt: new Date() }),
        update: () => {
          effects.push("clear");
          return Promise.resolve({});
        },
        delete: () => {
          effects.push("delete");
          return Promise.resolve({});
        },
      },
    } as unknown as Tx;
    const repository = new FilesRepository([
      (input: Tx, id: string) => {
        expect(input).toBe(tx);
        expect(id).toBe("f");
        effects.push("widget");
        return Promise.resolve(reference === "widget" ? 1 : 0);
      },
    ]);
    const claimed = await repository.claimDetached(tx, ["f", "f"]);
    expect(claimed.map((file) => file.id)).toEqual(reference === "none" ? ["f"] : []);
    expect(effects).toEqual(
      reference === "avatar" || reference === "post"
        ? ["lock", "clear"]
        : ["lock", "widget", reference === "none" ? "delete" : "clear"],
    );
  },
);
