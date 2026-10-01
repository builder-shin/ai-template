"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError, toFormResult } from "../../lib/api/errors";
import type { components } from "../../lib/api/schema";
import { getPathname } from "../../lib/i18n/navigation";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { PostResult, PostValues } from "./state";

// gen:feature: 고칠 곳 — 새 계약의 API·JSON:API type·상태 전이·입력칸 오류를 맞춘다.
type Locale = "ko" | "en";
function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
function values(data: FormData): PostValues {
  return {
    title: text(data, "title"),
    body: text(data, "body"),
    ...(data.has("coverImage") ? { coverImage: text(data, "coverImage") } : {}),
  };
}
function relationships(input?: PostValues) {
  if (input?.coverImage === undefined) return {};
  return {
    relationships: {
      coverImage: {
        data: input.coverImage ? { type: "files" as const, id: input.coverImage } : null,
      },
    },
  };
}
function failure(error: unknown, locale: Locale, path: string, input?: PostValues): PostResult {
  redirectOnUnauthorized(error, getPathname({ locale, href: path }));
  if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
  return {
    ...toFormResult(error, locale, input ? ["title", "body"] : []),
    ...(input ? { values: input } : {}),
    ...(error.code === "post.invalid_transition" ? { invalidTransition: true } : {}), // gen:feature: 그대로
    ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
  };
}
function invalidate(id: string) {
  for (const locale of ["ko", "en"] as const) {
    for (const href of [
      "/posts",
      `/posts/${id}`,
      "/my-posts",
      `/my-posts/${id}/edit`,
      `/my-posts/${id}/delete`,
    ]) {
      revalidatePath(getPathname({ locale, href }));
    }
  }
}

export async function createPostAction(_state: PostResult, data: FormData): Promise<PostResult> {
  const locale = await getLocale();
  const input = values(data);
  const client = await createSessionApiClient({ locale });
  let id: string;
  try {
    const { data: document } = await client.POST("/posts", {
      body: {
        data: {
          type: "posts",
          attributes: { title: input.title, body: input.body, status: "draft" },
          ...relationships(input),
        },
      },
    });
    id = document!.data.id;
  } catch (error) {
    return failure(error, locale, "/my-posts/new", input);
  }
  invalidate(id);
  redirect(getPathname({ locale, href: `/my-posts/${id}/edit` }));
}

async function patchPost(
  id: string,
  attributes: components["schemas"]["PostUpdateAttributes"],
  input?: PostValues,
): Promise<PostResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  const href = `/my-posts/${id}/edit`;
  try {
    await client.PATCH("/posts/{id}", {
      params: { path: { id } },
      body: { data: { type: "posts", id, attributes, ...relationships(input) } },
    });
  } catch (error) {
    return failure(error, locale, href, input);
  }
  invalidate(id);
  redirect(getPathname({ locale, href }));
}

export async function updatePostAction(id: string, _state: PostResult, data: FormData) {
  const input = values(data);
  return patchPost(id, { title: input.title, body: input.body }, input);
}
export async function publishPostAction(id: string, _state: PostResult, _data: FormData) {
  return patchPost(id, { status: "published" });
}
export async function unpublishPostAction(id: string, _state: PostResult, _data: FormData) {
  return patchPost(id, { status: "draft" });
}
export async function deletePostAction(
  id: string,
  _state: PostResult,
  _data: FormData,
): Promise<PostResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    await client.DELETE("/posts/{id}", { params: { path: { id } } });
  } catch (error) {
    return failure(error, locale, `/my-posts/${id}/delete`);
  }
  invalidate(id);
  redirect(getPathname({ locale, href: "/my-posts" }));
}
