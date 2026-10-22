const codes = new Set([
  "jsonapi.invalid_query",
  "jsonapi.unsupported_include",
  "jsonapi.unsupported_sort",
  "jsonapi.unsupported_field",
]);
const parameters = new Set([
  "_",
  "sort",
  "include",
  "page[number]",
  "page[size]",
  "fields[posts]",
  "fields[users]",
  "fields[files]",
  "filter[author]",
  "filter[status]",
  "filter[q]",
]);

/** Observe only bounded, allowlisted metadata; never expose error bodies or query values. */
export function observeQueryError(response, observe, url) {
  let size = 0;
  const chunks = [];
  const includeFormat = classifyInclude(url);
  response.on("data", (chunk) => {
    size += chunk.length;
    if (size <= 16384) chunks.push(chunk);
    else chunks.length = 0;
  });
  response.once("end", () => {
    let result = { code: "unclassified" };
    try {
      if (size <= 16384) {
        const error = JSON.parse(Buffer.concat(chunks).toString()).errors?.[0];
        if (codes.has(error?.code))
          result = {
            code: error.code,
            ...(parameters.has(error.source?.parameter)
              ? { parameter: error.source.parameter }
              : {}),
          };
      }
    } catch {
      /* Unknown or non-JSON responses remain unclassified. */
    }
    chunks.length = 0;
    observe({ ...result, includeFormat });
  });
  response.once("error", () => {
    chunks.length = 0;
  });
}

function classifyInclude(url) {
  try {
    const values = new URL(url, "http://localhost").searchParams.getAll("include");
    if (values.length === 0) return "absent";
    if (values.length !== 1) return "repeated";
    if (values[0] === "author,coverImage") return "expected";
    if (values[0] === "author%2CcoverImage") return "encoded-delimiter";
    if (values[0] === "author%252CcoverImage") return "double-encoded-delimiter";
  } catch {
    /* Invalid input is reported without its contents. */
  }
  return "other";
}
