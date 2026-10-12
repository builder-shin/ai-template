import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export async function presignUpload(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  size: number,
  now = new Date(),
) {
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    {
      expiresIn: 900,
      signingDate: now,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
  // Browser supplies Content-Length from the actual body; scripts must transmit the declared bytes.
  return {
    url,
    method: "PUT" as const,
    headers: { "Content-Type": contentType },
    expiresAt: new Date(now.getTime() + 900_000).toISOString(),
  };
}
export async function presignDownload(
  client: S3Client,
  bucket: string,
  key: string,
  now = new Date(),
) {
  return {
    downloadUrl: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 600,
      signingDate: now,
    }),
    downloadUrlExpiresAt: new Date(now.getTime() + 600_000).toISOString(),
  };
}
