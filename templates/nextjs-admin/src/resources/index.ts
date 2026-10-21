import "server-only";
import type { AnyResource } from "../lib/resources/definition";
import postsResource from "./posts/resource";
import usersResource from "./users/resource";
import rolesResource from "./roles/resource";
import permissionsResource from "./permissions/resource";
import auditLogsResource from "./audit-logs/resource";

// 등록 순서가 메뉴 순서다. 리소스는 이 목록을 통해서만 화면에 공개한다.
export const resources: readonly AnyResource[] = [
  postsResource,
  usersResource,
  rolesResource,
  permissionsResource,
  auditLogsResource,
];
