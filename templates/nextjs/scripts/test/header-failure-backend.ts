import { createServer, request as forward } from "node:http";
import { once } from "node:events";

export const failureTrace = "123456789abcdef0123456789abcdef0";
export const failureAccess = "header-backend-failure";

/** /me의 실제 HTTP 500만 주입하고 나머지는 실제 목으로 전달한다. */
export async function startHeaderFailureBackend(mockBaseUrl: string) {
  const server = createServer((request, response) => {
    if (
      request.url === "/api/v1/me" &&
      request.headers.authorization === `Bearer ${failureAccess}`
    ) {
      response.writeHead(500, { "Content-Type": "application/vnd.api+json" });
      response.end(
        JSON.stringify({
          errors: [{ status: "500", code: "internal.unexpected" }],
          meta: { traceId: failureTrace },
        }),
      );
      return;
    }
    const url = new URL(request.url!, mockBaseUrl);
    const upstream = forward(
      url,
      {
        method: request.method!,
        headers: { ...request.headers, host: url.host },
      },
      (result) => {
        response.writeHead(result.statusCode!, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("실패 백엔드의 테스트 포트가 없다.");
  return {
    base: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
