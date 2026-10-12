import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
import { presignUpload, presignDownload } from "./presign.js";
export function createStorageClient(settings: Settings, publicEndpoint = false): S3Client {
  return new S3Client({
    endpoint: publicEndpoint ? settings.S3_PUBLIC_ENDPOINT_URL : settings.S3_ENDPOINT_URL,
    region: settings.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.S3_ACCESS_KEY_ID,
      secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
  });
}
@Injectable()
export class Storage implements OnModuleDestroy {
  readonly client: S3Client;
  readonly signer: S3Client;
  constructor(@Inject(SETTINGS) readonly settings: Settings) {
    this.client = createStorageClient(settings);
    this.signer = createStorageClient(settings, true);
  }
  key(key: string) {
    return this.settings.S3_KEY_PREFIX + key;
  }
  upload(key: string, contentType: string, size: number) {
    return presignUpload(this.signer, this.settings.S3_BUCKET, this.key(key), contentType, size);
  }
  download(key: string) {
    return presignDownload(this.signer, this.settings.S3_BUCKET, this.key(key));
  }
  async size(key: string): Promise<number | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.settings.S3_BUCKET, Key: this.key(key) }),
      );
      if (result.ContentLength === undefined)
        throw new Error("Storage HEAD omitted Content-Length.");
      return result.ContentLength;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
        return null;
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.settings.S3_BUCKET, Key: this.key(key) }),
    );
  }
  async clear(): Promise<void> {
    if (!this.settings.S3_KEY_PREFIX.startsWith("aitpl-"))
      throw new Error("Storage cleanup requires an owned aitpl- prefix.");
    let continuation: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.settings.S3_BUCKET,
          Prefix: this.settings.S3_KEY_PREFIX,
          ...(continuation ? { ContinuationToken: continuation } : {}),
        }),
      );
      for (const item of page.Contents ?? [])
        if (item.Key)
          await this.client.send(
            new DeleteObjectCommand({ Bucket: this.settings.S3_BUCKET, Key: item.Key }),
          );
      continuation = page.NextContinuationToken;
    } while (continuation);
  }
  onModuleDestroy(): void {
    this.client.destroy();
    this.signer.destroy();
  }
}
