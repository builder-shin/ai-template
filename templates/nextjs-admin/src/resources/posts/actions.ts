import "server-only";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "../../lib/admin/account";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError, toFormResult, type FormResult } from "../../lib/api/errors";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { ResourceAction } from "../../lib/resources/definition";

async function changeStatus(
  id: string,
  status: "draft" | "published",
): Promise<FormResult & { retryAfter?: number | null }> {
  const locale = await getLocale();
  try {
    const account = await requireAdmin(locale);
    if (!account.permissions.includes("posts:manage"))
      throw new ApiError({
        status: 403,
        errors: [{ code: "permission.denied", params: {} }],
        traceId: "",
      });
    const client = await createSessionApiClient({ locale });
    const current = await client.GET("/posts/{id}", { params: { path: { id } } });
    if (current.data!.data.attributes.status === status)
      throw new ApiError({
        status: 409,
        errors: [{ code: "resource.conflict", params: {} }],
        traceId: "",
      });
    await client.PATCH("/posts/{id}", {
      params: { path: { id } },
      body: { data: { type: "posts", id, attributes: { status } } },
    });
    return { ok: true };
  } catch (error) {
    redirectOnUnauthorized(error, locale === "en" ? "/en/posts" : "/posts");
    if (!(error instanceof ApiError)) throw error;
    return { ...toFormResult(error, locale), retryAfter: error.retryAfter };
  }
}
async function publishPost(id: string) {
  "use server";
  return changeStatus(id, "published");
}
async function unpublishPost(id: string) {
  "use server";
  return changeStatus(id, "draft");
}
export const publish: ResourceAction<"posts"> = {
  name: "publish",
  permission: "posts:manage",
  visible: (record) => record.attributes.status === "draft",
  action: publishPost,
};
export const unpublish: ResourceAction<"posts"> = {
  name: "unpublish",
  permission: "posts:manage",
  visible: (record) => record.attributes.status === "published",
  action: unpublishPost,
};
