const fixtureUrl = "postgresql://app:app@127.0.0.1:25432/app"; // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
import { afterEach, expect, it, vi } from "vitest";
import { databaseUrls, ensureDatabases } from "../databases.js";
const fixture = vi.hoisted(() => ({
  calls: [] as (readonly string[])[],
  owned: true,
  existing: "app\n",
}));
vi.mock("node:child_process", () => ({
  execFileSync: (_file: string, args: readonly string[]) => {
    fixture.calls.push(args);
    if (args[0] === "compose" && args[1] === "config") return '{"name":"nestjs"}';
    if (args[0] === "compose" && args[1] === "ps") return "owned-postgres\n";
    if (args[0] === "inspect")
      return JSON.stringify([
        {
          Config: {
            Labels: {
              "com.docker.compose.project": fixture.owned ? "nestjs" : "fastapi",
              "com.docker.compose.service": "postgres",
              "com.docker.compose.project.working_dir": process.cwd(),
            },
          },
        },
      ]);
    if (args.includes("SELECT datname FROM pg_database")) return fixture.existing;
    return "";
  },
}));
afterEach(() => {
  fixture.calls = [];
  fixture.owned = true;
  fixture.existing = "app\n";
});
it("세 DB 주소는 설정의 연결 정보를 유지하고 DB만 바꾼다", () => {
  expect(databaseUrls(fixtureUrl + "?schema=public")).toEqual([
    "postgresql://app:app@127.0.0.1:25432/app?schema=public", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
    "postgresql://app:app@127.0.0.1:25432/app_test?schema=public", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
    "postgresql://app:app@127.0.0.1:25432/app_e2e?schema=public", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  ]);
});
it("다른 compose 프로젝트의 컨테이너면 DB를 만들지 않는다", async () => {
  fixture.owned = false;
  await expect(ensureDatabases(fixtureUrl)).rejects.toThrow(
    "postgres 컨테이너가 이 프로젝트 소유가 아니다",
  );
  expect(fixture.calls.filter((args) => args[0] === "exec")).toEqual([]);
});
it("소유한 postgres 안에 없는 DB만 만든다", async () => {
  await ensureDatabases(fixtureUrl);
  const writes = fixture.calls.filter((args) =>
    args.some((arg) => arg.startsWith("CREATE DATABASE")),
  );
  expect(writes.map((args) => args.at(-1))).toEqual([
    'CREATE DATABASE "app_test"',
    'CREATE DATABASE "app_e2e"',
  ]);
  expect(writes.every((args) => args[0] === "exec" && args[1] === "owned-postgres")).toBe(true);
});

it("setup은 외부 DB 거부를 준비 명령 이름으로 알리고 Docker를 실행하지 않는다", async () => {
  await expect(ensureDatabases(fixtureUrl.replace("127.0.0.1", "fixture.invalid"))).rejects.toThrow(
    "setup은 로컬 DB(127.0.0.1, localhost, ::1)만 준비한다",
  );
  expect(fixture.calls).toEqual([]);
});
