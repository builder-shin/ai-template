import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isScalar, parseDocument } from "yaml";
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
    const project = doc.get("name", true);
    const app = doc.get("x-app", true);
    const image = isMap(app) ? app.get("image", true) : undefined;
    if (!isScalar(project) || !isScalar(image) || !project.range || !image.range) {
      throw new CreateError(
        "compose.yaml에 프로젝트·앱 이미지 이름이 없다",
        "최상위 name과 x-app의 image를 지정한다.",
      );
    }
    // 노드 값의 범위만 바꿔 주석, 앵커와 나머지 바이트를 보존한다.
    const edits = [
      { range: project.range, value: name },
      { range: image.range, value: imageName },
    ].sort((a, b) => b.range[0] - a.range[0]);
    let output = source;
    for (const edit of edits)
      output = output.slice(0, edit.range[0]) + edit.value + output.slice(edit.range[1]);
    writeFileSync(path, output);
  }
}
