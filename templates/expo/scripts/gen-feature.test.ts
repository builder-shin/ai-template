import { test } from "node:test";
import fs from "node:fs";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import ts from "typescript";
import { planFeature } from "./gen-feature/plan.ts";
import { writeFeature } from "./gen-feature/write.ts";
import { transform } from "./gen-feature/transform.ts";

test("AST renaming preserves unrelated prototype-named identifiers and strings", () => {
  const result = transform(
    'const label = "toString"; export const read = () => label.toString();',
    "queries.ts",
    "news",
    {},
  );
  assert.match(result, /label\.toString\(\)/);
  assert.match(result, /"toString"/);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aitpl-expo-feature-"));
  for (const path of [
    "src/features/posts",
    "src/lib/i18n/messages",
    "src/lib/navigation/features.json",
    "src/app/index.tsx",
    "src/app/posts",
    "src/app/(app)/posts",
    "package.json",
  ])
    cpSync(join(process.cwd(), path), join(root, path), { recursive: true });
  // This suite must also pass after a product has generated additional features.
  const registryPath = join(root, "src/lib/navigation/features.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
    features: { name: string; titleKey: string }[];
    protectedScreens: { name: string }[];
  };
  const extra = registry.features.filter((item) => item.name !== "posts");
  registry.features = registry.features.filter((item) => item.name === "posts");
  registry.protectedScreens = registry.protectedScreens.filter(
    (item) => !extra.some((feature) => item.name.startsWith(`${feature.name}/`)),
  );
  writeFileSync(registryPath, JSON.stringify(registry));
  for (const language of ["ko", "en"]) {
    const path = join(root, `src/lib/i18n/messages/${language}.json`);
    const catalog: Record<string, string> = JSON.parse(readFileSync(path, "utf8"));
    for (const key of Object.keys(catalog))
      if (
        extra.some(
          (item) =>
            key === item.titleKey ||
            (key.startsWith(item.titleKey) && /^[A-Z]/.test(key.slice(item.titleKey.length))),
        )
      )
        delete catalog[key];
    writeFileSync(path, JSON.stringify(catalog));
  }
  return root;
}
function removeOwned(root: string) {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.match(basename(root), /^aitpl-expo-feature-/);
  rmSync(root, { recursive: true, force: true });
}
function contents(root: string): [string, string][] {
  const result: [string, string][] = [];
  for (const path of readdirSync(root, { recursive: true, encoding: "utf8" }).sort()) {
    const file = join(root, path);
    if (lstatSync(file).isFile()) result.push([path, readFileSync(file, "utf8")]);
  }
  return result;
}
test("a valid feature copies executable golden code, catalogs, routes and explicit registration", () => {
  const root = fixture();
  try {
    const edits = planFeature(root, "release-notes");
    assert.equal(existsSync(join(root, "src/features/release-notes")), false);
    writeFeature(edits);
    const api = readFileSync(join(root, "src/features/release-notes/api.ts"), "utf8");
    assert.match(api, /class ReleaseNotesApi/);
    assert.match(api, /\["PostDocument"\]/); // Generated contract names stay unchanged until product review.
    assert.match(api, /GET\("\/posts"/);
    for (const file of ["list-screen.tsx", "detail-screen.tsx", "editor-screen.tsx"]) {
      const code = readFileSync(join(root, "src/features/release-notes", file), "utf8");
      assert.doesNotMatch(code, /\/posts\//);
      assert.match(code, /\/release-notes\//);
    }
    for (const file of readdirSync(join(root, "src/features/release-notes"))) {
      if (!/\.tsx?$/.test(file)) continue;
      const path = join(root, "src/features/release-notes", file);
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const result = ts.transpileModule(source.text, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
      });
      assert.equal(result.diagnostics?.length ?? 0, 0);
    }
    const registry = JSON.parse(
      readFileSync(join(root, "src/lib/navigation/features.json"), "utf8"),
    );
    assert.equal(registry.features.at(-1).routePrefix, "/release-notes");
    const en = JSON.parse(readFileSync(join(root, "src/lib/i18n/messages/en.json"), "utf8"));
    const ko = JSON.parse(readFileSync(join(root, "src/lib/i18n/messages/ko.json"), "utf8"));
    assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
    assert.ok(existsSync(join(root, "src/app/(app)/release-notes/[id]/edit.tsx")));
    const before = contents(root);
    assert.throws(() => planFeature(root, "release-notes"), /exists|collision|duplicate/i);
    assert.deepEqual(contents(root), before);
  } finally {
    removeOwned(root);
  }
});
test("invalid/reserved names, import collisions and missing golden input perform no writes", () => {
  const root = fixture();
  try {
    for (const name of [
      "../escape",
      "Upper",
      "my--feature",
      "posts",
      "account",
      "auth",
      "login",
      "me",
      "oauth",
      "api",
      "new",
      "node_modules",
      "constructor",
      "class",
      "con",
      "a".repeat(51),
    ]) {
      const before = contents(root);
      assert.throws(() => planFeature(root, name));
      assert.deepEqual(contents(root), before);
    }
    mkdirSync(join(root, "src/features/another"));
    writeFileSync(join(root, "src/features/another/index.ts"), "export class ReleaseNotesApi {}\n");
    const before = contents(root);
    assert.throws(() => planFeature(root, "release-notes"), /collision/i);
    assert.deepEqual(contents(root), before);
    rmSync(join(root, "src/features/posts/api.ts"));
    assert.throws(() => planFeature(root, "news"), /missing|golden|input/i);
  } finally {
    removeOwned(root);
  }
});
test("stale plans and unplanned writes are rejected before touching any output", () => {
  const root = fixture();
  try {
    const edits = planFeature(root, "news");
    writeFileSync(join(root, "src/lib/i18n/messages/en.json"), "{}\n");
    const before = contents(root);
    assert.throws(() => writeFeature(edits), /changed|stale/i);
    assert.deepEqual(contents(root), before);
    assert.throws(() => writeFeature([{ path: join(root, "escape.txt"), content: "bad" }]));
    assert.equal(existsSync(join(root, "escape.txt")), false);
  } finally {
    removeOwned(root);
  }
});
test("a linked output ancestor is rejected rather than followed", () => {
  const root = fixture(),
    outside = fixture();
  try {
    symlinkSync(
      outside,
      join(root, "src/app/news"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const before = contents(outside);
    assert.throws(() => planFeature(root, "news"), /link|collision|exists/i);
    assert.deepEqual(contents(outside), before);
    symlinkSync(
      join(outside, "missing"),
      join(root, "src/app/updates"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => planFeature(root, "updates"), /link/i);
  } finally {
    removeOwned(root);
    removeOwned(outside);
  }
});
test("a write failure restores prior files and removes only owned new output", (context) => {
  const root = fixture();
  try {
    const edits = planFeature(root, "news"),
      before = contents(root);
    const rename = fs.renameSync;
    let failed = false;
    context.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      if (!failed && args[1] === edits.at(-1)!.path) {
        failed = true;
        throw new Error("Injected filesystem failure");
      }
      return rename(...args);
    });
    assert.throws(() => writeFeature(edits), /Injected filesystem failure/);
    assert.deepEqual(contents(root), before);
    assert.equal(
      readdirSync(root).some((name) => name.startsWith(".feature-gen-")),
      false,
    );
  } finally {
    removeOwned(root);
  }
});
test("a rollback failure preserves indexed original backups for recovery", (context) => {
  const root = fixture();
  try {
    const edits = planFeature(root, "news"),
      original = readFileSync(join(root, "src/lib/i18n/messages/en.json"), "utf8");
    const rename = fs.renameSync;
    let rollingBack = false;
    context.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      if (args[1] === edits.at(-1)!.path) {
        rollingBack = true;
        throw new Error("Commit failure");
      }
      if (rollingBack && args[1] === join(root, "src/lib/i18n/messages/en.json"))
        throw new Error("Restore failure");
      return rename(...args);
    });
    assert.throws(() => writeFeature(edits), /Rollback incomplete/);
    const transaction = readdirSync(root).find((name) => name.startsWith(".feature-gen-"));
    assert.ok(transaction);
    const manifest = JSON.parse(readFileSync(join(root, transaction, "manifest.json"), "utf8")) as {
      index: number;
      path: string;
    }[];
    const entry = manifest.find(
      (item) => item.path === join(root, "src/lib/i18n/messages/en.json"),
    );
    assert.ok(entry);
    assert.equal(readFileSync(join(root, transaction, `${entry.index}.old`), "utf8"), original);
  } finally {
    removeOwned(root);
  }
});
