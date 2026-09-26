// @ts-check
import errorResponse from "./rules/error-response.js";
import mediaType from "./rules/media-type.js";
import requestDocument from "./rules/request-document.js";
import typeMatchesPath from "./rules/type-matches-path.js";

/** JSON:API 규약 룰셋. redocly.yaml에서 `jsonapi/<규칙>`으로 켠다. */
export default function jsonApiPlugin() {
  return {
    id: "jsonapi",
    rules: {
      oas3: {
        "media-type": mediaType,
        "error-response": errorResponse,
        "request-document": requestDocument,
        "type-matches-path": typeMatchesPath,
      },
    },
  };
}
