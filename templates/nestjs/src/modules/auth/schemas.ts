import { z } from "zod";
import {
  codePointString,
  dateTimeString,
  emailString,
  registerComponent,
  jsonInteger,
} from "../../core/jsonapi/schemas.js";
import {
  paginationLinksSchema,
  collectionMetaSchema,
} from "../../core/jsonapi/collection-schemas.js";
import { localeSchema } from "../../core/config/locale.js";
const passwordGrant = registerComponent(
  "SessionPasswordGrant",
  z.object({ grantType: z.enum(["password"]), email: emailString(), password: z.string() }),
);
const refreshGrant = registerComponent(
  "SessionRefreshTokenGrant",
  z.object({ grantType: z.enum(["refreshToken"]), refreshToken: z.string() }),
);
const oauthGrant = registerComponent(
  "SessionOAuthCodeGrant",
  z.object({ grantType: z.enum(["oauthCode"]), code: z.string(), codeVerifier: z.string() }),
);
const sessionGrant = registerComponent(
  "SessionGrant",
  z
    .discriminatedUnion("grantType", [passwordGrant, refreshGrant, oauthGrant])
    .meta({ type: "object" }),
  {
    discriminator: {
      propertyName: "grantType",
      mapping: {
        password: "#/components/schemas/SessionPasswordGrant", // betterleaks:allow 사유: 비밀번호 값이 아닌 discriminator 스키마 경로다
        refreshToken: "#/components/schemas/SessionRefreshTokenGrant",
        oauthCode: "#/components/schemas/SessionOAuthCodeGrant",
      },
    },
  },
);
export const sessionCreateDocumentSchema = registerComponent(
  "SessionCreateDocument",
  z.object({ data: z.object({ type: z.enum(["sessions"]), attributes: sessionGrant }) }),
);
const sessionAttributes = registerComponent(
  "SessionAttributes",
  z.object({
    userAgent: z.string().nullable(),
    createdAt: dateTimeString(),
    lastUsedAt: dateTimeString(),
    current: z.boolean(),
  }),
);
const sessionWithTokensAttributes = registerComponent(
  "SessionWithTokensAttributes",
  sessionAttributes.extend({
    accessToken: z.string(),
    accessTokenExpiresAt: dateTimeString(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: dateTimeString(),
  }),
);
const sessionRelationships = registerComponent(
  "SessionRelationships",
  z.object({
    user: z.object({ data: z.object({ type: z.enum(["users"]), id: z.string() }).nullable() }),
  }),
);
const sessionResource = registerComponent(
  "SessionResource",
  z.object({
    type: z.enum(["sessions"]),
    id: z.string(),
    attributes: sessionAttributes,
    relationships: sessionRelationships,
  }),
);
const sessionWithTokensResource = registerComponent(
  "SessionWithTokensResource",
  sessionResource.extend({ attributes: sessionWithTokensAttributes }),
);
registerComponent("SessionWithTokensDocument", z.object({ data: sessionWithTokensResource }));
registerComponent(
  "SessionCollectionDocument",
  z.object({
    data: z.array(sessionResource),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
const revocationScope = registerComponent("SessionRevocationScope", z.enum(["others", "all"]));
const revocationAttributes = registerComponent(
  "SessionRevocationAttributes",
  z.object({
    scope: revocationScope,
    revokedCount: jsonInteger({ format: "int32" }),
    createdAt: dateTimeString(),
  }),
);
const revocationCreateAttributes = registerComponent(
  "SessionRevocationCreateAttributes",
  z.object({ scope: revocationScope }),
);
const revocationResource = registerComponent(
  "SessionRevocationResource",
  z.object({
    type: z.enum(["session-revocations"]),
    id: z.string(),
    attributes: revocationAttributes,
  }),
);
registerComponent("SessionRevocationDocument", z.object({ data: revocationResource }));
export const sessionRevocationCreateDocumentSchema = registerComponent(
  "SessionRevocationCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["session-revocations"]),
      attributes: revocationCreateAttributes,
    }),
  }),
);
const password = z
  .string()
  .check((ctx) => {
    const length = Array.from(ctx.value).length;
    if (length < 8)
      ctx.issues.push({
        code: "too_small",
        origin: "string",
        minimum: 8,
        inclusive: true,
        input: ctx.value,
      });
    if (length > 128)
      ctx.issues.push({
        code: "too_big",
        origin: "string",
        maximum: 128,
        inclusive: true,
        input: ctx.value,
      });
  })
  .meta({ minLength: 8, maxLength: 128 });
export const registrationCreateAttributesSchema = registerComponent(
  "RegistrationCreateAttributes",
  z.object({
    email: emailString(),
    password,
    name: codePointString({ min: 1, max: 100 }),
    locale: localeSchema.optional(),
  }),
);
export const registrationCreateDocumentSchema = registerComponent(
  "RegistrationCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["registrations"]),
      attributes: registrationCreateAttributesSchema,
    }),
  }),
);
const registrationAttributes = registerComponent(
  "RegistrationAttributes",
  z.object({ email: z.string(), createdAt: dateTimeString() }),
);
const registrationRelationships = registerComponent(
  "RegistrationRelationships",
  z.object({
    user: z.object({ data: z.object({ type: z.enum(["users"]), id: z.string() }).nullable() }),
  }),
);
const registrationResource = registerComponent(
  "RegistrationResource",
  z.object({
    type: z.enum(["registrations"]),
    id: z.string(),
    attributes: registrationAttributes,
    relationships: registrationRelationships,
  }),
);
export const registrationDocumentSchema = registerComponent(
  "RegistrationDocument",
  z.object({ data: registrationResource }),
);
const emailVerificationRequestAttributes = registerComponent(
  "EmailVerificationRequestCreateAttributes",
  z.object({ email: emailString() }),
);
export const emailVerificationRequestCreateDocumentSchema = registerComponent(
  "EmailVerificationRequestCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["email-verification-requests"]),
      attributes: emailVerificationRequestAttributes,
    }),
  }),
);
const verificationCreateAttributes = registerComponent(
  "EmailVerificationCreateAttributes",
  z.object({ token: z.string() }),
);
export const emailVerificationCreateDocumentSchema = registerComponent(
  "EmailVerificationCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["email-verifications"]),
      attributes: verificationCreateAttributes,
    }),
  }),
);
const verificationAttributes = registerComponent(
  "EmailVerificationAttributes",
  z.object({ verifiedAt: dateTimeString() }),
);
const verificationResource = registerComponent(
  "EmailVerificationResource",
  z.object({
    type: z.enum(["email-verifications"]),
    id: z.string(),
    attributes: verificationAttributes,
  }),
);
export const emailVerificationDocumentSchema = registerComponent(
  "EmailVerificationDocument",
  z.object({ data: verificationResource }),
);
const passwordResetRequestAttributes = registerComponent(
  "PasswordResetRequestCreateAttributes",
  z.object({ email: emailString() }),
);
export const passwordResetRequestCreateDocumentSchema = registerComponent(
  "PasswordResetRequestCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["password-reset-requests"]),
      attributes: passwordResetRequestAttributes,
    }),
  }),
);
const passwordResetCreateAttributes = registerComponent(
  "PasswordResetCreateAttributes",
  z.object({ token: z.string(), password }),
);
export const passwordResetCreateDocumentSchema = registerComponent(
  "PasswordResetCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["password-resets"]),
      attributes: passwordResetCreateAttributes,
    }),
  }),
);
const passwordChangeCreateAttributes = registerComponent(
  "PasswordChangeCreateAttributes",
  z.object({ currentPassword: z.string(), newPassword: password }),
);
export const passwordChangeCreateDocumentSchema = registerComponent(
  "PasswordChangeCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["password-changes"]),
      attributes: passwordChangeCreateAttributes,
    }),
  }),
);
const passwordResetAttributes = registerComponent(
  "PasswordResetAttributes",
  z.object({ createdAt: dateTimeString() }),
);
const passwordChangeAttributes = registerComponent(
  "PasswordChangeAttributes",
  z.object({ createdAt: dateTimeString() }),
);
const passwordResetResource = registerComponent(
  "PasswordResetResource",
  z.object({
    type: z.enum(["password-resets"]),
    id: z.string(),
    attributes: passwordResetAttributes,
  }),
);
const passwordChangeResource = registerComponent(
  "PasswordChangeResource",
  z.object({
    type: z.enum(["password-changes"]),
    id: z.string(),
    attributes: passwordChangeAttributes,
  }),
);
registerComponent("PasswordResetDocument", z.object({ data: passwordResetResource }));
registerComponent("PasswordChangeDocument", z.object({ data: passwordChangeResource }));
