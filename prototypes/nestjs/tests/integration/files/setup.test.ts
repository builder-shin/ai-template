import { spawnSync } from "node:child_process";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { domainSuite, app } from "../domain-helpers.js";
import { Storage } from "../../../src/core/storage/client.js";
import { childEnvironment } from "../../../scripts/preflight-tmp.mjs";
domainSuite("storage-setup");
it("executes storage-setup twice preserving a real object and replacing existing CORS each time", async () => {
  const storage = app.get(Storage),
    bucket = storage.settings.S3_BUCKET,
    key = storage.key("setup-preserve"),
    bytes = Buffer.from("preserved across setup");
  await storage.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes }));
  const observations: object[] = [];
  for (const n of [1, 2]) {
    await storage.client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [`https://stale${String(n)}.invalid`],
              AllowedMethods: ["GET"],
              AllowedHeaders: ["old"],
              MaxAgeSeconds: 1,
            },
          ],
        },
      }),
    );
    const startedUTC = new Date().toISOString(),
      began = performance.now();
    const run = spawnSync("pnpm", ["storage:setup"], { env: childEnvironment(), encoding: "utf8" });
    const afterReturnUTC = new Date().toISOString(),
      nativeElapsedMs = performance.now() - began;
    expect(run.status, run.stderr).toBe(0);
    const result = await storage.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("Missing sentinel object body.");
    const actualBytes = Buffer.from(await result.Body.transformToByteArray());
    expect(actualBytes).toEqual(bytes);
    const cors = await storage.client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    expect(cors.CORSRules).toHaveLength(1);
    const rule = cors.CORSRules?.[0];
    expect(rule?.AllowedOrigins).toEqual(storage.settings.STORAGE_ALLOWED_ORIGINS.split(","));
    expect([...(rule?.AllowedMethods ?? [])].sort()).toEqual(["GET", "HEAD", "PUT"]);
    expect(rule?.AllowedHeaders).toEqual(["*"]);
    expect(rule?.ExposeHeaders).toEqual(["ETag"]);
    expect(rule?.MaxAgeSeconds).toBe(3000);
    observations.push({
      execution: n,
      startedUTC,
      afterReturnUTC,
      nativeElapsedMs,
      stdout: run.stdout,
      stderr: run.stderr,
      nativeExit: run.status,
      preservedBytes: actualBytes.length,
      cors: cors.CORSRules,
    });
  }
  console.log(JSON.stringify({ storageSetupTwoExecutions: observations }));
});
