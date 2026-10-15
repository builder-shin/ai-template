import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runDev } from "../dev.js";
import { gone } from "./fixtures/process-probes.js";
it("개발 자식 하나가 종료 코드 7로 끝나면 다른 소유 자식도 정리한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-dev-"));
  const file = join(dir, "pid");
  try {
    const code = await runDev({
      cwd: process.cwd(),
      env: {},
      specs: [
        { role: "api", argv: ["-e", "setTimeout(()=>process.exit(7),500)"] },
        {
          role: "worker",
          argv: [
            "-e",
            "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
            file,
          ],
        },
      ],
    });
    expect(code).toBe(7);
    expect(gone(Number(await readFile(file, "utf8")))).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);
