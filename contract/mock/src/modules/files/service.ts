/**
 * 파일의 유스케이스와 다른 모듈이 쓰는 파일 함수(FastAPI의 files/service.py).
 *
 * - 업로드: 만들면 pending이고 meta.upload에 presigned PUT(15분)을 준다. 브라우저가 올린 뒤 소유자가
 *   status를 ready로 보내면, 객체의 크기를 선언과 비교해 ready로 바꾼다. 객체가 없거나 크기가 다르면
 *   422 file.upload_incomplete이고, 크기가 다른 객체는 지운다.
 * - 만들기는 크기(file.too_large), 타입(file.type_not_allowed), 사용자별 한도(file.quota_exceeded, 가진
 *   파일 크기의 합) 순서로 검사한다. FastAPI는 한도 검사를 사용자별 advisory lock으로 줄 세운다. 목은
 *   검사와 만들기 사이에 await가 없어 다른 요청이 끼어들지 못한다.
 * - 읽기: 소유자, 또는 등록된 읽기 규칙 하나라도 허용하는 사람(registry.ts). 그 밖에는 파일이 있는지도
 *   알리지 않고 404다. 쓰기(PATCH, 삭제)는 소유자만 한다. 읽을 수 있지만 소유자가 아니면 403이다.
 *   고칠 속성이 없는 PATCH도 같다.
 * - 다른 리소스에 거는 파일(아바타, 커버 이미지)은 요청한 사람 소유의 ready 이미지여야 한다
 *   (attachableFile). 남의 파일을 걸면 그 리소스를 보는 모든 사람에게 파일이 공개되기 때문이다.
 * - 지우기는 행과 객체를 함께 지운다(FastAPI는 행을 commit한 뒤 객체를 지운다). 가리키던 관계는
 *   등록된 삭제 처리가 null로 바꾼다.
 * - 관계에서 풀린 파일(release)과 탈퇴한 사용자의 파일(removeUnreferenced)은 다른 리소스가 가리키지
 *   않으면 지운다. 24시간이 넘도록 pending인 파일은 purgePending이 지운다(FastAPI는 잡이 매시간
 *   부른다. 목에는 스케줄러가 없어 부르는 쪽이 정한다).
 */

import type { MockConfig } from "../../config.ts";
import type { Principal } from "../../core/access.ts";
import { HOUR, MINUTE } from "../../core/clock.ts";
import { parseUuid, uuid7 } from "../../core/ids.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import type { PresignedRequest } from "../../storage/bucket.ts";
import { type FileRow, objectKey } from "./model.ts";

type FileCreateAttributes = components["schemas"]["FileCreateAttributes"];

/** presigned PUT의 수명. */
export const UPLOAD_EXPIRES = 15 * MINUTE;
/** 이보다 오래 pending인 파일은 purgePending이 지운다. */
export const PENDING_TTL = 24 * HOUR;

function notFound(fileId: string): ApiError {
  return new ApiError(404, "resource.not_found", `File ${fileId} does not exist.`);
}

/** 소유자이거나 등록된 읽기 규칙 하나라도 허용하면 읽는다. */
export function canRead(state: MockState, file: FileRow, viewer: Principal | undefined): boolean {
  if (viewer?.userId === file.ownerId) return true;
  return state.fileRegistry.readRules.some((rule) => rule(state.store, file.id, viewer));
}

/** 읽을 수 있는 파일. 없거나 읽을 수 없으면 404다. */
export function readableFile(
  state: MockState,
  fileId: string,
  viewer: Principal | undefined,
): FileRow {
  const file = state.store.files.get(fileId);
  if (file === undefined || !canRead(state, file, viewer)) throw notFound(fileId);
  return file;
}

/** 고칠 수 있는 파일: 읽을 수 없으면 404, 읽을 수 있지만 소유자가 아니면 403이다. */
function ownedFile(state: MockState, fileId: string, actor: Principal): FileRow {
  const file = readableFile(state, fileId, actor);
  if (file.ownerId !== actor.userId) {
    throw new ApiError(403, "permission.denied", "Only the owner can change this file.");
  }
  return file;
}

/** 사용자가 가진 파일(pending과 ready)의 선언 크기 합. */
function storedBytes(state: MockState, ownerId: string): number {
  let total = 0;
  for (const file of state.store.files.values()) {
    if (file.ownerId === ownerId) total += file.size;
  }
  return total;
}

/** 크기, 타입, 사용자별 한도를 이 순서로 검사한다. 먼저 걸린 하나만 알린다. */
function checkUpload(
  state: MockState,
  config: MockConfig,
  actor: Principal,
  attributes: FileCreateAttributes,
): void {
  const { maxSize, allowedTypes, userQuota } = config.files;
  const { size, contentType: type } = attributes;
  if (size > maxSize) {
    const detail = `A file can be at most ${String(maxSize)} bytes.`;
    const options = { pointer: "/data/attributes/size", params: { max: maxSize } };
    throw new ApiError(422, "file.too_large", detail, options);
  }
  if (!allowedTypes.includes(type)) {
    const allowed = allowedTypes.join(", ");
    const options = { pointer: "/data/attributes/contentType", params: { allowed } };
    throw new ApiError(422, "file.type_not_allowed", `Allowed types are ${allowed}.`, options);
  }
  if (storedBytes(state, actor.userId) + size > userQuota) {
    const detail = `The files of one user can take at most ${String(userQuota)} bytes.`;
    const options = { pointer: "/data/attributes/size", params: { quota: userQuota } };
    throw new ApiError(422, "file.quota_exceeded", detail, options);
  }
}

/** 검사를 마친 뒤 pending 파일과 업로드 URL을 만든다. */
export function createFile(
  state: MockState,
  config: MockConfig,
  actor: Principal,
  attributes: FileCreateAttributes,
): { readonly file: FileRow; readonly upload: PresignedRequest } {
  checkUpload(state, config, actor, attributes);
  const { filename, contentType, size } = attributes;
  const now = state.clock.now();
  const file: FileRow = {
    id: uuid7(),
    ownerId: actor.userId,
    filename,
    contentType,
    size,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  state.store.files.set(file.id, file);
  const key = objectKey(file.id);
  const upload = state.storage.presignUpload(config.apiUrl, key, file, UPLOAD_EXPIRES);
  return { file, upload };
}

/**
 * 파일을 고친다(PATCH). 속성을 보기 전에 소유자인지 본다. ready면 업로드를 확인하고 ready로 바꾼다.
 * 이미 ready면 그대로 돌려준다.
 */
export function updateFile(
  state: MockState,
  actor: Principal,
  fileId: string,
  ready: boolean,
): FileRow {
  const file = ownedFile(state, fileId, actor);
  if (!ready || file.status === "ready") return file;
  const key = objectKey(file.id);
  const size = state.storage.size(key);
  if (size !== file.size) {
    let detail = "The object has not been uploaded.";
    if (size !== undefined) {
      state.storage.delete(key);
      detail = `The uploaded object has ${String(size)} bytes, not the declared ${String(file.size)}.`;
    }
    throw new ApiError(422, "file.upload_incomplete", detail);
  }
  file.status = "ready";
  file.updatedAt = state.clock.now();
  return file;
}

/** 파일들의 행과 객체를 지운다. 먼저 등록된 삭제 처리가 가리키던 관계를 null로 바꾼다. */
function removeFiles(state: MockState, files: readonly FileRow[]): void {
  if (files.length === 0) return;
  const ids = files.map((file) => file.id);
  for (const handler of state.fileRegistry.deleteHandlers) handler(state.store, ids);
  for (const file of files) {
    state.store.files.delete(file.id);
    state.storage.delete(objectKey(file.id));
  }
}

/** 소유자가 파일을 지운다. */
export function deleteFile(state: MockState, actor: Principal, fileId: string): void {
  removeFiles(state, [ownedFile(state, fileId, actor)]);
}

/** candidates 가운데 어떤 리소스도 가리키지 않는 파일을 지우고 그 id를 돌려준다. */
function removeLoose(state: MockState, candidates: readonly FileRow[]): string[] {
  const ids = candidates.map((file) => file.id);
  const referenced = new Set<string>();
  for (const check of state.fileRegistry.referenceChecks) {
    for (const id of check(state.store, ids)) referenced.add(id);
  }
  const loose = candidates.filter((file) => !referenced.has(file.id));
  removeFiles(state, loose);
  return loose.map((file) => file.id);
}

/** 소유자의 파일 가운데 어떤 리소스도 가리키지 않는 것을 지우고 그 id를 돌려준다(탈퇴). */
export function removeUnreferenced(state: MockState, ownerId: string): string[] {
  const owned = [...state.store.files.values()].filter((file) => file.ownerId === ownerId);
  return removeLoose(state, owned);
}

/**
 * 관계에서 풀린 파일을 다른 리소스가 가리키지 않으면 지우고 그 id를 돌려준다. 파일을 가리키던
 * 리소스를 바꾸거나 지운 뒤에 부른다(null은 건너뛴다). 소유자가 탈퇴했어도 같다.
 */
export function release(state: MockState, fileIds: Iterable<string | null>): string[] {
  const ids = new Set<string>();
  for (const id of fileIds) if (id !== null) ids.add(id);
  const candidates = [...ids].sort(compareText).flatMap((id) => state.store.files.get(id) ?? []);
  return removeLoose(state, candidates);
}

/** PENDING_TTL보다 오래 pending인 파일(행과 객체)을 지우고 그 수를 돌려준다(FastAPI의 잡). */
export function purgePending(state: MockState): number {
  const cutoff = state.clock.now() - PENDING_TTL;
  const stale = [...state.store.files.values()].filter(
    (file) => file.status === "pending" && file.createdAt < cutoff,
  );
  removeFiles(state, stale);
  return stale.length;
}

/**
 * 다른 리소스에 걸 파일: 요청한 사람 소유의 ready 이미지. pointer는 관계의 data다. 없거나 남의 파일이면
 * 404, 아직 올리지 않았으면 422 file.upload_incomplete, 이미지가 아니면 422 file.type_not_allowed다.
 */
export function attachableFile(
  state: MockState,
  actor: Principal,
  fileId: string,
  pointer: string,
): FileRow {
  const id = parseUuid(fileId);
  const file = id === undefined ? undefined : state.store.files.get(id);
  if (file?.ownerId !== actor.userId) {
    const detail = `File ${fileId} does not exist or is not yours.`;
    throw new ApiError(404, "resource.not_found", detail, { pointer });
  }
  if (file.status !== "ready") {
    const detail = "The file has not been uploaded yet.";
    throw new ApiError(422, "file.upload_incomplete", detail, { pointer });
  }
  if (!file.contentType.startsWith("image/")) {
    const options = { pointer, params: { allowed: "image/*" } };
    throw new ApiError(422, "file.type_not_allowed", "Only images can be used here.", options);
  }
  return file;
}
