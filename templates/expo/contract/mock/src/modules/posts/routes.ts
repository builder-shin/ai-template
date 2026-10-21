/**
 * 글 API(Posts). FastAPI의 posts/router.py와 같다. 규칙은 서비스(service.ts)에 있고, 여기서는 요청을
 * 넘기고 문서를 만든다.
 *
 * - 목록과 단건은 로그인이 선택이다(보는 사람에 따라 초안이 보인다). include=author,coverImage와
 *   fields[posts], fields[users], fields[files]를 받는다.
 * - 만들기는 posts:create 권한이 있어야 한다. 만들기와 고치기의 응답에는 포함 리소스가 없다.
 * - PATCH 본문의 data.id가 경로와 다르면 409이고, 그다음 글이 없거나 볼 수 없으면 404다. 지우기는 204다.
 */

import type { MockConfig } from "../../config.ts";
import { clientOf } from "../../core/client.ts";
import type { components } from "../../generated/api.ts";
import { enumFilter, textFilter, uuidFilter } from "../../jsonapi/filters.ts";
import { pagination, render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import { requireMatchingId } from "../../jsonapi/validation.ts";
import type { MockState } from "../../state.ts";
import { includedFor, postResource } from "./documents.ts";
import { createPost, deletePost, listPosts, updatePost, visiblePost } from "./service.ts";

type Schemas = components["schemas"];

const POST_FILTERS = { status: enumFilter("PostStatus"), author: uuidFilter, q: textFilter };

/** 요청의 커버 관계: 걸 파일 id, 뺄 때 null, 보내지 않았으면 undefined다. */
function coverOf(
  relationships: Schemas["PostWriteRelationships"] | undefined,
): string | null | undefined {
  const cover = relationships?.coverImage;
  return cover === undefined ? undefined : (cover.data?.id ?? null);
}

function readRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route(
    "Posts_list",
    { auth: "optional", filters: POST_FILTERS },
    ({ c, principal, query }) => {
      const { filter, sort, page, include, fields } = query;
      const { rows, total } = listPosts(state.store, principal, filter, sort, page);
      const included = includedFor(state, config, include, rows);
      const body: Schemas["PostCollectionDocument"] = {
        data: rows.map(postResource),
        ...pagination(c, page, total),
        ...(included.length > 0 ? { included } : {}),
      };
      return render(body, { fields });
    },
  );

  api.route("Posts_get", { auth: "optional" }, ({ principal, path, query }) => {
    const post = visiblePost(state.store, path.id, principal);
    const included = includedFor(state, config, query.include, [post]);
    const body: Schemas["PostDocument"] = {
      data: postResource(post),
      ...(included.length > 0 ? { included } : {}),
    };
    return render(body, { fields: query.fields });
  });
}

function writeRoutes(api: JsonApiRouter, state: MockState): void {
  api.route("Posts_create", { auth: "required" }, ({ principal, document }) => {
    const { attributes, relationships } = document.data;
    const post = createPost(state, principal, {
      title: attributes.title,
      body: attributes.body,
      status: attributes.status ?? "draft",
      cover: coverOf(relationships) ?? null,
    });
    const body: Schemas["PostDocument"] = { data: postResource(post) };
    return render(body, { status: 201 });
  });

  api.route("Posts_update", { auth: "required" }, ({ principal, path, document }) => {
    const { id, attributes, relationships } = document.data;
    requireMatchingId(id, path.id);
    const cover = coverOf(relationships);
    const post = updatePost(state, principal, path.id, {
      ...attributes,
      ...(cover === undefined ? {} : { cover }),
    });
    const body: Schemas["PostDocument"] = { data: postResource(post) };
    return render(body);
  });

  api.route("Posts_delete", { auth: "required" }, ({ c, principal, path }) => {
    deletePost(state, principal, clientOf(c), path.id);
    return c.body(null, 204);
  });
}

export function postRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  readRoutes(api, config, state);
  writeRoutes(api, state);
}
