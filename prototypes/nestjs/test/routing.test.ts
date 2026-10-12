import "reflect-metadata";
import { Controller, Delete, Module, Param } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import type { RouteConflictPolicy, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { describe, expect, it } from "vitest";

@Controller("api/v1/sessions")
class ParameterFirst {
  @Delete(":id")
  byId(@Param("id") id: string) {
    return { handler: "id", id };
  }
  @Delete("current")
  current() {
    return { handler: "current" };
  }
}

@Controller("api/v1/sessions")
class CurrentFirst {
  @Delete("current")
  current() {
    return { handler: "current" };
  }
  @Delete(":id")
  byId(@Param("id") id: string) {
    return { handler: "id", id };
  }
}

@Controller("api/v1/sessions")
class Duplicate {
  @Delete("current")
  first() {
    return "first";
  }
  @Delete("current")
  second() {
    return "second";
  }
}

@Controller("api/v1/sessions")
class Ambiguous {
  @Delete(":id")
  first() {
    return "first";
  }
  @Delete(":name")
  second() {
    return "second";
  }
}

async function application(controller: Type<unknown>, policy: RouteConflictPolicy) {
  @Module({ controllers: [controller] })
  class Routes {}
  const server = express();
  server.set("strict routing", true);
  const app = await NestFactory.create<NestExpressApplication>(Routes, new ExpressAdapter(server), {
    logger: false,
    abortOnError: false,
    bodyParser: false,
    routeResolutionStrategy: "specificity",
    routeConflictPolicy: policy,
  });
  app.set("strict routing", true);
  return app;
}

describe("installed Nest 12.1.2 route policy", () => {
  it.each([ParameterFirst, CurrentFirst])("resolves current and ids for %s", async (controller) => {
    const app = await application(controller, { duplicate: "error", shadow: "warn" });
    try {
      await app.init();
      const http = request(app.getHttpServer());
      await http.delete("/api/v1/sessions/current").expect(200, { handler: "current" });
      for (const id of ["ordinary-id", "123", "currentish"]) {
        await http.delete(`/api/v1/sessions/${id}`).expect(200, { handler: "id", id });
      }
      await http.delete("/api/v1/sessions/current/").expect(404);
    } finally {
      await app.close();
    }
  });

  it.each([Duplicate, Ambiguous])("rejects conflicting routes for %s", async (controller) => {
    const app = await application(controller, { duplicate: "error", shadow: "error" });
    try {
      await expect(app.init()).rejects.toThrow("Conflicting HTTP routes detected");
    } finally {
      await app.close();
    }
  });

  it("records the order-sensitive shadow:error limitation", async () => {
    const first = await application(ParameterFirst, { duplicate: "error", shadow: "error" });
    const second = await application(CurrentFirst, { duplicate: "error", shadow: "error" });
    try {
      await first.init();
      await expect(second.init()).rejects.toThrow("shadowed");
    } finally {
      await first.close();
      await second.close();
    }
  });
});
