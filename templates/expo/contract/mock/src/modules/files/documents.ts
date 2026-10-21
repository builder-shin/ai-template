/**
 * 파일 리소스(FastAPI의 files.service의 file_resource, file_resources). 파일 API와 다른 모듈의 포함
 * 리소스(사용자의 아바타, 글의 커버 이미지)가 함께 쓴다.
 *
 * - meta.upload: POST /files 응답에만 있다(presigned PUT, 15분).
 * - meta.downloadUrl, downloadUrlExpiresAt: ready인 파일에만 있다(presigned GET, 10분). 리소스를 만들
 *   때마다 새로 서명한다. 포함 리소스에도 채운다.
 * - 둘 다 없으면 meta를 넣지 않는다.
 */

import type { MockConfig } from "../../config.ts";
import { formatInstant, MINUTE } from "../../core/clock.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import type { MockState } from "../../state.ts";
import type { PresignedRequest } from "../../storage/bucket.ts";
import { type FileRow, objectKey } from "./model.ts";

type Schemas = components["schemas"];
/** 파일 리소스(계약의 FileResource). meta.upload는 createdFileResource만 담는다. */
export type FileResource = Schemas["FileResource"];
/** 계약의 FileUpload에서 headers의 값만 넓힌다(생성 타입은 값을 never로 적는다). */
type FileUpload = Omit<Schemas["FileUpload"], "headers"> & { headers: Record<string, string> };
/** POST /files 응답의 파일 리소스: meta.upload가 있다. */
export type CreatedFileResource = Omit<FileResource, "meta"> & {
  meta: Omit<Schemas["FileMeta"], "upload"> & { upload: FileUpload };
};

/** presigned GET의 수명. */
export const DOWNLOAD_EXPIRES = 10 * MINUTE;

/** 파일 리소스. ready면 meta에 새로 서명한 downloadUrl을 담는다. */
export function fileResource(state: MockState, config: MockConfig, file: FileRow): FileResource {
  const resource: FileResource = {
    type: "files",
    id: file.id,
    attributes: {
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      status: file.status,
      createdAt: formatInstant(file.createdAt),
    },
    relationships: { owner: { data: { type: "users", id: file.ownerId } } },
  };
  if (file.status !== "ready") return resource;
  const key = objectKey(file.id);
  const download = state.storage.presignDownload(config.apiUrl, key, DOWNLOAD_EXPIRES);
  const meta = {
    downloadUrl: download.url,
    downloadUrlExpiresAt: formatInstant(download.expiresAt),
  };
  return { ...resource, meta };
}

/** 방금 만든 파일의 리소스. meta.upload에 스토리지로 보낼 presigned PUT 요청을 담는다. */
export function createdFileResource(
  state: MockState,
  config: MockConfig,
  file: FileRow,
  upload: PresignedRequest,
): CreatedFileResource {
  const resource = fileResource(state, config, file);
  const request: FileUpload = {
    url: upload.url,
    method: "PUT",
    headers: { ...upload.headers },
    expiresAt: formatInstant(upload.expiresAt),
  };
  return { ...resource, meta: { upload: request, ...resource.meta } };
}

/**
 * 포함 리소스(아바타, 커버 이미지)용 파일 리소스. id 순이고, 겹치는 id는 한 번, 없는 id는 건너뛴다.
 * 부모 리소스를 볼 수 있으면 그 파일도 볼 수 있으므로 읽기 규칙을 보지 않는다.
 */
export function fileResources(
  state: MockState,
  config: MockConfig,
  fileIds: Iterable<string>,
): FileResource[] {
  return [...new Set(fileIds)].sort(compareText).flatMap((id) => {
    const file = state.store.files.get(id);
    return file === undefined ? [] : [fileResource(state, config, file)];
  });
}
