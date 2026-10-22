import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { nativeProjectPath } from "./owned.mjs";
import { executeOwned } from "./command.mjs";

export async function seedAndroidImage(plan, owned, ports) {
  const image = join(nativeProjectPath(owned), "native.png"),
    size = readFileSync(image).length,
    directory = `/sdcard/Pictures/aitpl-native-${randomUUID()}`,
    file = `${directory}/native.png`,
    relativePath = `Pictures/${directory.split("/").at(-1)}/`,
    owner = { device: plan.deviceId, directory, file, relativePath, claimed: false },
    device = [ports.adb, "-s", plan.deviceId],
    where = `"relative_path='${relativePath}' AND _display_name='native.png'"`,
    media = "content://media/external/images/media";
  const execute = ports.execute ?? executeOwned;
  writeFileSync(ports.record, JSON.stringify(owner), { flag: "wx" });
  async function command(args, signal = ports.signal) {
    return execute([...device, ...args], { capture: true, env: ports.env, signal });
  }
  async function required(args, label, signal) {
    const result = await command(args, signal);
    if (result.code !== 0)
      throw new Error(`Native image ${label} failed; ownership: ${ports.record}`);
    return result.stdout ?? "";
  }
  async function stop() {
    if (readFileSync(ports.record, "utf8") !== JSON.stringify(owner))
      throw new Error("Native image cleanup ownership changed.");
    if (owner.claimed) {
      const signal = AbortSignal.timeout(10000);
      await required(
        ["shell", "content", "delete", "--uri", media, "--where", where],
        "cleanup",
        signal,
      );
      await required(["shell", "rm", "-f", "--", file], "cleanup", signal);
      await required(["shell", "rmdir", "--", directory], "cleanup", signal);
    }
    unlinkSync(ports.record);
  }
  try {
    await required(["shell", "mkdir", "-p", "/sdcard/Pictures"], "parent preparation");
    await required(["shell", "mkdir", directory], "directory claim");
    owner.claimed = true;
    writeFileSync(ports.record, JSON.stringify(owner));
    // The SDK transfer closes its descriptor. Maestro 2.11.0's Android addMedia does not.
    await required(["push", image, file], "closed transfer");
    await required(
      [
        "shell",
        "am",
        "broadcast",
        "-a",
        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d",
        `file://${file}`,
      ],
      "media scan",
    );
    const indexed = AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(ports.signal ? [ports.signal] : []),
    ]);
    for (let attempt = 0; attempt < 50; attempt++) {
      ports.signal?.throwIfAborted();
      const result = await required(
        [
          "shell",
          "content",
          "query",
          "--uri",
          media,
          "--projection",
          "_id:_size",
          "--where",
          where,
        ],
        "index readiness",
        indexed,
      );
      if (/\b_id=\d+\b/.test(result) && Number(/\b_size=(\d+)\b/.exec(result)?.[1]) === size)
        return stop;
      await (ports.pause ?? ((delay) => sleep(delay, undefined, { signal: indexed })))(200);
    }
    throw new Error("Native image was not indexed with its exact byte size.");
  } catch (error) {
    try {
      await stop();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        `Native image preparation cleanup failed; ownership: ${ports.record}`,
      );
    }
    throw error;
  }
}
