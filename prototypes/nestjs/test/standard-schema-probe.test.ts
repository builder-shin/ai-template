import "reflect-metadata";
import {
  Body,
  Controller,
  HttpStatus,
  HttpException,
  Module,
  Param,
  Post,
  Query,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import request from "supertest";
import { expect, it } from "vitest";
import { z } from "zod";

const seen: unknown[] = [];
const chronology: string[] = [];
const bodySchema = z.object({
  name: z.string().max(2),
  email: z.email(),
  count: z.int32(),
  grant: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), value: z.string() }),
    z.object({ kind: z.literal("b"), value: z.number() }),
  ]),
});
class TimedPipe implements PipeTransform {
  constructor(
    private readonly label: string,
    private readonly delay: number,
    private readonly status: 400 | 404 | 422,
  ) {}
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    chronology.push(`${this.label}:start`);
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    try {
      return await new StandardSchemaValidationPipe({
        exceptionFactory: (issues) => {
          seen.push({ label: this.label, issues });
          return new HttpException({ label: this.label, issues }, this.status);
        },
      }).transform(value, metadata);
    } finally {
      chronology.push(`${this.label}:end`);
    }
  }
}
@Controller("probe")
class ProbeController {
  @Post("default")
  default(
    @Body({ schema: bodySchema, pipes: [new StandardSchemaValidationPipe()] }) body: unknown,
  ): unknown {
    return body;
  }
  @Post(":id/mixed")
  mixed(
    @Query({ schema: z.object({ q: z.string().max(1) }), pipes: [new TimedPipe("query", 20, 400)] })
    query: unknown,
    @Param({ schema: z.object({ id: z.uuid() }), pipes: [new TimedPipe("path", 10, 404)] })
    path: unknown,
    @Body({ schema: bodySchema, pipes: [new TimedPipe("body", 0, 422)] }) body: unknown,
  ): unknown {
    return { query, path, body };
  }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

it("measures installed Standard Schema issue shape, transformation and concurrent HTTP pipes", async () => {
  const record: Record<string, unknown> = {
    versions: {
      nest: JSON.parse(readFileSync("node_modules/@nestjs/common/package.json", "utf8")) as unknown,
      zod: JSON.parse(readFileSync("node_modules/zod/package.json", "utf8")) as unknown,
    },
  };
  const schema = z.string().transform((v) => v.toUpperCase());
  const meta: ArgumentMetadata = { type: "body", schema };
  expect(await new StandardSchemaValidationPipe().transform("ok", meta)).toBe("OK");
  expect(await new StandardSchemaValidationPipe({ transform: false }).transform("ok", meta)).toBe(
    "ok",
  );
  record.transform = { default: "OK", disabled: "ok" };
  try {
    await new StandardSchemaValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }).transform(4, { type: "body", schema: z.string() });
  } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    record.errorHttpStatusCode = (e as HttpException).getStatus();
    expect(record.errorHttpStatusCode).toBe(422);
  }
  const app = await NestFactory.create(ProbeModule, { logger: false });
  await app.init();
  try {
    const invalid = { name: "long", email: "bad", count: "1", grant: { kind: "a", value: 42 } };
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/probe/default")
      .send(invalid);
    expect(response.status).toBe(400);
    record.defaultResponse = response.body as unknown;
    const mixed = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/probe/bad/mixed?q=bad")
      .send(invalid);
    await new Promise((resolve) => setTimeout(resolve, 40));
    record.mixedResponse = { status: mixed.status, body: mixed.body as unknown };
    record.seen = seen;
    record.chronology = chronology;
    expect(mixed.status).toBe(422);
    expect(chronology.slice(0, 3)).toEqual(["body:start", "path:start", "query:start"]);
    const issues = (seen[0] as { issues: Record<string, unknown>[] }).issues;
    expect(issues[0]).toHaveProperty("code", "too_big");
    expect(issues[0]).toHaveProperty("maximum", 2);
    expect(issues.map((i) => i.path)).toContainEqual(["grant", "value"]);
    mkdirSync(".cache/jsonapi", { recursive: true });
    writeFileSync(".cache/jsonapi/pipe-probe.json", JSON.stringify(record, null, 2));
  } finally {
    await app.close();
  }
});
