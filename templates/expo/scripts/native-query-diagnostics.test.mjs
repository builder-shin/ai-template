import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { startNativeProxy } from "./native/proxy.mjs";

const privateValue = "private-diagnostic-value";
const body = (code, parameter) =>
  JSON.stringify({ errors: [{ code, detail: privateValue, source: { parameter } }] });

for (const [method, path, status] of [
  ["POST", "/api/v1/posts", 400],
  ["GET", "/api/v1/me", 400],
  ["GET", "/api/v1/posts", 200],
]) {
  test(`query diagnostics do not observe other traffic: ${method} ${path} ${status}`, async () => {
    const payload = body("jsonapi.invalid_query", "sort");
    const upstream = createServer((_, res) => res.writeHead(status).end(payload)).listen(
      0,
      "127.0.0.1",
    );
    await once(upstream, "listening");
    let proxy;
    try {
      const errors = [];
      proxy = await startNativeProxy({
        upstream: `http://127.0.0.1:${upstream.address().port}`,
        port: 0,
        observeQueryError: (event) => errors.push(event),
      });
      assert.equal(await (await fetch(proxy.origin + path, { method })).text(), payload);
      assert.deepEqual(errors, []);
    } finally {
      await proxy?.stop();
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
}

for (const [name, payload, expected] of [
  [
    "known query classification",
    body("jsonapi.invalid_query", "sort"),
    {
      code: "jsonapi.invalid_query",
      parameter: "sort",
    },
  ],
  [
    "cache-buster classification",
    body("jsonapi.invalid_query", "_"),
    {
      code: "jsonapi.invalid_query",
      parameter: "_",
    },
  ],
  [
    "private parameter",
    body("jsonapi.invalid_query", privateValue),
    {
      code: "jsonapi.invalid_query",
    },
  ],
  ["private error code", body(privateValue, "sort"), { code: "unclassified" }],
  ["invalid JSON", privateValue, { code: "unclassified" }],
  [
    "oversized response",
    body("jsonapi.invalid_query", "sort") + " ".repeat(17000),
    {
      code: "unclassified",
    },
  ],
]) {
  test(`query error diagnostics preserve response bytes and exclude private values: ${name}`, async () => {
    const upstream = createServer((_, res) => {
      res.writeHead(400, { "content-type": "application/vnd.api+json" });
      const split = Math.floor(payload.length / 2);
      res.write(payload.slice(0, split));
      res.end(payload.slice(split));
    }).listen(0, "127.0.0.1");
    await once(upstream, "listening");
    let proxy;
    try {
      const errors = [],
        headers = [];
      proxy = await startNativeProxy({
        upstream: `http://127.0.0.1:${upstream.address().port}`,
        port: 0,
        observe: (event) => headers.push(event),
        observeQueryError: (event) => errors.push(event),
      });
      const response = await fetch(`${proxy.origin}/api/v1/posts?filter[q]=${privateValue}`, {
        headers: { Authorization: `Bearer ${privateValue}` },
      });
      assert.equal(response.status, 400);
      assert.equal(await response.text(), payload);
      assert.deepEqual(headers, [{ method: "GET", path: "/api/v1/posts", status: 400 }]);
      assert.deepEqual(errors, [{ ...expected, includeFormat: "absent" }]);
      assert.equal(JSON.stringify(errors).includes(privateValue), false);
    } finally {
      await proxy?.stop();
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
}

for (const [query, includeFormat] of [
  ["include=author%2CcoverImage", "expected"],
  ["include=author%252CcoverImage", "encoded-delimiter"],
  ["include=author%25252CcoverImage", "double-encoded-delimiter"],
  [`include=${privateValue}`, "other"],
  ["include=author&include=coverImage", "repeated"],
]) {
  test(`query diagnostics expose only an include encoding label: ${includeFormat}`, async () => {
    const upstream = createServer((_, res) =>
      res.writeHead(400).end(body("jsonapi.unsupported_include", "include")),
    ).listen(0, "127.0.0.1");
    await once(upstream, "listening");
    let proxy;
    try {
      const errors = [];
      proxy = await startNativeProxy({
        upstream: `http://127.0.0.1:${upstream.address().port}`,
        port: 0,
        observeQueryError: (event) => errors.push(event),
      });
      await (await fetch(`${proxy.origin}/api/v1/posts?${query}`)).text();
      assert.deepEqual(errors, [
        {
          code: "jsonapi.unsupported_include",
          parameter: "include",
          includeFormat,
        },
      ]);
      assert.equal(JSON.stringify(errors).includes(privateValue), false);
    } finally {
      await proxy?.stop();
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
}
