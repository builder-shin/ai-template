"use server";

import "server-only";
import { getLocale } from "next-intl/server";
import { ApiError, toFormResult } from "../../lib/api/errors";
import { createSessionApiClient } from "../../lib/api/session-client";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { CreateFileResult, ReadyFileResult, UploadFailure } from "./state";

function failure(error: unknown, locale: "ko" | "en", returnTo: string): UploadFailure {
  redirectOnUnauthorized(error, returnTo);
  if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
  return {
    ...toFormResult(error, locale, ["filename", "contentType", "size"]),
    ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
  };
}
function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** 파일 본문은 받지 않는다. 브라우저가 presigned URL로 직접 보낸다. */
export async function createFileAction(
  data: FormData,
  returnTo: string,
): Promise<CreateFileResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    const { data: document } = await client.POST("/files", {
      body: {
        data: {
          type: "files",
          attributes: {
            filename: text(data, "filename"),
            contentType: text(data, "contentType"),
            size: Number(text(data, "size")),
          },
        },
      },
    });
    const upload = document?.data.meta?.upload;
    if (!document || !upload) throw new Error("업로드 정보가 없다.");
    return { ok: true, id: document.data.id, upload };
  } catch (error) {
    return failure(error, locale, returnTo);
  }
}

export async function readyFileAction(id: string, returnTo: string): Promise<ReadyFileResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    const { data: document } = await client.PATCH("/files/{id}", {
      params: { path: { id } },
      body: { data: { type: "files", id, attributes: { status: "ready" } } },
    });
    const url = document?.data.meta?.downloadUrl;
    if (!document || document.data.attributes.status !== "ready" || !url)
      throw new Error("완료된 파일 정보가 없다.");
    return { ok: true, file: { id: document.data.id, url } };
  } catch (error) {
    return failure(error, locale, returnTo);
  }
}
