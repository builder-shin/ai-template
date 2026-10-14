import { z } from "zod";
import { registerComponent, dateTimeString } from "../../core/jsonapi/schemas.js";
import { auditLogActionSchema } from "../../core/audit/actions.js";
import { userPublicResourceSchema } from "../users/index.js";
import {
  paginationLinksSchema,
  collectionMetaSchema,
} from "../../core/jsonapi/collection-schemas.js";
export const auditLogTargetTypeSchema = registerComponent(
  "AuditLogTargetType",
  z.enum(["users", "roles", "posts"]),
);
const attributes = registerComponent(
  "AuditLogAttributes",
  z.object({
    action: auditLogActionSchema,
    targetType: auditLogTargetTypeSchema.nullable(),
    targetId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    ipAddress: z.string().nullable(),
    createdAt: dateTimeString(),
  }),
);
const relationships = registerComponent(
  "AuditLogRelationships",
  z.object({
    actor: z.object({ data: z.object({ type: z.enum(["users"]), id: z.string() }).nullable() }),
  }),
);
export const auditLogResourceSchema = registerComponent(
  "AuditLogResource",
  z.object({ type: z.enum(["audit-logs"]), id: z.string(), attributes, relationships }),
);
registerComponent(
  "AuditLogDocument",
  z.object({
    data: auditLogResourceSchema,
    included: z.array(userPublicResourceSchema).optional(),
  }),
);
registerComponent(
  "AuditLogCollectionDocument",
  z.object({
    data: z.array(auditLogResourceSchema),
    included: z.array(userPublicResourceSchema).optional(),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
