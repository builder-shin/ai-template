import { S3Client } from "@aws-sdk/client-s3";
import type { Settings } from "../config/settings.js";
export const STORAGE_CLIENTS: unique symbol = Symbol("STORAGE_CLIENTS");
export type StorageClients = { internal: S3Client; public: S3Client };
export function storageClients(settings: Settings): StorageClients {
  const config = {
    region: settings.S3_REGION,
    credentials: {
      accessKeyId: settings.S3_ACCESS_KEY_ID,
      secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
  return {
    internal: new S3Client({ ...config, endpoint: settings.S3_ENDPOINT_URL }),
    public: new S3Client({ ...config, endpoint: settings.S3_PUBLIC_ENDPOINT_URL }),
  };
}
