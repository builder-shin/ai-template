import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings } from "../src/core/config/settings.js";
import type { Settings } from "../src/core/config/settings.js";
import { createStorageClient } from "../src/core/storage/client.js";
export async function storageSetup(settings: Settings): Promise<void> {
  const client = createStorageClient(settings);
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: settings.S3_BUCKET }));
    } catch (error) {
      if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404)
        throw error;
      await client.send(new CreateBucketCommand({ Bucket: settings.S3_BUCKET }));
    }
    await client.send(
      new PutBucketCorsCommand({
        Bucket: settings.S3_BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: settings.STORAGE_ALLOWED_ORIGINS.split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      }),
    );
  } finally {
    client.destroy();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await storageSetup(loadSettings(process.env));
