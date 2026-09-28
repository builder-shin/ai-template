import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  api,
  codes,
  newUser,
  PASSWORD,
  problems,
  register,
  target,
  uploadFile,
} from "./support.ts";

describe(`내 정보 (${target.name})`, () => {
  it("내 계정, 역할, 실제 권한을 본다", async () => {
    const user = await newUser();
    const { data, response } = await user.api.GET("/api/v1/me", {
      params: { query: { include: "roles" } },
    });
    expect(response.status).toBe(200);
    expect(data?.data).toMatchObject({
      type: "users",
      id: user.userId,
      attributes: { email: user.email, status: "active" },
    });
    const roles = (data?.included ?? []).map((resource) =>
      resource.type === "roles" ? resource.attributes.name : resource.type,
    );
    expect(roles).toEqual(["member"]);
    expect(data?.meta.permissions).toEqual(["posts:create"]);
  });

  it("이름과 로케일을 바꾼다", async () => {
    const user = await newUser();
    const { data, response } = await user.api.PATCH("/api/v1/me", {
      body: {
        data: { type: "users", id: user.userId, attributes: { name: "새 이름", locale: "en" } },
      },
    });
    expect(response.status).toBe(200);
    expect(data?.data.attributes).toMatchObject({ name: "새 이름", locale: "en" });
  });

  it("본문의 id가 나와 다르거나 없는 파일을 아바타로 주면 바꾸지 않는다", async () => {
    const user = await newUser();
    const mismatch = await user.api.PATCH("/api/v1/me", {
      body: { data: { type: "users", id: randomUUID(), attributes: { name: "남" } } },
    });
    expect(mismatch.response.status).toBe(409);
    expect(problems(mismatch.error)).toEqual([["resource.conflict", "/data/id"]]);
    const avatar = await user.api.PATCH("/api/v1/me", {
      body: {
        data: {
          type: "users",
          id: user.userId,
          relationships: { avatar: { data: { type: "files", id: randomUUID() } } },
        },
      },
    });
    expect(avatar.response.status).toBe(404);
    expect(problems(avatar.error)).toEqual([
      ["resource.not_found", "/data/relationships/avatar/data"],
    ]);
  });

  it("올린 이미지를 아바타로 걸면 누구나 읽고, 탈퇴하면 그 파일도 지워진다", async () => {
    const [user, other] = await Promise.all([newUser(), newUser()]);
    const image = await uploadFile(user);
    const avatar = { data: { type: "files" as const, id: image.id } };
    const updated = await user.api.PATCH("/api/v1/me", {
      body: { data: { type: "users", id: user.userId, relationships: { avatar } } },
    });
    expect(updated.response.status).toBe(200);
    expect(updated.data?.data.relationships.avatar.data).toEqual(avatar.data);
    const mine = await user.api.GET("/api/v1/me", { params: { query: { include: "avatar" } } });
    const included = (mine.data?.included ?? []).find((resource) => resource.type === "files");
    expect(included?.id).toBe(image.id);
    expect(included?.type === "files" ? included.meta?.downloadUrl : undefined).toBeDefined();
    // 아바타는 누구나 읽지만, 고치고 지우는 것은 소유자만 한다.
    const path = { params: { path: { id: image.id } } };
    expect((await api().GET("/api/v1/files/{id}", path)).response.status).toBe(200);
    const removed = await other.api.DELETE("/api/v1/files/{id}", path);
    expect(removed.response.status).toBe(403);
    expect(codes(removed.error)).toEqual(["permission.denied"]);
    // 탈퇴하면 다른 리소스가 가리키지 않는 내 파일을 지운다(아바타 포함).
    expect((await user.api.DELETE("/api/v1/me")).response.status).toBe(204);
    expect((await other.api.GET("/api/v1/files/{id}", path)).response.status).toBe(404);
  });

  it("아바타는 내가 올리고 업로드를 마친 파일이어야 한다", async () => {
    const [user, other] = await Promise.all([newUser(), newUser()]);
    const setAvatar = (id: string) =>
      user.api.PATCH("/api/v1/me", {
        body: {
          data: {
            type: "users",
            id: user.userId,
            relationships: { avatar: { data: { type: "files", id } } },
          },
        },
      });
    const pending = await uploadFile(user, { complete: false });
    const incomplete = await setAvatar(pending.id);
    expect(incomplete.response.status).toBe(422);
    expect(problems(incomplete.error)).toEqual([
      ["file.upload_incomplete", "/data/relationships/avatar/data"],
    ]);
    const theirs = await uploadFile(other);
    const foreign = await setAvatar(theirs.id);
    expect(foreign.response.status).toBe(404);
    expect(problems(foreign.error)).toEqual([
      ["resource.not_found", "/data/relationships/avatar/data"],
    ]);
  });

  it("탈퇴하면 세션이 끝나고 로그인하지 못하며, 같은 이메일로 다시 가입할 수 있다", async () => {
    const user = await newUser();
    expect((await user.api.DELETE("/api/v1/me")).response.status).toBe(204);
    expect((await user.api.GET("/api/v1/me")).response.status).toBe(401);
    const { error } = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: user.email, password: PASSWORD },
        },
      },
    });
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
    await register(user.email);
  });

  it("로그인하지 않으면 내 정보를 보지 못한다", async () => {
    const { error, response } = await api().GET("/api/v1/me");
    expect(response.status).toBe(401);
    expect(codes(error)).toEqual(["auth.unauthenticated"]);
  });
});
