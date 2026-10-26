import fs from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { inside, noLinks, planned, type FileEdit } from "./edits.ts";
export function writeFeature(edits: readonly FileEdit[]): void {
  const { root, before } = planned(edits);
  const transaction = fs.mkdtempSync(join(root, ".feature-gen-"));
  inside(root, transaction);
  const applied: number[] = [],
    created: string[] = [];
  let succeeded = false,
    preserveRecovery = false;
  function ensureDirectory(path: string) {
    let cursor = root;
    for (const part of relative(root, path).split(sep)) {
      cursor = join(cursor, part);
      noLinks(root, cursor);
      if (!fs.existsSync(cursor)) {
        fs.mkdirSync(cursor);
        created.push(cursor);
      }
    }
  }
  try {
    fs.writeFileSync(
      join(transaction, "manifest.json"),
      JSON.stringify(
        edits.map((edit, index) => ({
          index,
          path: edit.path,
          hadOriginal: before[index]!.content !== undefined,
        })),
      ),
      { mode: 0o600 },
    );
    edits.forEach((edit, index) => {
      fs.writeFileSync(join(transaction, `${index}.new`), edit.content, {
        mode: before[index]!.mode,
      });
      if (before[index]!.content !== undefined)
        fs.writeFileSync(join(transaction, `${index}.old`), before[index]!.content!, {
          mode: before[index]!.mode,
        });
    });
    edits.forEach((edit, index) => {
      noLinks(root, edit.path);
      ensureDirectory(dirname(edit.path));
      fs.renameSync(join(transaction, `${index}.new`), edit.path);
      applied.push(index);
    });
    succeeded = true;
  } catch (error) {
    const failures: unknown[] = [];
    for (const index of applied.reverse()) {
      try {
        const edit = edits[index]!;
        noLinks(root, edit.path);
        if (before[index]!.content === undefined) fs.unlinkSync(edit.path);
        else fs.renameSync(join(transaction, `${index}.old`), edit.path);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length) {
      preserveRecovery = true;
      throw new AggregateError(
        [error, ...failures],
        `Rollback incomplete; recover original files using ${join(transaction, "manifest.json")}.`,
      );
    }
    throw error;
  } finally {
    noLinks(root, transaction);
    if (!basename(transaction).startsWith(".feature-gen-"))
      throw new Error("Unowned transaction directory.");
    if (!preserveRecovery) fs.rmSync(transaction, { recursive: true, force: true });
    if (!succeeded && !preserveRecovery)
      for (const path of created.reverse()) {
        if (fs.readdirSync(path).length === 0) fs.rmdirSync(path);
      }
  }
}
