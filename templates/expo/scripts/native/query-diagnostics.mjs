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
export function observeQueryError(response, observe) {
  let size = 0;
  const chunks = [];
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
    observe(result);
  });
  response.once("error", () => {
    chunks.length = 0;
  });
}
