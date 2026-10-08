import "server-only";
import type { AnyResource } from "../lib/resources/definition";

// 등록 순서가 메뉴 순서다. 리소스는 이 목록을 통해서만 화면에 공개한다.
export const resources: readonly AnyResource[] = [];
