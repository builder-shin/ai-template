import { join, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { nativeProjectPath } from "./owned.mjs";
import { executeOwned } from "./command.mjs";
export async function prepareWindowsMaestro(java, owned, options = {}) {
  nativeProjectPath(owned);
  if ((options.platform ?? process.platform) !== "win32") return undefined;
  const base = join(owned.parent, "maestro-windows"),
    classes = join(base, "classes"),
    state = join(base, "state");
  if (existsSync(base))
    throw new Error("Existing Windows Maestro adapter output is not overwritten.");
  mkdirSync(classes, { recursive: true });
  mkdirSync(state);
  const javac = java === "java" ? "javac" : join(dirname(java), "javac.exe");
  const result = await (options.execute ?? executeOwned)(
    [
      javac,
      "-encoding",
      "UTF-8",
      "-d",
      classes,
      join(import.meta.dirname, "windows/KeyValueStore.java"),
    ],
    { capture: true, signal: options.signal },
  );
  if (result.code !== 0 || !existsSync(join(classes, "maestro/cli/db/KeyValueStore.class")))
    throw new Error(
      `Windows native tests require a Java 21 JDK with javac. ${result.stdout}${result.stderr}`,
    );
  const probe = await (options.execute ?? executeOwned)(
    [
      java,
      `-Daitpl.maestro.stateDir=${state}`,
      "-classpath",
      classes,
      join(import.meta.dirname, "windows/StoreProbe.java"),
      join(base, "must-not-create-user-db"),
    ],
    { capture: true, signal: options.signal },
  );
  if (probe.code !== 0 || !probe.stdout.includes("Native Maestro state verified."))
    throw new Error(`Windows native state self-check failed. ${probe.stdout}${probe.stderr}`);
  return Object.freeze({ classes, state });
}
