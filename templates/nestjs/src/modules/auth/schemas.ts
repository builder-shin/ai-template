import { z } from "zod";
import {
  codePointString,
  dateTimeString,
  emailString,
  registerComponent,
} from "../../core/jsonapi/schemas.js";
import { localeSchema } from "../../core/config/locale.js";
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
