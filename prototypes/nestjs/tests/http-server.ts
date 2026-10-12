import type { Server } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
/** The test owns listen/close. Supertest never races startup on an unbound server. */
export async function listenTestServer(app: NestExpressApplication): Promise<Server> {
  await app.listen(0, "127.0.0.1");
  const server = app.getHttpServer();
  if (!server.listening) throw new Error("Test server did not start listening.");
  return server;
}
