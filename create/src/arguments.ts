import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CreateError } from "./errors.ts";

export type Template = "fastapi" | "nextjs";

export interface CreateOptions {
  readonly target: string;
  readonly name: string;
  readonly template: Template;
  readonly git: boolean;
}

export const usage = `사용법:
  pnpm new <대상 폴더> --template <fastapi|nextjs> [--name <이름>] [--no-git]
  pnpm new --help

이름은 소문자로 시작하는 kebab-case이며 50자 이하다.
상대 경로는 명령을 실행한 폴더 기준이다.
`;

export function parseArguments(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): CreateOptions | "help" {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      tokens: true,
      options: {
        help: { type: "boolean" },
        template: { type: "string" },
        name: { type: "string" },
        "no-git": { type: "boolean" },
        api: { type: "string" },
        web: { type: "boolean" },
      },
    });
  } catch {
    throw new CreateError("인자가 올바르지 않다", "pnpm new --help로 사용법을 확인한다.", 2);
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) {
      throw new CreateError(`--${token.name}을 여러 번 지정했다`, "각 옵션은 한 번만 지정한다.", 2);
    }
    seen.add(token.name);
  }
  const { values, positionals } = parsed;
  if (values.help) return "help";
  if (values.template !== undefined && (values.api !== undefined || values.web)) {
    throw new CreateError(
      "단독과 조합 옵션을 함께 지정했다",
      "--template 또는 --api와 --web을 고른다.",
      2,
    );
  }
  if (values.api !== undefined || values.web) {
    if (values.api !== "fastapi" || !values.web) {
      throw new CreateError(
        "조합 옵션이 올바르지 않다",
        "--api fastapi와 --web을 함께 지정한다.",
        2,
      );
    }
    throw new CreateError(
      "조합 생성은 아직 준비되지 않았다",
      "단독 생성에는 --template을 지정한다.",
      2,
    );
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CreateError(
      "대상 폴더 하나가 필요하다",
      "pnpm new <대상 폴더> --template <fastapi|nextjs>로 실행한다.",
      2,
    );
  }
  if (values.template !== "fastapi" && values.template !== "nextjs") {
    throw new CreateError(
      "템플릿이 올바르지 않다",
      "--template fastapi 또는 --template nextjs를 지정한다.",
      2,
    );
  }
  const target = resolve(environment.INIT_CWD ?? process.cwd(), positionals[0]);
  const name = values.name ?? basename(target);
  if (name.length > 50 || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new CreateError(
      "이름이 올바르지 않다",
      "--name에 소문자로 시작하는 50자 이하 kebab-case 이름을 지정한다.",
      2,
    );
  }
  return { target, name, template: values.template, git: !values["no-git"] };
}
