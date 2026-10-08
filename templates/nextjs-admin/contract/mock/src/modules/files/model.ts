/**
 * 파일(FastAPI의 files 테이블). 행은 메타데이터이고, 객체는 가짜 스토리지의 files/<id> 키에 있다.
 *
 * - 만들면 pending이고 브라우저가 presigned URL로 직접 올린다. 소유자가 완료를 알리면 객체의 크기를
 *   확인하고 ready로 바꾼다.
 * - 다른 리소스(사용자의 아바타, 글의 커버 이미지)가 파일을 가리킨다. 파일을 지우면 그 관계는 null이
 *   된다(FastAPI의 외래 키 ON DELETE SET NULL. 목은 관계를 가진 모듈이 등록한 처리가 바꾼다,
 *   registry.ts).
 */

import type { Instant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";

/** pending: 업로드 URL만 발급됨. ready: 객체를 확인함. */
export type FileStatus = components["schemas"]["FileStatus"];

export interface FileRow {
  readonly id: string;
  readonly ownerId: string;
  readonly filename: string;
  readonly contentType: string;
  /** 만들 때 선언한 크기(바이트). */
  readonly size: number;
  status: FileStatus;
  readonly createdAt: Instant;
  updatedAt: Instant;
}

/** 스토리지의 객체 키. */
export function objectKey(fileId: string): string {
  return `files/${fileId}`;
}
