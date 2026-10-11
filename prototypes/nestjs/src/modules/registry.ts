import { HEALTH_OPERATIONS } from "./health/index.js";
import { ROLES_OPERATIONS } from "./roles/index.js";
import { USERS_OPERATIONS } from "./users/index.js";
import { AUTH_OPERATIONS } from "./auth/index.js";
import { FILES_OPERATIONS } from "./files/index.js";
import { POSTS_OPERATIONS } from "./posts/index.js";
import { REALTIME_OPERATIONS } from "./realtime/index.js";
export { CHANNELS, EVENTS, MESSAGES } from "../core/jsonapi/openapi/realtime.js";
export const OPERATIONS = [
  ...HEALTH_OPERATIONS,
  ...ROLES_OPERATIONS,
  ...USERS_OPERATIONS,
  ...AUTH_OPERATIONS,
  ...FILES_OPERATIONS,
  ...POSTS_OPERATIONS,
  ...REALTIME_OPERATIONS,
];
