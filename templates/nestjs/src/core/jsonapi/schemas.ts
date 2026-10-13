import { z } from "zod";

export interface RegisteredComponent {
  readonly name: string;
  readonly schema: z.ZodType;
  readonly discriminator?: { propertyName: string; mapping: Record<string, string> };
}
const registry = new Map<string, RegisteredComponent>();
export function registerComponent<T extends z.ZodType>(
  name: string,
  schema: T,
  options?: Pick<RegisteredComponent, "discriminator">,
): T {
  if (registry.has(name)) throw new Error(`컴포넌트 이름이 중복된다: ${name}`);
  registry.set(name, { name, schema, ...options });
  return schema;
}
export function components(): ReadonlyMap<string, RegisteredComponent> {
  return new Map(registry);
}

const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
export function codePointString(options: { min?: number; max?: number } = {}): z.ZodString {
  return z
    .string()
    .check((ctx) => {
      const value = ctx.value;
      if ((options.min !== undefined || options.max !== undefined) && loneSurrogate.test(value)) {
        ctx.issues.push({ code: "invalid_format", format: "unicode", input: value });
        return;
      }
      const length = Array.from(value).length;
      if (options.min !== undefined && length < options.min)
        ctx.issues.push({
          code: "too_small",
          origin: "string",
          minimum: options.min,
          inclusive: true,
          input: value,
        });
      if (options.max !== undefined && length > options.max)
        ctx.issues.push({
          code: "too_big",
          origin: "string",
          maximum: options.max,
          inclusive: true,
          input: value,
        });
    })
    .meta({
      ...(options.min === undefined ? {} : { minLength: options.min }),
      ...(options.max === undefined ? {} : { maxLength: options.max }),
    });
}
export function jsonInteger(options: {
  min?: number;
  max?: number;
  format: "int32" | "int64";
}): z.ZodNumber {
  let schema = z.number().check((ctx) => {
    if (!Number.isInteger(ctx.value))
      ctx.issues.push({ code: "invalid_type", expected: "int", input: ctx.value });
  });
  if (options.min !== undefined) schema = schema.min(options.min);
  if (options.max !== undefined) schema = schema.max(options.max);
  return schema.meta({ type: "integer", format: options.format });
}
function formattedString(format: string, valid: (value: string) => boolean): z.ZodString {
  return z
    .string()
    .check((ctx) => {
      if (loneSurrogate.test(ctx.value) || !valid(ctx.value))
        ctx.issues.push({ code: "invalid_format", format, input: ctx.value });
    })
    .meta({ format });
}
export function emailString(): z.ZodString {
  return formattedString("email", (value) => z.regexes.email.test(value));
}
export function uuidString(): z.ZodString {
  return formattedString("uuid", (value) => z.regexes.uuid().test(value));
}
export function dateTimeString(): z.ZodString {
  return formattedString("date-time", (value) => {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(
        value,
      );
    if (!match) return false;
    const [, year, month, day, hour, minute, second, offsetHour = "0", offsetMinute = "0"] = match;
    const y = Number(year),
      m = Number(month),
      d = Number(day);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (
      m >= 1 &&
      m <= 12 &&
      d >= 1 &&
      d <= (days[m - 1] ?? 0) &&
      Number(hour) < 24 &&
      Number(minute) < 60 &&
      Number(second) < 60 &&
      Number(offsetHour) < 24 &&
      Number(offsetMinute) < 60
    );
  });
}
