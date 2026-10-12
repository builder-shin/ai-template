import { z } from "zod";
import {
  contractSchema,
  resource,
  document,
  createDocument,
  datetime,
  toOne,
  email,
} from "../../core/jsonapi/schemas.js";
import { codePointString, SCHEMA_METADATA } from "../../core/jsonapi/strings.js";
import { Locale } from "../users/index.js";
export const RegistrationAttributes = contractSchema(
  "RegistrationAttributes",
  z.object({ email: codePointString(), createdAt: datetime() }),
);
export const RegistrationRelationships = contractSchema(
  "RegistrationRelationships",
  z.object({ user: toOne("users") }),
);
export const RegistrationResource = contractSchema(
  "RegistrationResource",
  resource("registrations", RegistrationAttributes, RegistrationRelationships),
);
export const RegistrationDocument = contractSchema(
  "RegistrationDocument",
  document(RegistrationResource),
);
export const RegistrationCreateAttributes = contractSchema(
  "RegistrationCreateAttributes",
  z.object({
    email: email(),
    password: codePointString({ min: 8, max: 128 }),
    name: codePointString({ min: 1, max: 100 }),
    locale: Locale.optional(),
  }),
);
export const RegistrationCreateDocument = contractSchema(
  "RegistrationCreateDocument",
  createDocument("registrations", RegistrationCreateAttributes),
);
export const EmailVerificationRequestCreateAttributes = contractSchema(
  "EmailVerificationRequestCreateAttributes",
  z.object({ email: email() }),
);
export const EmailVerificationRequestCreateDocument = contractSchema(
  "EmailVerificationRequestCreateDocument",
  createDocument("email-verification-requests", EmailVerificationRequestCreateAttributes),
);
export const EmailVerificationAttributes = contractSchema(
  "EmailVerificationAttributes",
  z.object({ verifiedAt: datetime() }),
);
export const EmailVerificationCreateAttributes = contractSchema(
  "EmailVerificationCreateAttributes",
  z.object({ token: codePointString() }),
);
export const EmailVerificationResource = contractSchema(
  "EmailVerificationResource",
  resource("email-verifications", EmailVerificationAttributes),
);
export const EmailVerificationDocument = contractSchema(
  "EmailVerificationDocument",
  document(EmailVerificationResource),
);
export const EmailVerificationCreateDocument = contractSchema(
  "EmailVerificationCreateDocument",
  createDocument("email-verifications", EmailVerificationCreateAttributes),
);
export const SessionPasswordGrant = contractSchema(
  "SessionPasswordGrant",
  z.object({
    grantType: z.enum(["password"]),
    email: email(),
    password: codePointString({ wellFormed: false }),
  }),
);
export const SessionRefreshTokenGrant = contractSchema(
  "SessionRefreshTokenGrant",
  z.object({ grantType: z.enum(["refreshToken"]), refreshToken: codePointString() }),
);
export const SessionOAuthCodeGrant = contractSchema(
  "SessionOAuthCodeGrant",
  z.object({
    grantType: z.enum(["oauthCode"]),
    code: codePointString(),
    codeVerifier: codePointString(),
  }),
);
export const SessionGrant = contractSchema(
  "SessionGrant",
  z
    .discriminatedUnion("grantType", [
      SessionPasswordGrant,
      SessionRefreshTokenGrant,
      SessionOAuthCodeGrant,
    ])
    .register(SCHEMA_METADATA, {
      type: "object",
      discriminator: {
        propertyName: "grantType",
        mapping: {
          password: "#/components/schemas/SessionPasswordGrant", // betterleaks:allow - schema reference, not a credential
          refreshToken: "#/components/schemas/SessionRefreshTokenGrant",
          oauthCode: "#/components/schemas/SessionOAuthCodeGrant",
        },
      },
    }),
);
export const SessionCreateDocument = contractSchema(
  "SessionCreateDocument",
  createDocument("sessions", SessionGrant),
);
export const SessionWithTokensAttributes = contractSchema(
  "SessionWithTokensAttributes",
  z.object({
    userAgent: codePointString().nullable(),
    createdAt: datetime(),
    lastUsedAt: datetime(),
    current: z.boolean(),
    accessToken: codePointString(),
    accessTokenExpiresAt: datetime(),
    refreshToken: codePointString(),
    refreshTokenExpiresAt: datetime(),
  }),
);
export const SessionRelationships = contractSchema(
  "SessionRelationships",
  z.object({ user: toOne("users") }),
);
export const SessionWithTokensResource = contractSchema(
  "SessionWithTokensResource",
  resource("sessions", SessionWithTokensAttributes, SessionRelationships),
);
export const SessionWithTokensDocument = contractSchema(
  "SessionWithTokensDocument",
  document(SessionWithTokensResource),
);
