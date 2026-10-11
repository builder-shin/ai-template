import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateError } from "./errors.ts";
import type { TemplateFile } from "./repository.ts";

/** 루트에 한 번 복사할 계약의 추적 경로·바이트·실행 권한이 같아야 한다. */
export function verifyContracts(
  repository: string,
  plans: readonly { template: string; files: readonly TemplateFile[] }[],
): void {
  const first = plans[0];
  if (!first) return;
  const files = (plan: (typeof plans)[number]) =>
    new Map(
      plan.files
        .filter((file) => file.path.startsWith("contract/"))
        .map((file) => [file.path, file]),
    );
  const original = files(first);
  for (const plan of plans.slice(1)) {
    const other = files(plan);
    for (const path of new Set([...original.keys(), ...other.keys()])) {
      if (
        !original.has(path) ||
        !other.has(path) ||
        original.get(path)?.executable !== other.get(path)?.executable ||
        !readFileSync(join(repository, "templates", first.template, path)).equals(
          readFileSync(join(repository, "templates", plan.template, path)),
        )
      )
        throw new CreateError(
          `프론트 계약이 다르다(${first.template}, ${plan.template}): ${path}`,
          "계약 사본의 경로·내용·실행 권한을 맞추고 커밋한다.",
        );
    }
  }
}
