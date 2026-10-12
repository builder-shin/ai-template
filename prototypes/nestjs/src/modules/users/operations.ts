import { defineOperation, COMMON_ERRORS, AUTH_ERRORS } from "../../core/jsonapi/operation.js";
import { UserMeDocument } from "./schemas.js";
export const Me_get = defineOperation({
  interface: "Me",
  name: "get",
  method: "GET",
  path: "/api/v1/me",
  tag: "me",
  auth: "required",
  errors: [COMMON_ERRORS, AUTH_ERRORS],
  query: { include: ["roles", "avatar"], fields: ["users", "roles", "files"] },
  responses: [{ status: 200, schema: UserMeDocument }],
});
export const USERS_OPERATIONS = [Me_get];
