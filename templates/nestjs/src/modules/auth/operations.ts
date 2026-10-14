import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger } from "../../core/jsonapi/schemas.js";
import { uuidString } from "../../core/jsonapi/schemas.js";
import { z } from "zod";
import {
  registrationCreateDocumentSchema,
  emailVerificationRequestCreateDocumentSchema,
  emailVerificationCreateDocumentSchema,
  sessionCreateDocumentSchema,
  sessionRevocationCreateDocumentSchema,
} from "./schemas.js";
const failure = { schema: "ErrorDocument", description: "요청에 실패했다" };
const failures = {
  400: failure,
  403: failure,
  406: failure,
  409: failure,
  413: failure,
  415: failure,
  422: failure,
  429: {
    ...failure,
    headers: { "Retry-After": { required: true, schema: jsonInteger({ format: "int32" }) } },
  },
  500: failure,
  503: failure,
};
const errors = [
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.not_acceptable",
  "jsonapi.unsupported_media_type",
  "jsonapi.content_too_large",
  "validation.required",
  "validation.invalid_format",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_choice",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
] as const;
export const createRegistration = defineOperation({
  operationId: "Registrations_create",
  method: "POST",
  path: "/api/v1/registrations",
  tags: ["registrations"],
  summary: "가입하고 인증 메일을 보낸다",
  auth: "none",
  body: registrationCreateDocumentSchema,
  responses: { 201: { schema: "RegistrationDocument", description: "가입했다" }, ...failures },
  errors: [...errors, "validation.already_taken"],
});
export const requestEmailVerification = defineOperation({
  operationId: "EmailVerificationRequests_create",
  method: "POST",
  path: "/api/v1/email-verification-requests",
  tags: ["email-verifications"],
  summary: "계정 유무와 관계없이 인증 메일 재발송을 요청한다",
  auth: "none",
  body: emailVerificationRequestCreateDocumentSchema,
  responses: { 202: { description: "요청을 받았다" }, ...failures },
  errors,
});
export const createEmailVerification = defineOperation({
  operationId: "EmailVerifications_create",
  method: "POST",
  path: "/api/v1/email-verifications",
  tags: ["email-verifications"],
  summary: "이메일 인증 토큰을 한 번 소비한다",
  auth: "none",
  body: emailVerificationCreateDocumentSchema,
  responses: {
    201: { schema: "EmailVerificationDocument", description: "이메일을 인증했다" },
    ...failures,
  },
  errors: [...errors, "auth.verification_token_invalid"],
});
const authErrors = [
  "auth.unauthenticated",
  "auth.token_invalid",
  "auth.token_expired",
  "permission.denied",
] as const;
const authFailures = {
  400: failure,
  401: failure,
  403: failure,
  406: failure,
  429: failures[429],
  500: failure,
  503: failure,
};
export const createSession = defineOperation({
  operationId: "Sessions_create",
  method: "POST",
  path: "/api/v1/sessions",
  tags: ["sessions"],
  summary: "로그인하고 토큰을 발급한다",
  auth: "none",
  body: sessionCreateDocumentSchema,
  responses: {
    201: { schema: "SessionWithTokensDocument", description: "세션과 토큰을 만들었다" },
    ...failures,
    401: failure,
  },
  errors: [
    ...errors,
    ...authErrors,
    "auth.invalid_credentials",
    "auth.email_not_verified",
    "auth.account_deactivated",
    "auth.refresh_token_reused",
  ],
});
export const listSessions = defineOperation({
  operationId: "Sessions_list",
  method: "GET",
  path: "/api/v1/sessions",
  tags: ["sessions"],
  summary: "내 활성 세션을 조회한다",
  auth: "required",
  query: {
    sort: ["createdAt", "lastUsedAt"],
    defaultSort: "-createdAt",
    fields: { sessions: ["userAgent", "createdAt", "lastUsedAt", "current", "user"] },
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "SessionCollectionDocument", description: "세션 목록이다" },
    ...authFailures,
  },
  errors: [...errors, ...authErrors, "jsonapi.unsupported_sort"],
});
export const deleteCurrentSession = defineOperation({
  operationId: "Sessions_deleteCurrent",
  method: "DELETE",
  path: "/api/v1/sessions/current",
  tags: ["sessions"],
  summary: "현재 세션을 폐기한다",
  auth: "required",
  overlaps: ["Sessions_delete"],
  responses: { 204: { description: "세션을 폐기했다" }, ...authFailures },
  errors: [...errors, ...authErrors],
});
export const deleteSession = defineOperation({
  operationId: "Sessions_delete",
  method: "DELETE",
  path: "/api/v1/sessions/{id}",
  tags: ["sessions"],
  summary: "내 세션 하나를 폐기한다",
  auth: "required",
  params: z.object({ id: uuidString() }),
  responses: { 204: { description: "세션을 폐기했다" }, ...authFailures, 404: failure },
  errors: [...errors, ...authErrors, "resource.not_found"],
});
export const createSessionRevocation = defineOperation({
  operationId: "SessionRevocations_create",
  method: "POST",
  path: "/api/v1/session-revocations",
  tags: ["sessions"],
  summary: "여러 세션을 폐기한다",
  auth: "required",
  body: sessionRevocationCreateDocumentSchema,
  responses: {
    201: { schema: "SessionRevocationDocument", description: "세션을 폐기했다" },
    ...failures,
    401: failure,
  },
  errors: [...errors, ...authErrors],
});
