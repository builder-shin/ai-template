import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isScalar, parseDocument, stringify } from "yaml";
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";

export function renameStandalone(
  root: string,
  template: Template,
  name: string,
  imageName = `${name}-app`,
): void {
  const readme = join(root, "README.md");
  const content = readFileSync(readme, "utf8");
  writeFileSync(readme, content.replace(/^[^\r\n]*/, `# ${name}`));
  if (template === "nextjs") {
    const path = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    pkg.name = name;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    const path = join(root, "compose.yaml");
    const source = readFileSync(path, "utf8");
    const doc = parseDocument(source);
    if (doc.errors.length)
      throw new CreateError("compose.yaml이 올바르지 않다", "템플릿의 YAML 문법을 고친다.");
    if (doc.has("name")) {
      throw new CreateError(
        "템플릿 compose.yaml에 최상위 name이 있다",
        "손으로 복사한 프로젝트끼리 볼륨을 공유하지 않도록 템플릿의 name을 지운다.",
      );
    }
    const app = doc.get("x-app", true);
    const image = isMap(app) ? app.get("image", true) : undefined;
    if (!isScalar(image) || !image.range) {
      throw new CreateError("compose.yaml에 앱 이미지 이름이 없다", "x-app의 image를 지정한다.");
    }
    // 노드 값의 범위만 바꿔 주석, 앵커와 나머지 바이트를 보존한다.
    const output =
      `# 폴더와 관계없이 compose 프로젝트와 볼륨 이름을 프로젝트 이름으로 고정한다.\nname: ${stringify(name)}` +
      source.slice(0, image.range[0]) +
      imageName +
      source.slice(image.range[1]);
    writeFileSync(path, output);
  }
}
