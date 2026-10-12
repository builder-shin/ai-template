import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, codes, newUser, PNG, problems, target, uploadFile } from "./support.ts";

describe(`파일 (${target.name})`, () => {
  it("만들면 pending이고, meta.upload에 스토리지로 보낼 PUT 요청이 있다", async () => {
    const user = await newUser();
    const { data, response } = await user.api.POST("/api/v1/files", {
      body: {
        data: {
          type: "files",
          attributes: { filename: "cat.png", contentType: "image/png", size: PNG.byteLength },
        },
      },
    });
    expect(response.status).toBe(201);
    expect(data?.data.attributes).toMatchObject({
      filename: "cat.png",
      contentType: "image/png",
      size: PNG.byteLength,
      status: "pending",
    });
    expect(data?.data.relationships.owner.data).toEqual({ type: "users", id: user.userId });
    expect(data?.data.meta?.upload).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });
    expect(data?.data.meta?.downloadUrl).toBeUndefined();
  });

  it("올리고 완료를 알리면 ready가 되고 downloadUrl로 내려받는다", async () => {
    const user = await newUser();
    const file = await uploadFile(user);
    expect(file.attributes.status).toBe("ready");
    expect(file.meta?.upload).toBeUndefined();
    const downloadUrl = file.meta?.downloadUrl;
    expect(downloadUrl).toBeDefined();
    const downloaded = await fetch(downloadUrl ?? "");
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(PNG);
    const current = await user.api.GET("/api/v1/files/{id}", {
      params: { path: { id: file.id } },
    });
    expect(current.data?.data.attributes.status).toBe("ready");
  });

  it("선언과 크기가 다른 본문은 스토리지가 받지 않고, 완료를 알리면 file.upload_incomplete다", async () => {
    const user = await newUser();
    const created = await user.api.POST("/api/v1/files", {
      body: {
        data: {
          type: "files",
          attributes: { filename: "cat.png", contentType: "image/png", size: PNG.byteLength },
        },
      },
    });
    const file = created.data?.data;
    const upload = file?.meta?.upload;
    expect(upload).toBeDefined();
    const larger = new Uint8Array(PNG.byteLength + 1);
    const put = await fetch(upload?.url ?? "", {
      method: "PUT",
      headers: upload?.headers ?? {},
      body: larger,
    });
    expect(put.ok).toBe(false);
    const id = file?.id ?? "";
    const completed = await user.api.PATCH("/api/v1/files/{id}", {
      params: { path: { id } },
      body: { data: { type: "files", id, attributes: { status: "ready" } } },
    });
    expect(completed.response.status).toBe(422);
    expect(codes(completed.error)).toEqual(["file.upload_incomplete"]);
  });

  it("허용하지 않는 타입과 한도를 넘는 크기는 만들지 않는다", async () => {
    const user = await newUser();
    const create = (contentType: string, size: number) =>
      user.api.POST("/api/v1/files", {
        body: { data: { type: "files", attributes: { filename: "x", contentType, size } } },
      });
    const pdf = await create("application/pdf", 10);
    expect(pdf.response.status).toBe(422);
    expect(problems(pdf.error)).toEqual([
      ["file.type_not_allowed", "/data/attributes/contentType"],
    ]);
    const huge = await create("image/png", 10 ** 12);
    expect(huge.response.status).toBe(422);
    expect(problems(huge.error)).toEqual([["file.too_large", "/data/attributes/size"]]);
    const params: Record<string, unknown> | undefined = huge.error?.errors[0]?.meta?.params;
    expect(typeof params?.max).toBe("number");
  });

  it("남의 파일은 보지도 고치지도 못하고, 소유자가 지우면 사라진다", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    const file = await uploadFile(owner);
    const path = { params: { path: { id: file.id } } };
    expect((await other.api.GET("/api/v1/files/{id}", path)).response.status).toBe(404);
    expect((await api().GET("/api/v1/files/{id}", path)).response.status).toBe(404);
    expect((await other.api.DELETE("/api/v1/files/{id}", path)).response.status).toBe(404);
    expect((await owner.api.DELETE("/api/v1/files/{id}", path)).response.status).toBe(204);
    expect((await owner.api.GET("/api/v1/files/{id}", path)).response.status).toBe(404);
    const missing = await owner.api.GET("/api/v1/files/{id}", {
      params: { path: { id: randomUUID() } },
    });
    expect(codes(missing.error)).toEqual(["resource.not_found"]);
  });
});
