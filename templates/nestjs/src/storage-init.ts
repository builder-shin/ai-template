import { loadSettings } from "./core/config/settings.js";
import { storageClients } from "./core/storage/client.js";
import { prepareBucket } from "./core/storage/setup.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
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
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await storageInit();
  } catch {
    process.stderr.write("스토리지 버킷을 준비하지 못했다\n");
    process.exitCode = 1;
  }
}
