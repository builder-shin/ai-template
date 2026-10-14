import { z } from "zod";
import { meFixture } from "./me-fixture.js";
import { mediaType } from "./session-fixture.js";
export const resourceDocument = (text: string) =>
  z
    .object({
      data: z.object({
        type: z.string(),
        id: z.string(),
        attributes: z.record(z.string(), z.unknown()),
        relationships: z.record(z.string(), z.unknown()).optional(),
      }),
      included: z
        .array(
          z.object({
            type: z.string(),
            id: z.string(),
            attributes: z.record(z.string(), z.unknown()),
          }),
        )
        .optional(),
    })
    .parse(JSON.parse(text) as unknown);
export const collection = (text: string) =>
  z
    .object({
      data: z.array(
        z.object({
          type: z.string(),
          id: z.string(),
          attributes: z.record(z.string(), z.unknown()),
        }),
      ),
      included: z
        .array(
          z.object({
            type: z.string(),
            id: z.string(),
            attributes: z.record(z.string(), z.unknown()),
          }),
        )
        .optional(),
      meta: z.object({ page: z.object({ total: z.number() }) }),
      links: z.object({ next: z.string().nullable() }),
    })
    .parse(JSON.parse(text) as unknown);
export async function adminFixture() {
  const f = await meFixture("admin");
  const token = f.session.attributes.accessToken;
  const post = (type: string, attributes: object, access = token) =>
    f.http
      .post("/api/v1/" + type)
      .set("Authorization", "Bearer " + access)
      .set("Content-Type", mediaType)
      .send({ data: { type, attributes } });
  const patch = (type: string, id: string, data: object, access = token) =>
    f.http
      .patch("/api/v1/" + type + "/" + id)
      .set("Authorization", "Bearer " + access)
      .set("Content-Type", mediaType)
      .send({ data: { type, id, ...data } });
  const get = (path: string, access = token) =>
    f.http.get("/api/v1/" + path).set("Authorization", "Bearer " + access);
  return { ...f, token, post, patch, get };
}
