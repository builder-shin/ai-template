/**
 * 파일 API(Files). 브라우저가 가짜 스토리지에 직접 올리고, 목은 메타데이터와 확인만 한다(FastAPI의
 * files/router.py). 규칙은 서비스(service.ts)에 있고, 여기서는 요청을 넘기고 문서를 만든다.
 */

import type { MockConfig } from "../../config.ts";
import type { components } from "../../generated/api.ts";
import { render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import { requireMatchingId } from "../../jsonapi/validation.ts";
import type { MockState } from "../../state.ts";
import { type CreatedFileResource, createdFileResource, fileResource } from "./documents.ts";
import { createFile, deleteFile, readableFile, updateFile } from "./service.ts";

type FileDocument = components["schemas"]["FileDocument"];

export function fileRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Files_create", { auth: "required" }, ({ principal, document }) => {
    const { file, upload } = createFile(state, config, principal, document.data.attributes);
    const body: { data: CreatedFileResource } = {
      data: createdFileResource(state, config, file, upload),
    };
    return render(body, { status: 201 });
  });

  api.route("Files_get", { auth: "optional" }, ({ principal, path, query }) => {
    const file = readableFile(state, path.id, principal);
    const body: FileDocument = { data: fileResource(state, config, file) };
    return render(body, { fields: query.fields });
  });

  api.route("Files_update", { auth: "required" }, ({ principal, path, document }) => {
    requireMatchingId(document.data.id, path.id);
    const ready = document.data.attributes?.status !== undefined;
    const file = updateFile(state, principal, path.id, ready);
    const body: FileDocument = { data: fileResource(state, config, file) };
    return render(body);
  });

  api.route("Files_delete", { auth: "required" }, ({ c, principal, path }) => {
    deleteFile(state, principal, path.id);
    return c.body(null, 204);
  });
}
