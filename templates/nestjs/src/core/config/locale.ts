import { z } from "zod";
import { registerComponent } from "../jsonapi/schemas.js";
export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const localeSchema = registerComponent("Locale", z.enum(LOCALES));
