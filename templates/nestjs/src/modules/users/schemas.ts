import { z } from "zod";
import { registerComponent } from "../../core/jsonapi/schemas.js";
export const USER_STATUSES = ["active", "deactivated", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = registerComponent("UserStatus", z.enum(USER_STATUSES));
