import { expect, it } from "vitest";
import { fileFixture, errorCode } from "./file-fixture.js";
it.each([
  { size: 100, successes: 10, failures: 10 },
  { size: 500, successes: 2, failures: 18 },
])(
  "한도 1000바이트에서 $size 바이트 20개 경쟁은 $successes 생성과 $failures 한도 거절이다",
  async ({ size, successes, failures }) => {
    const f = await fileFixture({ FILE_USER_QUOTA: 1000, FILE_MAX_SIZE: 500 });
    const responses = await Promise.all(Array.from({ length: 20 }, () => f.create(size)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(successes);
    const rejected = responses.filter((r) => r.status === 422);
    expect(rejected).toHaveLength(failures);
    expect(rejected.map((r) => errorCode(r.text))).toEqual(
      Array.from({ length: failures }, () => "file.quota_exceeded"),
    );
    expect(responses.some((r) => r.status === 500)).toBe(false);
    const stored = await f.unit.run((tx) =>
      tx.file.aggregate({
        where: { ownerId: f.identity.userId, status: { in: ["pending", "ready"] } },
        _sum: { size: true },
      }),
    );
    expect(stored._sum.size).toBe(1000n);
  },
);
