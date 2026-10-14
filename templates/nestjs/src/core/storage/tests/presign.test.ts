import { afterEach, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { presignUpload, presignDownload } from "../presign.js";
import { storageClients } from "../client.js";
import type { Settings } from "../../config/settings.js";
const clients: S3Client[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
});
const settings = {
  S3_ENDPOINT_URL: "http://internal.example.test:8333",
  S3_PUBLIC_ENDPOINT_URL: "https://public.example.test",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "fixture-access",
  S3_SECRET_ACCESS_KEY: "fixture-signing-only", // betterleaks:allow 사유: 네트워크 없는 서명 시험의 가짜 값
} as Settings;
function client() {
  const value = new S3Client({
    region: "us-east-1",
    endpoint: settings.S3_PUBLIC_ENDPOINT_URL,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.S3_ACCESS_KEY_ID,
      secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  clients.push(value);
  return value;
}
it("PUT URL은 크기와 타입과 호스트를 서명하고 900초다", async () => {
  const result = await presignUpload(client(), {
    bucket: "app",
    key: "u/1",
    contentType: "image/png",
    size: 23,
  });
  const url = new URL(result.url);
  expect(url.pathname).toBe("/app/u/1");
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
  expect(result.headers).toEqual({ "Content-Type": "image/png" });
  expect(
    [...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith("x-amz-checksum")),
  ).toBe(false);
});
it("GET URL은 공개 주소의 경로 방식을 쓰고 600초다", async () => {
  const url = new URL(await presignDownload(client(), "app", "u/1"));
  expect(url.origin).toBe("https://public.example.test");
  expect(url.pathname).toBe("/app/u/1");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
});
it("스토리지 내부와 공개 클라이언트는 서로 다른 주소를 쓴다", async () => {
  const pair = storageClients(settings);
  clients.push(pair.internal, pair.public);
  const internal = new URL(await presignDownload(pair.internal, "app", "k"));
  const external = new URL(await presignDownload(pair.public, "app", "k"));
  expect(internal.origin).toBe("http://internal.example.test:8333");
  expect(external.origin).toBe("https://public.example.test");
  const upload = new URL(
    (
      await presignUpload(pair.public, {
        bucket: "app",
        key: "k",
        contentType: "image/png",
        size: 23,
      })
    ).url,
  );
  expect(upload.searchParams.has("x-amz-checksum-crc32")).toBe(false);
});
