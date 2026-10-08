import { mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";

/** 각 패키지의 실제 위치를 연결해 workspace의 상대 링크가 사본 기준으로 바뀌지 않게 한다. */
export function linkDependencies(source: string, target: string): void {
  const destination = join(target, "node_modules");
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(join(source, "node_modules"))) {
    if (entry.startsWith(".")) continue;
    const packages = entry.startsWith("@")
      ? readdirSync(join(source, "node_modules", entry)).map((name) => join(entry, name))
      : [entry];
    for (const name of packages) {
      const path = join(destination, name);
      mkdirSync(join(path, ".."), { recursive: true });
      symlinkSync(realpathSync(join(source, "node_modules", name)), path, "junction");
    }
  }
}
