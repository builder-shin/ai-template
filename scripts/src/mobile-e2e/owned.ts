import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
  lstatSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { join, dirname, resolve, relative, isAbsolute, basename } from "node:path";
import { tmpdir } from "node:os";
import { createMobilePlan, ROOT, type Backend } from "./plan.ts";
interface Owner {
  backend: Backend;
  runId: string;
  parent: string;
  project: string;
  nonce: string;
  marker: string;
  record: string;
}
const defaultCache = join(ROOT, "node_modules/.cache/mobile-e2e");
function same(a: string, b: string) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
export function createOwnedMobileProject(
  backend: Backend,
  runId: string,
  cache = defaultCache,
): Owner {
  createMobilePlan(backend, runId);
  mkdirSync(cache, { recursive: true });
  const record = join(resolve(cache), `${backend}-${runId}.json`);
  if (existsSync(record))
    throw new Error("Existing native ownership record; use another run ID or --down.");
  const parent = realpathSync.native(mkdtempSync(join(tmpdir(), `aitpl-mobile-${backend}-`)));
  const owner = {
    backend,
    runId,
    parent,
    project: join(parent, "project"),
    nonce: randomUUID(),
    marker: join(parent, ".mobile-owner.json"),
    record,
  };
  const text = JSON.stringify(owner);
  writeFileSync(owner.marker, text, { flag: "wx" });
  writeFileSync(record, text, { flag: "wx" });
  return owner;
}
function validate(owner: Owner) {
  createMobilePlan(owner.backend, owner.runId);
  if (
    !same(dirname(owner.parent), realpathSync.native(tmpdir())) ||
    !basename(owner.parent).startsWith(`aitpl-mobile-${owner.backend}-`) ||
    lstatSync(owner.parent).isSymbolicLink() ||
    !same(realpathSync.native(owner.parent), resolve(owner.parent)) ||
    !same(owner.project, join(owner.parent, "project")) ||
    !same(owner.marker, join(owner.parent, ".mobile-owner.json"))
  )
    throw new Error("Generated native directory ownership changed.");
  const marker: unknown = JSON.parse(readFileSync(owner.marker, "utf8"));
  if (JSON.stringify(marker) !== JSON.stringify(owner))
    throw new Error("Generated native marker ownership changed.");
}
export function readOwnedMobileProject(
  backend: Backend,
  runId: string,
  cache = defaultCache,
): Owner | undefined {
  createMobilePlan(backend, runId);
  const record = join(resolve(cache), `${backend}-${runId}.json`);
  if (!existsSync(record)) return undefined;
  if (lstatSync(record).isSymbolicLink()) throw new Error("Native ownership record is linked.");
  const owner = JSON.parse(readFileSync(record, "utf8")) as Owner;
  if (owner.backend !== backend || owner.runId !== runId || !same(owner.record, record))
    throw new Error("Native ownership identity changed.");
  validate(owner);
  return owner;
}
export function removeOwnedMobileProject(owner: Owner): void {
  validate(owner);
  const files: string[] = [],
    dirs: string[] = [];
  function visit(path: string) {
    const rest = relative(owner.parent, path);
    if (isAbsolute(rest) || rest === ".." || rest.startsWith("../") || rest.startsWith("..\\"))
      throw new Error("Native cleanup escaped ownership.");
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.isFile()) {
      files.push(path);
      return;
    }
    if (!stat.isDirectory() || !same(realpathSync.native(path), resolve(path)))
      throw new Error("Native cleanup path changed.");
    for (const name of readdirSync(path)) visit(join(path, name));
    dirs.push(path);
  }
  visit(owner.parent);
  for (const file of files) unlinkSync(file);
  for (const dir of dirs) rmdirSync(dir);
  // A changed record is preserved rather than deleting somebody else's ownership claim.
  if (readFileSync(owner.record, "utf8") !== JSON.stringify(owner))
    throw new Error("Native ownership record changed during cleanup.");
  unlinkSync(owner.record);
}
