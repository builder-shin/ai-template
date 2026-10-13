const fixtureUrl = "postgresql://app:app@fixture.invalid/app"; // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
import { afterEach, expect, it, vi } from "vitest";
import {
  assertLocalDatabase,
  assertProjectDatabase,
  classifyDatabase,
  ForeignDatabaseError,
} from "../guard.js";
const fixture = vi.hoisted(() => ({ tables: [] as string[], calls: [] as string[], fail: false }));
vi.mock("pg", () => ({
  default: {
    Client: class {
      async connect() {
        fixture.calls.push("connect");
        return Promise.resolve();
      }
      async query(sql: string) {
        fixture.calls.push(sql);
        if (fixture.fail) throw new Error("조회 실패");
        return Promise.resolve({ rows: fixture.tables.map((tablename) => ({ tablename })) });
      }
      async end() {
        fixture.calls.push("end");
        return Promise.resolve();
      }
    },
  },
}));
afterEach(() => {
  fixture.tables = [];
  fixture.calls = [];
  fixture.fail = false;
});
it.each([
  [[], "empty"],
  [["_prisma_migrations", "users"], "project"],
  [["users"], "foreign"],
  [["_prisma_migrations", "alembic_version"], "foreign"],
  [["_prisma_migrations", "django_migrations"], "foreign"],
])("표 목록으로 DB 소유를 판별한다: %j", (tables, expected) => {
  expect(classifyDatabase(tables)).toBe(expected);
});
it.each(["127.0.0.1", "localhost", "[::1]"])("로컬 reset을 허용한다: %s", (host) => {
  expect(() => {
    assertLocalDatabase(`postgresql://app:app@${host}:5432/app`); // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  }).not.toThrow();
});
it.each(["db.example.com", "127.0.0.2", "localhost.example.com"])(
  "외부 reset을 거절한다: %s",
  (host) => {
    expect(() => {
      assertLocalDatabase(`postgresql://app:app@${host}:5432/app`); // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
    }).toThrow("db:reset은 로컬 DB(127.0.0.1, localhost, ::1)만 지운다");
  },
);
it("다른 도구 표의 이름을 알리고 연결을 닫는다", async () => {
  fixture.tables = ["_prisma_migrations", "alembic_version"];
  const foreign = assertProjectDatabase(fixtureUrl);
  await expect(foreign).rejects.toBeInstanceOf(ForeignDatabaseError);
  await expect(foreign).rejects.toThrow("alembic_version");
  expect(fixture.calls.at(-1)).toBe("end");
  expect(fixture.calls[1]).toContain("pg_tables");
});
it("프로젝트 DB는 검사 뒤 연결을 닫는다", async () => {
  fixture.tables = ["_prisma_migrations", "users"];
  await expect(assertProjectDatabase(fixtureUrl)).resolves.toBeUndefined();
  expect(fixture.calls.at(-1)).toBe("end");
});
it("표 조회 실패에서도 연결을 닫는다", async () => {
  fixture.fail = true;
  await expect(assertProjectDatabase(fixtureUrl)).rejects.toThrow("조회 실패");
  expect(fixture.calls.at(-1)).toBe("end");
});
