import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CreateError, errorReason } from "./errors.ts";
import type { Backend } from "./backends.ts";

export type Template = Backend | "nextjs" | "nextjs-admin";
export type Frontend = "web" | "admin";

export interface CreateOptions {
  readonly target: string;
  readonly name: string;
  readonly template: Template | "combo";
  readonly git: boolean;
  readonly frontends?: readonly Frontend[];
  readonly backend?: Backend;
}

export const usage = `사용법:
  pnpm new <대상 폴더> --template <fastapi|nestjs|nextjs|nextjs-admin> [--name <이름>] [--no-git]
  pnpm new <대상 폴더> --api <fastapi|nestjs> [--web] [--admin] [--name <이름>] [--no-git]
  pnpm new --help

이름은 소문자로 시작하는 kebab-case이며 50자 이하다.
상대 경로는 명령을 실행한 폴더 기준이다.
조합은 --web, --admin 가운데 하나 이상이 필요하다.
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
        admin: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new CreateError(
      `인자가 올바르지 않다(${errorReason(error)})`,
      "pnpm new --help로 사용법을 확인한다.",
      2,
    );
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) {
      throw new CreateError(
        `옵션을 여러 번 지정했다: --${token.name}`,
        "각 옵션은 한 번만 지정한다.",
        2,
      );
    }
    seen.add(token.name);
  }
  const { values, positionals } = parsed;
  if (values.help) return "help";
  if (values.template !== undefined && (values.api !== undefined || values.web || values.admin)) {
    throw new CreateError(
      "단독과 조합 옵션을 함께 지정했다",
      "--template 또는 --api와 프론트 옵션(--web, --admin)을 고른다.",
      2,
    );
  }
  if (values.api !== undefined || values.web || values.admin) {
    if (!["fastapi", "nestjs"].includes(values.api ?? "") || (!values.web && !values.admin)) {
      throw new CreateError(
        "조합 옵션이 올바르지 않다",
        "--api fastapi 또는 nestjs에 --web, --admin 가운데 하나 이상을 지정한다.",
        2,
      );
    }
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CreateError(
      "대상 폴더 하나가 필요하다",
      "pnpm new <대상 폴더> --template <fastapi|nestjs|nextjs|nextjs-admin>로 실행한다.",
      2,
    );
  }
  if (
    values.api === undefined &&
    values.template !== "fastapi" &&
    values.template !== "nestjs" &&
    values.template !== "nextjs" &&
    values.template !== "nextjs-admin"
  ) {
    throw new CreateError(
      "템플릿이 올바르지 않다",
      "--template fastapi, nestjs, nextjs 또는 nextjs-admin을 지정한다.",
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
  const backend = values.api ?? values.template;
  if ((backend === "fastapi" || backend === "nestjs") && name === backend) {
    throw new CreateError(
      `${backend}는 템플릿의 개발 compose 프로젝트 이름이다`,
      "다른 --name을 지정한다.",
      2,
    );
  }
  if (values.api !== undefined && ["api", "web", "admin"].includes(name)) {
    throw new CreateError(
      `조합 앱의 workspace 패키지 이름(${name})과 겹친다`,
      "다른 --name을 지정한다.",
      2,
    );
  }
  return {
    target,
    name,
    template: values.api ? "combo" : (values.template as Template),
    git: !values["no-git"],
    ...(values.api === "nestjs" ? { backend: "nestjs" as const } : {}),
    ...(values.api
      ? {
          frontends: [
            ...(values.web ? ["web" as const] : []),
            ...(values.admin ? ["admin" as const] : []),
          ],
        }
      : {}),
  };
}
