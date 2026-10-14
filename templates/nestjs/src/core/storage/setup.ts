import {
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
export function storageMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
export async function prepareBucket(
  client: S3Client,
  bucket: string,
  origins: readonly string[],
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!storageMissing(error)) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [...origins],
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );
}
