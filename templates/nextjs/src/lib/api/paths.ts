import "server-only";
import type { paths } from "./schema";

/** baseUrl에 /api/v1을 두고 계약의 경로만 짧게 쓴다. */
export type ApiPaths = {
  [Path in keyof paths as Path extends `/api/v1${infer Relative}` ? Relative : never]: paths[Path];
};
