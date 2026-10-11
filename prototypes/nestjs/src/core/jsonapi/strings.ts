import { z } from "zod";
export const SCHEMA_METADATA = z.registry<z.core.GlobalMeta>();
export const CODE_POINT_STRINGS = new WeakSet<z.ZodType>();
export function codePointString({
  min,
  max,
  wellFormed = true,
}: { min?: number; max?: number; wellFormed?: boolean } = {}): z.ZodString {
  const schema = z.string().superRefine((value, ctx) => {
    if (
      wellFormed &&
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
    ) {
      ctx.addIssue({
        code: "custom",
        params: { kind: "unicode" },
        message: "Input should be a valid string, unable to parse raw data as a unicode string",
      });
      return;
    }
    const size = Array.from(value).length;
    if (min !== undefined && size < min)
      ctx.addIssue({
        code: "too_small",
        origin: "string",
        minimum: min,
        inclusive: true,
        message: "String is too short.",
      });
    if (max !== undefined && size > max)
      ctx.addIssue({
        code: "too_big",
        origin: "string",
        maximum: max,
        inclusive: true,
        message: "String is too long.",
      });
  });
  CODE_POINT_STRINGS.add(schema);
  SCHEMA_METADATA.add(schema, {
    ...(min === undefined ? {} : { minLength: min }),
    ...(max === undefined ? {} : { maxLength: max }),
  });
  return schema;
}
/** JSON numbers, rather than BigInt or Zod's implicit safe-integer cap. */
export function jsonInteger(
  format: "int32" | "int64",
  bounds: { min?: number; max?: number } = {},
): z.ZodNumber {
  let schema = z.number();
  if (bounds.min !== undefined) schema = schema.min(bounds.min);
  if (bounds.max !== undefined) schema = schema.max(bounds.max);
  schema = schema.superRefine((value, ctx) => {
    if (!Number.isInteger(value))
      ctx.addIssue({ code: "custom", params: { kind: "integer" }, message: "Integer required." });
  });
  return schema.register(SCHEMA_METADATA, { type: "integer", format });
}
export function formattedString(format: string): z.ZodString {
  return codePointString().register(SCHEMA_METADATA, { format });
}
