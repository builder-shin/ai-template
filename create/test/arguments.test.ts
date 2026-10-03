import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArguments } from "../src/arguments.ts";
import { CreateError } from "../src/errors.ts";

describe("CLI 입력", () => {
  it("상대 대상은 INIT_CWD에서 풀고 이름은 폴더에서 고른다", () => {
    expect(parseArguments(["my-web", "--template", "nextjs"], { INIT_CWD: "/caller" })).toEqual({
      target: resolve("/caller", "my-web"),
      name: "my-web",
      template: "nextjs",
      git: true,
    });
  });

  it("INIT_CWD가 없으면 현재 폴더를 쓰고 이름과 git 생략을 받는다", () => {
    expect(
      parseArguments(["Some Folder", "--template=fastapi", "--name", "my-api", "--no-git"], {}),
    ).toEqual({
      target: resolve("Some Folder"),
      name: "my-api",
      template: "fastapi",
      git: false,
    });
  });

  it("도움말은 대상이나 도구 없이 읽는다", () => {
    expect(parseArguments(["--help"], {})).toBe("help");
  });

  it.each(
    [
      [],
      ["my-app"],
      ["my-app", "--template", "nestjs"],
      ["my-app", "extra", "--template", "nextjs"],
      ["my-app", "--unknown"],
      ["my-app", "--template"],
      ["my-app", "--template", "nextjs", "--api", "fastapi", "--web"],
      ["my-app", "--api", "fastapi"],
      ["my-app", "--web"],
      ["my-app", "--api", "nestjs", "--web"],
      ["my-app", "--api", "fastapi", "--web"],
      ["my-app", "--template", "nextjs", "--template", "fastapi"],
      ["my-app", "--template", "nextjs", "--no-git=false"],
    ].map((args) => [args]),
  )("틀린 인자는 사용법 오류 2다: %j", (args) => {
    try {
      parseArguments(args, {});
      expect.fail("잘못된 인자는 거절해야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(CreateError);
      expect(error).toMatchObject({ exitCode: 2 });
      expect((error as Error).message).toMatch(/^pnpm new: .+ — .+$/);
    }
  });

  it.each(["Upper", "1app", "two_words", "two--words", "끝", "", "a".repeat(51), "app-"])(
    "사용할 수 없는 이름은 거절한다: %j",
    (name) => {
      expect(() => parseArguments(["target", "--template", "nextjs", "--name", name], {})).toThrow(
        CreateError,
      );
    },
  );

  it("50자 이름은 사용할 수 있다", () => {
    expect(
      parseArguments(["target", "--template", "fastapi", "--name", "a".repeat(50)], {}),
    ).toMatchObject({ name: "a".repeat(50) });
  });
});
