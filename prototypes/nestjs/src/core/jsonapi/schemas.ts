import { z } from "zod";
import { ERROR_CODES } from "./error-codes.js";
import { SCHEMA_METADATA, codePointString, formattedString, jsonInteger } from "./strings.js";
export type ContractSchemaName =
  | "CollectionMeta"
  | "EmailVerificationAttributes"
  | "EmailVerificationCreateAttributes"
  | "EmailVerificationCreateDocument"
  | "EmailVerificationDocument"
  | "EmailVerificationRequestCreateAttributes"
  | "EmailVerificationRequestCreateDocument"
  | "EmailVerificationResource"
  | "ErrorCode"
  | "ErrorDocument"
  | "ErrorObject"
  | "ErrorSource"
  | "FileAttributes"
  | "FileCreateAttributes"
  | "FileCreateDocument"
  | "FileDocument"
  | "FileMeta"
  | "FileRelationships"
  | "FileResource"
  | "FileStatus"
  | "FileUpdateAttributes"
  | "FileUpdateDocument"
  | "FileUpload"
  | "HealthReport"
  | "Locale"
  | "PageMeta"
  | "PaginationLinks"
  | "PermissionAttributes"
  | "PermissionCode"
  | "PermissionCollectionDocument"
  | "PermissionResource"
  | "PostAttributes"
  | "PostCollectionDocument"
  | "PostCreateAttributes"
  | "PostCreateDocument"
  | "PostDocument"
  | "PostRelationships"
  | "PostResource"
  | "PostStatus"
  | "PostUpdateAttributes"
  | "PostUpdateDocument"
  | "PostWriteRelationships"
  | "RealtimeTicketAttributes"
  | "RealtimeTicketCreateAttributes"
  | "RealtimeTicketCreateDocument"
  | "RealtimeTicketDocument"
  | "RealtimeTicketResource"
  | "RegistrationAttributes"
  | "RegistrationCreateAttributes"
  | "RegistrationCreateDocument"
  | "RegistrationDocument"
  | "RegistrationRelationships"
  | "RegistrationResource"
  | "RoleAttributes"
  | "RoleResource"
  | "SessionCreateDocument"
  | "SessionGrant"
  | "SessionOAuthCodeGrant"
  | "SessionPasswordGrant"
  | "SessionRefreshTokenGrant"
  | "SessionRelationships"
  | "SessionWithTokensAttributes"
  | "SessionWithTokensDocument"
  | "SessionWithTokensResource"
  | "UserAttributes"
  | "UserMeDocument"
  | "UserPublicAttributes"
  | "UserPublicRelationships"
  | "UserPublicResource"
  | "UserRelationships"
  | "UserResource"
  | "UserStatus"
  | "RealtimeSubscription"
  | "RealtimeAck"
  | "SessionRevokedEventDocument"
  | "UserMeUpdatedEventDocument"
  | "PostCreatedEventDocument"
  | "PostUpdatedEventDocument"
  | "PostPublishedEventDocument"
  | "PostUnpublishedEventDocument"
  | "PostDeletedEventDocument"
  | "SessionRevokedReason"
  | "RealtimeChannel";
export type RegisteredSchema = z.ZodType;
export const REGISTERED_SCHEMAS = new Map<ContractSchemaName, z.ZodType>();
export function contractSchema<T extends z.ZodType>(name: ContractSchemaName, schema: T): T {
  if (REGISTERED_SCHEMAS.has(name)) throw new Error(`Duplicate schema ${name}`);
  SCHEMA_METADATA.add(schema, { ...SCHEMA_METADATA.get(schema), id: name });
  REGISTERED_SCHEMAS.set(name, schema);
  return schema;
}
export function schemaRef(name: ContractSchemaName): z.ZodLazy<z.ZodType> {
  return z.lazy(() => {
    const s = REGISTERED_SCHEMAS.get(name);
    if (!s) throw new Error(`Missing schema ${name}`);
    return s;
  });
}
export const identifier = (type: string) =>
  z.object({ type: z.enum([type]), id: codePointString() });
export const toOne = (type: string) => z.object({ data: identifier(type).nullable() });
export const toMany = (type: string) => z.object({ data: z.array(identifier(type)) });
export const resource = <A extends z.ZodType, R extends z.ZodType | undefined = undefined>(
  type: string,
  attributes: A,
  relationships?: R,
) =>
  z.object({
    type: z.enum([type]),
    id: codePointString(),
    attributes,
    ...((relationships ? { relationships } : {}) as R extends z.ZodType
      ? { relationships: R }
      : object),
  });
export const document = <D extends z.ZodType>(data: D) => z.object({ data });
export const createDocument = <A extends z.ZodType, R extends z.ZodType | undefined = undefined>(
  type: string,
  attributes: A,
  relationships?: R,
) =>
  document(
    z.object({
      type: z.enum([type]),
      attributes,
      ...((relationships ? { relationships: relationships.optional() } : {}) as R extends z.ZodType
        ? { relationships: z.ZodOptional<Extract<R, z.ZodType>> }
        : object),
    }),
  );
export const updateDocument = <A extends z.ZodType, R extends z.ZodType | undefined = undefined>(
  type: string,
  attributes: A,
  relationships?: R,
) =>
  document(
    z.object({
      type: z.enum([type]),
      id: codePointString(),
      attributes: attributes.optional(),
      ...((relationships ? { relationships: relationships.optional() } : {}) as R extends z.ZodType
        ? { relationships: z.ZodOptional<Extract<R, z.ZodType>> }
        : object),
    }),
  );
export const datetime = () => formattedString("date-time");
export const uri = () => formattedString("uri");
export const email = () =>
  codePointString()
    .trim()
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v), {
      params: { kind: "format" },
      message: "Invalid email.",
    })
    .register(SCHEMA_METADATA, { format: "email" });
export const ErrorCodeSchema = contractSchema("ErrorCode", z.enum(ERROR_CODES));
export const ErrorSource = contractSchema(
  "ErrorSource",
  z.object({ pointer: codePointString().optional(), parameter: codePointString().optional() }),
);
export const ErrorObjectSchema = contractSchema(
  "ErrorObject",
  z.object({
    status: codePointString(),
    code: ErrorCodeSchema,
    title: codePointString(),
    detail: codePointString({ wellFormed: false }).optional(),
    source: ErrorSource.optional(),
    meta: z.object({ params: z.record(z.string(), z.unknown()).optional() }).optional(),
  }),
);
export const ErrorDocument = contractSchema(
  "ErrorDocument",
  z.object({ errors: z.array(ErrorObjectSchema), meta: z.object({ traceId: codePointString() }) }),
);
export const PageMeta = contractSchema(
  "PageMeta",
  z.object({
    number: jsonInteger("int32"),
    size: jsonInteger("int32"),
    total: jsonInteger("int32"),
    totalPages: jsonInteger("int32"),
  }),
);
export const PaginationLinks = contractSchema(
  "PaginationLinks",
  z.object({
    first: formattedString("uri-reference"),
    last: formattedString("uri-reference"),
    prev: z
      .union([codePointString(), z.null()])
      .register(SCHEMA_METADATA, { format: "uri-reference" }),
    next: z
      .union([codePointString(), z.null()])
      .register(SCHEMA_METADATA, { format: "uri-reference" }),
  }),
);
export const CollectionMeta = contractSchema("CollectionMeta", z.object({ page: PageMeta }));
export const collection = <D extends z.ZodType>(data: D) =>
  z.object({ data: z.array(data), links: PaginationLinks, meta: CollectionMeta });
