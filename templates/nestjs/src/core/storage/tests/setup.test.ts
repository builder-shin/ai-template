import { expect, it } from "vitest";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { prepareBucket } from "../setup.js";
const cors = {
  CORSRules: [
    {
      AllowedOrigins: ["https://web.example.test"],
      AllowedMethods: ["GET", "PUT", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3000,
    },
  ],
};
function fixture(error?: Error) {
  const commands: unknown[] = [];
  const client = {
    send(command: unknown) {
      commands.push(command);
      if (command instanceof HeadBucketCommand && error) return Promise.reject(error);
      return Promise.resolve({});
    },
  } as unknown as S3Client;
  return { client, commands };
}
it("없는 버킷을 만든 뒤 CORS를 교체한다", async () => {
  const f = fixture(
    Object.assign(new Error("없다"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }),
  );
  await prepareBucket(f.client, "app", ["https://web.example.test"]);
  expect(f.commands.map((c) => (c as object).constructor)).toEqual([
    HeadBucketCommand,
    CreateBucketCommand,
    PutBucketCorsCommand,
  ]);
  expect((f.commands[2] as PutBucketCorsCommand).input).toEqual({
    Bucket: "app",
    CORSConfiguration: cors,
  });
});
it("기존 버킷의 CORS도 요청한 Origin으로 교체한다", async () => {
  const f = fixture();
  await prepareBucket(f.client, "app", ["https://web.example.test"]);
  expect(f.commands).toHaveLength(2);
  expect((f.commands[1] as PutBucketCorsCommand).input).toEqual({
    Bucket: "app",
    CORSConfiguration: cors,
  });
});
it("버킷 권한 실패를 버킷 없음으로 처리하지 않는다", async () => {
  const denied = Object.assign(new Error("거절했다"), {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
  });
  const f = fixture(denied);
  await expect(prepareBucket(f.client, "app", ["https://web.example.test"])).rejects.toBe(denied);
  expect(f.commands).toHaveLength(1);
});
