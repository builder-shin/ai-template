import { expect, it } from "vitest";
import { db, codes, settings } from "../helpers.js";
import { domainSuite, actor, createFile } from "../domain-helpers.js";
domainSuite("files-quota");
it("serializes 20 same-user creates near quota on actual transaction advisory locks", async () => {
  const owner = await actor(),
    quota = settings.FILE_USER_QUOTA;
  expect(quota).toBe(1024);
  expect((await createFile(owner.authorization, quota - 100)).status).toBe(201);
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => createFile(owner.authorization, 10)),
  );
  expect(responses.filter((r) => r.status === 201)).toHaveLength(10);
  const overflow = responses.filter((r) => r.status === 422);
  expect(overflow).toHaveLength(10);
  for (const r of overflow) {
    expect(codes(r)).toEqual(["file.quota_exceeded"]);
    expect(r.body).toMatchObject({
      errors: [{ source: { pointer: "/data/attributes/size" }, meta: { params: { quota } } }],
    });
  }
  const sum = (await db.file.aggregate({ where: { ownerId: owner.user.id }, _sum: { size: true } }))
    ._sum.size;
  expect(sum).toBe(BigInt(quota));
  expect(await db.file.count()).toBe(11);
  const other = await actor("other@example.com");
  expect((await createFile(other.authorization, 10)).status).toBe(201);
  console.log(
    JSON.stringify({
      quotaRace: {
        concurrency: 20,
        quota,
        success201: 10,
        quota422: 10,
        storedBytes: Number(sum),
        totalPendingRows: 11,
      },
    }),
  );
});
