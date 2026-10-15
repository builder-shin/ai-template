import { expect, it } from "vitest";
import { BACKENDS, backendOf } from "../src/backends.ts";
import { parseArguments } from "../src/arguments.ts";
import { temporaryFolder, write } from "./helpers.ts";

it("백엔드는 API의 실제 파일로 판정하고 Python 도구 필요 여부를 정한다", () => {
  const root = temporaryFolder();
  write(root, "package.json", '{"name":"api"}\n');
  expect(backendOf(root)).toBe("nestjs");
  expect(BACKENDS[backendOf(root)]).toMatchObject({
    ownsPackageJson: true,
    setupTools: [],
    apiDockerfile: "root-context",
    reservedName: "nestjs",
  });
  write(root, "pyproject.toml", "[project]\nname = 'app'\n");
  expect(backendOf(root)).toBe("fastapi");
  expect(BACKENDS[backendOf(root)]).toMatchObject({
    ownsPackageJson: false,
    setupTools: ["uv"],
    apiDockerfile: "app-context",
  });
});

it.each([
  ["--template", "nestjs"],
  ["--api", "nestjs", "--web"],
  ["--api", "nestjs", "--admin"],
  ["--api", "nestjs", "--web", "--admin"],
])("NestJS 단독·조합 입력을 받고 백엔드 예약 이름은 오류 2로 거절한다: %j", (...flags) => {
  expect(parseArguments(["my-project", ...flags], {})).toMatchObject({
    name: "my-project",
    template: flags[0] === "--template" ? "nestjs" : "combo",
    ...(flags[0] === "--api" ? { backend: "nestjs" } : {}),
  });
  for (const target of [["nestjs"], ["target", "--name", "nestjs"]]) {
    expect(() => parseArguments([...target, ...flags], {})).toThrow(
      expect.objectContaining({ exitCode: 2 }),
    );
    expect(() => parseArguments([...target, ...flags], {})).toThrow(/nestjs.*--name/);
  }
});

it.each(["api", "web", "admin"])("NestJS 조합 앱 이름 충돌을 생성 전에 거절한다: %s", (name) => {
  expect(() => parseArguments([name, "--api", "nestjs", "--web"], {})).toThrow(
    expect.objectContaining({ exitCode: 2 }),
  );
  expect(parseArguments([name, "--template", "nestjs"], {})).toMatchObject({ name });
});
