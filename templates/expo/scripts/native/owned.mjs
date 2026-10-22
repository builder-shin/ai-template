import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  unlinkSync,
  rmdirSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname, basename, relative, isAbsolute, parse } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const owners = new WeakMap();
export function nativeProjectPath(handle) {
  const owner = owners.get(handle);
  if (!owner || owner.cleaned)
    throw new Error("Native project mutation requires active directory ownership.");
  const marker = JSON.parse(readFileSync(join(handle.parent, ".native-owner.json"), "utf8"));
  if (
    marker.nonce !== owner.nonce ||
    lstatSync(handle.path).isSymbolicLink() ||
    !same(realpathSync.native(handle.path), resolve(handle.path))
  )
    throw new Error("Native project ownership changed.");
  return handle.path;
}
const ignored = new Set([
  "node_modules",
  ".git",
  "android",
  "ios",
  ".expo",
  ".cache",
  ".turbo",
  "artifacts",
  "dist",
  "coverage",
  ".DS_Store",
]);
function same(left, right) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function contains(root, path) {
  const rest = relative(root, path);
  return (
    rest === "" ||
    (!isAbsolute(rest) && rest !== ".." && !rest.startsWith("../") && !rest.startsWith("..\\"))
  );
}
export function prepareNativeProject(source) {
  // Windows native codegen repeats the absolute source path in object filenames.
  // A fresh short root is necessary even when CMake hashes long object paths.
  const temporary = realpathSync.native(
    process.platform === "win32" ? parse(tmpdir()).root : tmpdir(),
  );
  const original = realpathSync.native(source),
    parent = realpathSync.native(mkdtempSync(join(temporary, "aitpl-n-")));
  const handle = Object.freeze({ parent, path: join(parent, "p") });
  const owner = { nonce: randomUUID(), cleaned: false, temporary };
  owners.set(handle, owner);
  writeFileSync(join(parent, ".native-owner.json"), JSON.stringify({ nonce: owner.nonce, parent }));
  function copy(from, to) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (
        ignored.has(name) ||
        (name.startsWith(".env") && name !== ".env.example") ||
        /\.(?:log|tsbuildinfo)$/.test(name)
      )
        continue;
      const input = join(from, name),
        output = join(to, name),
        stat = lstatSync(input);
      if (stat.isSymbolicLink())
        throw new Error("Native source contains a linked asset; use an independent source file.");
      if (stat.isDirectory()) copy(input, output);
      else if (stat.isFile()) {
        copyFileSync(input, output);
        if (process.platform !== "win32") chmodSync(output, stat.mode & 0o777);
      } else throw new Error("Unsupported native source entry.");
    }
  }
  try {
    copy(original, handle.path);
    return handle;
  } catch (error) {
    try {
      cleanNativeProject(handle);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Native copy and owned cleanup failed.");
    }
    throw error;
  }
}
export function cleanNativeProject(handle) {
  const owner = owners.get(handle);
  if (!owner) throw new Error("Native directory ownership is unknown.");
  if (owner.cleaned) return;
  const parent = resolve(handle.parent),
    temporary = owner.temporary;
  if (
    !same(dirname(parent), temporary) ||
    !basename(parent).startsWith("aitpl-n-") ||
    !contains(parent, handle.path) ||
    lstatSync(parent).isSymbolicLink() ||
    !same(realpathSync.native(parent), parent)
  )
    throw new Error("Native owned cleanup path changed.");
  const marker = JSON.parse(readFileSync(join(parent, ".native-owner.json"), "utf8"));
  if (marker.nonce !== owner.nonce || !same(marker.parent, parent))
    throw new Error("Native owned marker changed.");
  // Plan each item without following links, then unlink entries and remove only empty directories.
  const files = [],
    directories = [];
  function visit(path) {
    if (!contains(parent, path)) throw new Error("Native cleanup escaped its owned root.");
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.isFile()) {
      files.push(path);
      return;
    }
    if (!stat.isDirectory() || !same(realpathSync.native(path), path))
      throw new Error("Unexpected native cleanup entry.");
    for (const name of readdirSync(path)) visit(join(path, name));
    directories.push(path);
  }
  if (existsSync(parent)) visit(parent);
  for (const path of files) unlinkSync(path);
  for (const path of directories) rmdirSync(path);
  owner.cleaned = true;
}
