import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { Settings } from "../config/settings.js";
import { createStorageClient } from "./client.js";
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
