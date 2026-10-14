import { loadSettings } from "./core/config/settings.js";
import { storageClients } from "./core/storage/client.js";
import { prepareBucket } from "./core/storage/setup.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { JsonLogger } from "./core/logging/json-logger.js";
import { storageFailure } from "./core/storage/diagnostics.js";
export async function storageInit(): Promise<void> {
  const settings = loadSettings();
  const clients = storageClients(settings);
  try {
    await prepareBucket(clients.internal, settings.S3_BUCKET, settings.STORAGE_ALLOWED_ORIGINS);
  } finally {
    clients.internal.destroy();
    clients.public.destroy();
  }
}
export async function storageInitMain(): Promise<number> {
  try {
    await storageInit();
    return 0;
  } catch (error) {
    new JsonLogger().error(
      { message: "스토리지 버킷 준비가 실패했다", phase: "storage_init", ...storageFailure(error) },
      "storage-init",
    );
    return 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await storageInitMain();
}
