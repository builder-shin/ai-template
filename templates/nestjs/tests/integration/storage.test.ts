import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DeleteBucketCommand, GetBucketCorsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { prepareBucket } from "../../src/core/storage/setup.js";
import { storageClients, type StorageClients } from "../../src/core/storage/client.js";
import { getState } from "./state.js";
import { fileFixture } from "./file-fixture.js";
const owned: { clients: StorageClients; bucket: string; created: boolean }[] = [];
afterEach(async () => {
  for (const f of owned.splice(0)) {
    try {
      if (f.created) await f.clients.internal.send(new DeleteBucketCommand({ Bucket: f.bucket }));
    } finally {
      f.clients.internal.destroy();
      f.clients.public.destroy();
    }
  }
});
it("새 버킷을 만들고 기존 CORS도 새 Origin 목록으로 교체한다", async () => {
  const bucket = `aitpl-task15-${randomUUID()}`;
  const clients = storageClients(getState().settings);
  const f = { clients, bucket, created: false };
  owned.push(f);
  await prepareBucket(clients.internal, bucket, ["https://first.example.test"]);
  f.created = true;
  await expect(
    clients.internal.send(new HeadBucketCommand({ Bucket: bucket })),
  ).resolves.toMatchObject({ $metadata: { httpStatusCode: 200 } });
  await prepareBucket(clients.internal, bucket, ["https://next.example.test"]);
  const cors = await clients.internal.send(new GetBucketCorsCommand({ Bucket: bucket }));
  expect(cors.CORSRules).toEqual([
    {
      AllowedOrigins: ["https://next.example.test"],
      AllowedMethods: ["GET", "PUT", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3000,
    },
  ]);
});
it("지정한 버킷이 없으면 ready는 DB와 Redis 성공에도 503이다", async () => {
  const f = await fileFixture({ S3_BUCKET: `aitpl-missing-${randomUUID()}` });
  const response = await f.http.get("/health/ready");
  expect(response.status).toBe(503);
  expect(JSON.parse(response.text) as unknown).toEqual({
    status: "unavailable",
    checks: { database: "ok", redis: "ok", storage: "unavailable" },
  });
});
