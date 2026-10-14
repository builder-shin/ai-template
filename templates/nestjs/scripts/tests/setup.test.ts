import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { prepareEnvironment } from "../setup-env.js";
import { setup } from "../setup.js";
import { PutBucketCorsCommand, type S3Client } from "@aws-sdk/client-s3";
const fixture = vi.hoisted(() => ({ events: [] as unknown[], fail: false, storageFail: false }));
vi.mock("../../src/core/storage/client.js", () => ({
  storageClients: () => ({
    internal: {
      send(command: { constructor: { name: string }; input: unknown }) {
        fixture.events.push(["storage.internal", command.constructor.name, command.input]);
        if (fixture.storageFail && command instanceof PutBucketCorsCommand)
          return Promise.reject(new Error("CORS 준비 실패"));
        return Promise.resolve({});
      },
      destroy() {
        fixture.events.push("internal.destroy");
      },
    } as unknown as S3Client,
    public: {
      destroy() {
        fixture.events.push("public.destroy");
      },
    } as unknown as S3Client,
  }),
}));
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((file: string, args: string[]) => {
    fixture.events.push([file, args]);
    if (fixture.fail) throw new Error("기동 실패");
    return "";
  }),
}));
vi.mock("../db/databases.js", () => ({
  databaseUrls: () => [
    "postgresql://fixture/app",
    "postgresql://fixture/app_test",
    "postgresql://fixture/app_e2e",
  ],
  ensureDatabases: async () => {
    fixture.events.push("owned-databases");
    return Promise.resolve();
  },
}));
vi.mock("../db/migrate.js", () => ({
  migrate: async (url: string) => {
    fixture.events.push(["migrate", url]);
    return Promise.resolve();
  },
}));
vi.mock("../gen.js", () => ({
  generate: () => {
    fixture.events.push("generate");
  },
}));
vi.mock("../runtime.js", () => ({
  isMain: () => false,
  scriptSettings: () => ({
    DATABASE_URL: "postgresql://fixture/app",
    S3_BUCKET: "app",
    STORAGE_ALLOWED_ORIGINS: ["https://web.example.test"],
  }),
}));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);
  }
  roots.length = 0;
  fixture.events = [];
  fixture.fail = false;
  fixture.storageFail = false;
  vi.clearAllMocks();
});
it("환경 파일이 없으면 공개 예시를 복사한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-setup-env-"));
  roots.push(root);
  writeFileSync(join(root, "example"), "PORT=8000\nEMPTY=\n");
  prepareEnvironment(join(root, "settings.fixture"), join(root, "example"));
  expect(readFileSync(join(root, "settings.fixture"), "utf8")).toBe("PORT=8000\nEMPTY=\n");
});
it("환경 파일의 기존 값은 보존하고 없는 키만 더한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-setup-env-"));
  roots.push(root);
  writeFileSync(join(root, "example"), "PORT=8000\nEMPTY=\nNEW=value # 공개 값\n");
  writeFileSync(join(root, "settings.fixture"), "PORT=9000\nEMPTY=\n");
  prepareEnvironment(join(root, "settings.fixture"), join(root, "example"));
  expect(readFileSync(join(root, "settings.fixture"), "utf8")).toBe(
    "PORT=9000\nEMPTY=\nNEW=value # 공개 값\n",
  );
});
it("setup은 기동과 소유 확인 뒤 생성하고 세 DB를 migrate한다", async () => {
  // 환경 준비는 별도 시험에서 실제 임시 파일로 검증한다.
  const prepare = vi
    .spyOn(await import("../setup-env.js"), "prepareEnvironment")
    .mockImplementation(() => {
      fixture.events.push("environment");
    });
  try {
    await setup();
    expect(fixture.events).toEqual([
      "environment",
      ["docker", ["compose", "up", "-d", "--wait"]],
      "owned-databases",
      "generate",
      ["migrate", "postgresql://fixture/app"],
      ["migrate", "postgresql://fixture/app_test"],
      ["migrate", "postgresql://fixture/app_e2e"],
      ["storage.internal", "HeadBucketCommand", { Bucket: "app" }],
      [
        "storage.internal",
        "PutBucketCorsCommand",
        {
          Bucket: "app",
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ["https://web.example.test"],
                AllowedMethods: ["GET", "PUT", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        },
      ],
      "internal.destroy",
      "public.destroy",
    ]);
  } finally {
    prepare.mockRestore();
  }
});
it("CORS 준비 실패 때도 내부와 공개 클라이언트를 정리한다", async () => {
  const prepare = vi
    .spyOn(await import("../setup-env.js"), "prepareEnvironment")
    .mockImplementation(() => undefined);
  fixture.storageFail = true;
  try {
    await expect(setup()).rejects.toThrow("CORS 준비 실패");
    expect(fixture.events.slice(-2)).toEqual(["internal.destroy", "public.destroy"]);
  } finally {
    prepare.mockRestore();
  }
});
it("기동 실패 뒤에는 DB 생성과 migrate를 실행하지 않는다", async () => {
  const prepare = vi
    .spyOn(await import("../setup-env.js"), "prepareEnvironment")
    .mockImplementation(() => undefined);
  fixture.fail = true;
  try {
    await expect(setup()).rejects.toThrow("기동 실패");
    expect(execFileSync).toHaveBeenCalledOnce();
    expect(fixture.events).toHaveLength(1);
  } finally {
    prepare.mockRestore();
  }
});
