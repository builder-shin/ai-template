import "reflect-metadata";
import { afterEach } from "vitest";
import { z } from "zod";
import request from "supertest";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Settings } from "../../src/core/config/settings.js";
import { createApp } from "../../src/core/http/create-app.js";
import { storageClients, type StorageClients } from "../../src/core/storage/client.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
import { signAccessToken } from "../../src/core/security/jwt.js";
import { getState } from "./state.js";
export { mediaType, errorCode } from "./session-fixture.js";
const owned: {
  app: NestExpressApplication;
  clients: StorageClients;
  bucket: string;
  keys: Set<string>;
}[] = [];
afterEach(async () => {
  for (const resource of owned.splice(0)) {
    try {
      for (const Key of resource.keys)
        await resource.clients.internal.send(
          new DeleteObjectCommand({ Bucket: resource.bucket, Key }),
        );
    } finally {
      await resource.app.close();
      resource.clients.internal.destroy();
      resource.clients.public.destroy();
    }
  }
});
export const fileDocument = (text: string) =>
  z
    .object({
      data: z.object({
        id: z.string(),
        attributes: z.object({
          filename: z.string(),
          size: z.number(),
          status: z.enum(["pending", "ready"]),
          createdAt: z.string(),
        }),
        meta: z
          .object({
            upload: z
              .object({
                url: z.string(),
                method: z.literal("PUT"),
                headers: z.record(z.string(), z.string()),
                expiresAt: z.string(),
              })
              .optional(),
            downloadUrl: z.string().optional(),
            downloadUrlExpiresAt: z.string().optional(),
          })
          .optional(),
      }),
    })
    .parse(JSON.parse(text) as unknown);
export async function fileFixture(overrides: Partial<Settings> = {}) {
  const settings = { ...getState().settings, RATE_LIMIT_GLOBAL: 600, ...overrides };
  const app = await createApp({ settings });
  const clients = storageClients(settings);
  const keys = new Set<string>();
  owned.push({ app, clients, keys, bucket: settings.S3_BUCKET });
  const unit = app.get(UnitOfWork);
  const identity = await unit.run(async (tx) => {
    const roles = new RolesRepository();
    await roles.seedRoles(tx);
    const user = await tx.user.create({
      data: { email: "files@example.com", emailVerifiedAt: new Date(), name: "파일 회원" },
    });
    await roles.assign(tx, user.id, ["member"]);
    const at = new Date();
    const session = await tx.session.create({
      data: {
        userId: user.id,
        authenticatedAt: at,
        lastUsedAt: at,
        expiresAt: new Date(at.getTime() + 3_600_000),
      },
    });
    return { userId: user.id, sessionId: session.id };
  });
  const token = await signAccessToken(identity, settings.JWT_SECRET);
  const http = request(app.getHttpServer());
  const create = async (size = 23, contentType = "image/png") => {
    const response = await http
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/vnd.api+json")
      .send({ data: { type: "files", attributes: { filename: "그림.png", contentType, size } } });
    if (response.status === 201) {
      const id = fileDocument(response.text).data.id;
      const stored = await unit.run((tx) => tx.file.findUniqueOrThrow({ where: { id } }));
      keys.add(stored.key);
    }
    return response;
  };
  return { app, http, unit, clients, settings, identity, token, create, keys };
}
