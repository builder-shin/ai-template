import { mkdirSync, writeFileSync } from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { expect, it } from "vitest";
import { loadSettings } from "../src/core/config/settings.js";
import { createStorageClient } from "../src/core/storage/client.js";
import { presignUpload, presignDownload } from "../src/core/storage/presign.js";
it("signs PUT length/type with SigV4 and omits optional checksums without any network", async () => {
  const settings = loadSettings({
    S3_ENDPOINT_URL: "http://internal.invalid:8333",
    S3_PUBLIC_ENDPOINT_URL: "https://public.invalid:8333",
  });
  const selected = createStorageClient(settings, true);
  const defaults = new S3Client({
    region: settings.S3_REGION,
    endpoint: settings.S3_PUBLIC_ENDPOINT_URL,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.S3_ACCESS_KEY_ID,
      secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
    },
  });
  const now = new Date("2026-10-12T00:00:00Z");
  try {
    const upload = await presignUpload(selected, "app", "files/id", "image/png", 12, now);
    const url = new URL(upload.url);
    expect(url.host).toBe("public.invalid:8333");
    expect(url.pathname).toBe("/app/files/id");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(
      [...url.searchParams.keys()].filter((k) =>
        /^x-amz-(checksum-|sdk-checksum-algorithm)/i.test(k),
      ),
    ).toEqual([]);
    expect(upload.headers).toEqual({ "Content-Type": "image/png" });
    expect(upload.expiresAt).toBe("2026-10-12T00:15:00.000Z");
    const changedSize = new URL(
      (await presignUpload(selected, "app", "files/id", "image/png", 13, now)).url,
    );
    const changedType = new URL(
      (await presignUpload(selected, "app", "files/id", "image/jpeg", 12, now)).url,
    );
    expect(changedSize.searchParams.get("X-Amz-Signature")).not.toBe(
      url.searchParams.get("X-Amz-Signature"),
    );
    expect(changedType.searchParams.get("X-Amz-Signature")).not.toBe(
      url.searchParams.get("X-Amz-Signature"),
    );
    const defaultUrl = new URL(
      await getSignedUrl(
        defaults,
        new PutObjectCommand({
          Bucket: "app",
          Key: "files/id",
          ContentType: "image/png",
          ContentLength: 12,
        }),
        { signingDate: now },
      ),
    );
    const checksumKeys = [...defaultUrl.searchParams.keys()].filter((k) =>
      /^x-amz-(checksum-|sdk-checksum-algorithm)/i.test(k),
    );
    expect(defaultUrl.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;host");
    expect(checksumKeys.length).toBeGreaterThan(0);
    const download = await presignDownload(selected, "app", "files/id", now);
    expect(new URL(download.downloadUrl).searchParams.get("X-Amz-Expires")).toBe("600");
    mkdirSync(".cache/storage", { recursive: true });
    writeFileSync(
      ".cache/storage/presign.json",
      JSON.stringify(
        {
          scope: "Installed SDK3.1149.0 no-network signatures; real storage enforcement pending CI",
          selected: {
            signedHeaders: url.searchParams.get("X-Amz-SignedHeaders"),
            algorithm: url.searchParams.get("X-Amz-Algorithm"),
            checksumKeys: [],
            publicHost: url.host,
            uploadExpiry: 900,
            downloadExpiry: 600,
          },
          defaults: {
            signedHeaders: defaultUrl.searchParams.get("X-Amz-SignedHeaders"),
            checksumKeys,
            checksums: Object.fromEntries(
              checksumKeys.map((k) => [k, defaultUrl.searchParams.get(k)]),
            ),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    selected.destroy();
    defaults.destroy();
  }
});
