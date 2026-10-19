import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
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
it.each(["stdout", "stderr"] as const)(
  "한글 문자를 두 번에 나눠 써도 접두사와 함께 온전히 출력한다: %s",
  async (stream) => {
    const output = vi.spyOn(process[stream], "write").mockImplementation(() => true);
    try {
      expect(
        await runDev({
          cwd: process.cwd(),
          env: {},
          specs: [
            {
              role: "api",
              argv: [
                "-e",
                `process.${stream}.write(Buffer.from([0xea]));setTimeout(()=>process.${stream}.write(Buffer.from([0xb0,0x80,10])),50)`,
              ],
            },
          ],
        }),
      ).toBe(0);
      expect(output.mock.calls.map(([value]) => String(value)).join("")).toBe("[api] 가\n");
    } finally {
      output.mockRestore();
    }
  },
);
it("자식 환경에만 있는 비밀도 api 접두사 뒤에서 가린다", async () => {
  const secret = "dev-child-only-private"; // betterleaks:allow 사유: 자식 환경만 가리는 시험 값
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    expect(
      await runDev({
        cwd: process.cwd(),
        env: { JWT_SECRET: secret },
        specs: [
          { role: "api", argv: ["-e", "process.stdout.write(process.env.JWT_SECRET+'\\n')"] },
        ],
      }),
    ).toBe(0);
    const text = output.mock.calls.map(([value]) => String(value)).join("");
    expect(text).toBe("[api] [REDACTED]\n");
    expect(text).not.toContain(secret);
  } finally {
    output.mockRestore();
  }
});
it("개발 실행기의 중단 신호는 소유 자식을 정리하고 130을 돌려준다", async () => {
  const controller = new AbortController();
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const running = runDev({
    cwd: process.cwd(),
    env: {},
    signal: controller.signal,
    specs: [
      { role: "api", argv: ["-e", "process.stdout.write('준비\\n');setInterval(()=>{},1000)"] },
    ],
  });
  try {
    await vi.waitFor(() => {
      expect(output).toHaveBeenCalledWith("[api] 준비\n");
    });
    controller.abort();
    expect(await running).toBe(130);
  } finally {
    controller.abort();
    await running;
    output.mockRestore();
  }
});
