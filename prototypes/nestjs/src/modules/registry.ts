import { HEALTH_OPERATIONS } from "./health/index.js";
import { ROLES_OPERATIONS } from "./roles/index.js";
import { USERS_OPERATIONS } from "./users/index.js";
import { AUTH_OPERATIONS } from "./auth/index.js";
import { FILES_OPERATIONS } from "./files/index.js";
import { POSTS_OPERATIONS } from "./posts/index.js";
import { REALTIME_OPERATIONS } from "./realtime/index.js";
import type { INestApplicationContext } from "@nestjs/common";
import { FilesService } from "./files/index.js";
import { PostsService } from "./posts/index.js";
import { UsersService } from "./users/index.js";
import { EVENTS } from "../core/jsonapi/openapi/realtime.js";
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
export function registerDomain(app: INestApplicationContext): void {
  const files = app.get(FilesService),
    posts = app.get(PostsService),
    users = app.get(UsersService);
  files.addReadRule((tx, id, viewer) => posts.coverImageReadable(tx, id, viewer));
  files.addReferenceCheck((tx, ids) => posts.coverImageReferences(tx, ids));
  files.addReferenceCheck((tx, ids) => users.avatarReferences(tx, ids));
  users.setAvatarLoader((ids) => files.resources(ids));
  posts.registerEvents(EVENTS.filter((event) => event.name.startsWith("post.")));
}
