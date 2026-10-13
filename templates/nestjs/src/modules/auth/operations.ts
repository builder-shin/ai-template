import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger } from "../../core/jsonapi/schemas.js";
import {
  registrationCreateDocumentSchema,
  emailVerificationRequestCreateDocumentSchema,
  emailVerificationCreateDocumentSchema,
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
