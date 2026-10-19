import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runImageHealthShell } from "./fixtures/image-health-shell.ts";

const root = resolve(import.meta.dirname, "../../..");
const workflow = parse(readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")) as {
  jobs: Record<string, { steps: { run?: string }[] }>;
};

describe.each([
  ["nestjs", "aitpl-nestjs-image-17-2"],
  ["create-combo-nestjs", "aitpl-ci-nest-api-17-2"],
])("%s 이미지 live health", (job, owner) => {
  const script = workflow.jobs[job]?.steps.find((step) =>
    step.run?.includes("--publish 127.0.0.1:18001:8000"),
  )?.run;
  if (!script) throw new Error("실제 이미지 health CI 블록이 없다");
  const start = script.indexOf("if ! timeout");
  const probe = script.slice(start >= 0 ? start : script.indexOf('test "$(curl'));

  it("UID 10001과 정확한 endpoint·요청 2초·전체 60초 경계를 유지한다", () => {
    expect(script).toMatch(/test "\$\(docker run --rm --entrypoint id .* -u\)" = 10001/);
    expect(probe).toContain("http://127.0.0.1:18001/health/live");
    expect(probe).toContain("--max-time 2");
    expect(probe).toContain("timeout 60s bash -c");
    expect(probe).not.toContain("--retry");
  });

  it.skipIf(process.platform === "win32").each([
    ["즉시 200", ["0:200"]],
    ["연결 reset 뒤 200", ["56:000", "0:200"]],
    ["빈 응답 뒤 200", ["52:000", "0:200"]],
    ["연결 거절 뒤 200", ["7:000", "0:200"]],
    ["요청 timeout 뒤 200", ["28:000", "0:200"]],
    ["503 뒤 200", ["22:503", "0:200"]],
    ["404 뒤 200", ["22:404", "0:200"]],
    ["불완전한 200 응답 뒤 완전한 200", ["18:200", "0:200"]],
  ])("%s이면 성공하고 실패 진단을 출력하지 않는다", (_name, responses) => {
    const result = runImageHealthShell(probe, responses, owner);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("probe-complete\n");
    expect(result.stderr.match(/request:/g)).toHaveLength(responses.length);
    expect(result.stderr).toContain("--max-time 2");
    expect(result.stderr).toContain("http://127.0.0.1:18001/health/live");
    expect(result.stdout).not.toContain("diagnostic-");
  });

  it
    .skipIf(process.platform === "win32")
    .each(["56:000", "52:000", "7:000", "28:000", "0:204", "0:302", "22:401", "22:503"])(
    "%s가 지속되면 60초 경계에서 실패하고 소유 컨테이너의 state와 logs를 남긴다",
    (response) => {
      const result = runImageHealthShell(probe, Array<string>(80).fill(response), owner);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("delay:60\n");
      expect(result.stderr).not.toContain("delay:61\n");
      expect(result.stdout).toBe(
        "diagnostic-state:" +
          owner +
          ':{"Status":"exited","ExitCode":1}\n' +
          "diagnostic-logs:" +
          owner +
          "\n",
      );
      expect(result.stdout).not.toContain("probe-complete");
    },
  );

  it.skipIf(process.platform === "win32")(
    "진단 명령도 실패해도 state와 logs를 모두 시도하고 실패를 보존한다",
    () => {
      const result = runImageHealthShell(probe, Array<string>(80).fill("56:000"), owner, true);
      expect(result.code).not.toBe(0);
      expect(result.stdout).toContain("diagnostic-state:" + owner);
      expect(result.stdout).toContain("diagnostic-logs:" + owner);
      expect(result.stdout).not.toContain("probe-complete");
    },
  );
});
