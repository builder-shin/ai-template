import { PutObjectCommand, GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export async function presignUpload(
  client: S3Client,
  input: { bucket: string; key: string; contentType: string; size: number },
): Promise<{ url: string; headers: { "Content-Type": string } }> {
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.size,
    }),
    { expiresIn: 900, signableHeaders: new Set(["content-length", "content-type"]) },
  );
  return { url, headers: { "Content-Type": input.contentType } };
}
export function presignDownload(client: S3Client, bucket: string, key: string): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 600,
  });
}
