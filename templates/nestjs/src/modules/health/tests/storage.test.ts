import { expect, it } from "vitest";
import { HeadBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import { storageCheck } from "../index.js";
it("준비 상태는 내부 클라이언트로 지정 버킷을 확인한다", async () => {
  let request: unknown;
  const client = {
    send(command: unknown) {
      request = command;
      return Promise.resolve({});
    },
  } as unknown as S3Client;
  const check = storageCheck(client, "app");
  await check.check();
  expect(check.name).toBe("storage");
  expect(request).toBeInstanceOf(HeadBucketCommand);
  expect((request as HeadBucketCommand).input).toEqual({ Bucket: "app" });
});
it("버킷이 없으면 준비 상태 검사도 실패한다", async () => {
  const failure = new Error("버킷이 없다");
  const client = { send: () => Promise.reject(failure) } as unknown as S3Client;
  await expect(storageCheck(client, "app").check()).rejects.toBe(failure);
});
