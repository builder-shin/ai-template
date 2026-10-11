import {
  defineOperation,
  COMMON_ERRORS,
  BODY_ERRORS,
  AUTH_ERRORS,
  CREATE_ERRORS,
} from "../../core/jsonapi/operation.js";
import {
  RegistrationCreateDocument,
  RegistrationDocument,
  EmailVerificationRequestCreateDocument,
  EmailVerificationCreateDocument,
  EmailVerificationDocument,
  SessionCreateDocument,
  SessionWithTokensDocument,
} from "./schemas.js";
export const Registrations_create = defineOperation({
  interface: "Registrations",
  name: "create",
  method: "POST",
  path: "/api/v1/registrations",
  tag: "registrations",
  auth: "none",
  errors: [COMMON_ERRORS, BODY_ERRORS, CREATE_ERRORS],
  body: RegistrationCreateDocument,
  responses: [{ status: 201, schema: RegistrationDocument }],
});
export const EmailVerificationRequests_create = defineOperation({
  interface: "EmailVerificationRequests",
  name: "create",
  method: "POST",
  path: "/api/v1/email-verification-requests",
  tag: "email-verifications",
  auth: "none",
  errors: [COMMON_ERRORS, BODY_ERRORS, CREATE_ERRORS],
  body: EmailVerificationRequestCreateDocument,
  responses: [{ status: 202 }],
});
export const EmailVerifications_create = defineOperation({
  interface: "EmailVerifications",
  name: "create",
  method: "POST",
  path: "/api/v1/email-verifications",
  tag: "email-verifications",
  auth: "none",
  errors: [COMMON_ERRORS, BODY_ERRORS, CREATE_ERRORS],
  body: EmailVerificationCreateDocument,
  responses: [{ status: 201, schema: EmailVerificationDocument }],
});
export const Sessions_create = defineOperation({
  interface: "Sessions",
  name: "create",
  method: "POST",
  path: "/api/v1/sessions",
  tag: "sessions",
  auth: "none",
  errors: [COMMON_ERRORS, BODY_ERRORS, CREATE_ERRORS, [401]],
  body: SessionCreateDocument,
  responses: [{ status: 201, schema: SessionWithTokensDocument }],
});
export const Sessions_deleteCurrent = defineOperation({
  interface: "Sessions",
  name: "deleteCurrent",
  method: "DELETE",
  path: "/api/v1/sessions/current",
  tag: "sessions",
  auth: "required",
  errors: [COMMON_ERRORS, AUTH_ERRORS],
  responses: [{ status: 204 }],
});
export const AUTH_OPERATIONS = [
  Registrations_create,
  EmailVerificationRequests_create,
  EmailVerifications_create,
  Sessions_create,
  Sessions_deleteCurrent,
];
