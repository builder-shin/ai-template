import { z } from "zod";
import type { createApiClient } from "../api/client";
import type { SessionManager } from "../session/manager";
import { ApiError } from "../api/errors";
import { DisplayError } from "../forms/errors";
import { validatePickedFile, validateStorage } from "./validate";
import type { PickedFile, FileResource } from "./types";
interface Options {
  release?: boolean;
  api: ReturnType<typeof createApiClient>;
  session: Pick<SessionManager, "generation" | "signal" | "credentials">;
  prepare(file: PickedFile): Promise<{ body: Blob | Uint8Array<ArrayBuffer>; size: number }>;
  put(url: string, input: RequestInit): Promise<Pick<Response, "ok" | "status">>;
}
export function createUploader({ api, session, prepare, put, release = false }: Options) {
  return {
    async uploadFile(file: PickedFile, options: { signal: AbortSignal }): Promise<FileResource> {
      validatePickedFile(file);
      if (!session.credentials()) throw new ApiError(401, [{ code: "auth.unauthenticated" }]);
      const generation = session.generation(),
        controller = new AbortController();
      const sources = [options.signal, session.signal()];
      const abort = () => controller.abort();
      for (const source of sources) {
        if (source.aborted) abort();
        else source.addEventListener("abort", abort, { once: true });
      }
      const signal = controller.signal;
      const check = () => {
        if (signal.aborted || generation !== session.generation())
          throw new DOMException("Upload cancelled.", "AbortError");
      };
      let pendingId: string | undefined;
      try {
        check();
        const prepared = await prepare(file);
        check();
        if (prepared.size !== file.size) throw new DisplayError("invalidImage");
        const created = await api.POST("/files", {
          body: {
            data: {
              type: "files",
              attributes: { filename: file.name, contentType: file.mimeType, size: file.size },
            },
          },
          signal,
        });
        check();
        const pending = created.data?.data;
        if (!pending || pending.type !== "files" || !z.uuid().safeParse(pending.id).success)
          throw new DisplayError("invalidUpload");
        pendingId = pending.id;
        if (pending.attributes?.status !== "pending") throw new DisplayError("invalidUpload");
        const upload = validateStorage(pending.meta?.upload, file, release);
        let response: Pick<Response, "ok" | "status">;
        try {
          response = await put(upload.url, {
            method: "PUT",
            headers: upload.headers,
            body: prepared.body,
            signal,
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
          });
        } catch {
          check();
          throw new DisplayError("storageUnavailable");
        }
        check();
        if (!response.ok) throw new DisplayError("uploadFailed");
        const completed = await api.PATCH("/files/{id}", {
          params: { path: { id: pendingId } },
          body: { data: { type: "files", id: pendingId, attributes: { status: "ready" } } },
          signal,
        });
        check();
        const ready = completed.data?.data;
        if (
          !ready ||
          ready.type !== "files" ||
          ready.id !== pendingId ||
          ready.attributes?.status !== "ready" ||
          ready.attributes.size !== file.size ||
          ready.attributes.contentType !== file.mimeType
        )
          throw new DisplayError("invalidUpload");
        return ready;
      } catch (error) {
        if (pendingId && generation === session.generation() && session.credentials()) {
          // Best effort within the same identity; never reuse a previous account's token for cleanup.
          await api
            .DELETE("/files/{id}", {
              params: { path: { id: pendingId } },
              signal: AbortSignal.timeout(10000),
            })
            .catch(() => undefined);
        }
        check();
        throw error;
      } finally {
        for (const source of sources) source.removeEventListener("abort", abort);
      }
    },
  };
}
