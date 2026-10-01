import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createApiClient } from "../../lib/api/client";
import { ApiError } from "../../lib/api/errors";
import { buildQuery, resolveIncluded } from "../../lib/api/jsonapi";
import type { components } from "../../lib/api/schema";
import { getEnv } from "../../lib/env";
import { createSessionApiClient } from "../../lib/api/session-client";
import { getPathname } from "../../lib/i18n/navigation";
import { redirectOnUnauthorized } from "../../lib/session/request";
import { postSorts, type Post, type PostSort, type MyPost, type MyPostStatus } from "./model";

type Schemas = components["schemas"];
type Locale = Schemas["Locale"];

function publicClient(locale: Locale) {
  // 공개 화면에서는 로그인한 작성자에게도 초안을 보여 주지 않는다.
  return createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
}

function view(
  document: Schemas["PostDocument"] | Schemas["PostCollectionDocument"],
  post: Schemas["PostResource"],
): Post {
  const author = resolveIncluded(document, post.relationships.author.data);
  const cover = resolveIncluded(document, post.relationships.coverImage.data);
  return {
    id: post.id,
    title: post.attributes.title,
    body: post.attributes.body,
    authorName: author?.attributes.name ?? null,
    coverUrl: cover?.meta?.downloadUrl ?? null,
    publishedAt: post.attributes.publishedAt,
  };
}

// cache는 요청 안에서만 같은 인자의 조회를 묶는다. 인자는 모두 원시값이다.
export const getPosts = cache(
  async (locale: Locale, q = "", sort: PostSort = "latest", page = 1, size = 10) => {
    const { data } = await publicClient(locale).GET("/posts", {
      params: {
        query: buildQuery("/posts", {
          filter: { status: "published", q },
          sort: postSorts[sort],
          include: ["author", "coverImage"],
          page: { number: page, size },
        }),
      },
    });
    if (!data) throw new Error("글 목록 응답이 없다.");
    return {
      posts: data.data.map((post) => view(data, post)),
      links: data.links,
      page: data.meta.page,
    };
  },
);

export const getPost = cache(async (locale: Locale, id: string): Promise<Post | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  try {
    const { data } = await publicClient(locale).GET("/posts/{id}", {
      params: { path: { id }, query: { include: "author,coverImage" } },
    });
    if (!data) throw new Error("글 상세 응답이 없다.");
    return data.data.attributes.status === "published" ? view(data, data.data) : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

export const getMyPosts = cache(
  async (locale: Locale, status: MyPostStatus = "all", page = 1, size = 10) => {
    const client = await createSessionApiClient({ locale });
    try {
      const { data: me } = await client.GET("/me");
      const { data } = await client.GET("/posts", {
        params: {
          query: buildQuery("/posts", {
            filter: { author: me!.data.id, ...(status === "all" ? {} : { status }) },
            sort: "-createdAt",
            include: ["author", "coverImage"],
            page: { number: page, size },
          }),
        },
      });
      if (!data) throw new Error("내 글 목록 응답이 없다.");
      return {
        posts: data.data.map((post): MyPost => ({
          ...view(data, post),
          status: post.attributes.status,
        })),
        links: data.links,
        page: data.meta.page,
      };
    } catch (error) {
      redirectOnUnauthorized(error, getPathname({ locale, href: "/my-posts" }));
      throw error;
    }
  },
);

export const getMyPost = cache(async (locale: Locale, id: string): Promise<MyPost | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  const client = await createSessionApiClient({ locale });
  try {
    const { data: me } = await client.GET("/me");
    const { data } = await client.GET("/posts/{id}", {
      params: { path: { id }, query: { include: "author,coverImage" } },
    });
    if (!data) throw new Error("내 글 상세 응답이 없다.");
    // 관리 권한이 있어도 내 글 화면에는 본인의 글만 둔다.
    if (data.data.relationships.author.data?.id !== me!.data.id) return null;
    return { ...view(data, data.data), status: data.data.attributes.status };
  } catch (error) {
    redirectOnUnauthorized(error, getPathname({ locale, href: `/my-posts/${id}/edit` }));
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
