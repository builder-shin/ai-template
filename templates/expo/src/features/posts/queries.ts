import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PostsApi, type PostDocument, type PostResource, type PostListInput } from "./api";
import { sessionQueryKey } from "../../lib/query/client";
import { useSession } from "../../lib/session";
import { locale } from "../../lib/i18n";
export interface PostScope {
  generation: number;
  locale: "ko" | "en";
}
export const postKeys = {
  all: (scope: PostScope) => [...sessionQueryKey(scope.generation, scope.locale), "posts"] as const,
  lists: (scope: PostScope) => [...postKeys.all(scope), "list"] as const,
  list: (scope: PostScope & PostListInput) =>
    [
      ...postKeys.lists(scope),
      {
        author: scope.author ?? null,
        page: scope.page ?? 1,
        size: scope.size ?? 20,
        status: scope.status ?? null,
        q: scope.q ?? "",
      },
    ] as const,
  detail: (scope: PostScope, id: string) => [...postKeys.all(scope), "detail", id] as const,
};
export function usePostScope() {
  const session = useSession(),
    { i18n } = useTranslation();
  return {
    ...session,
    api: new PostsApi(session.api),
    scope: { generation: session.state.generation, locale: locale(i18n.language) },
  };
}
export function usePosts(input: PostListInput) {
  const { api, state, scope } = usePostScope();
  return useQuery({
    queryKey: postKeys.list({ ...scope, ...input }),
    enabled: state.status !== "restoring",
    queryFn: ({ signal }) => api.list(input, signal),
  });
}
export function usePost(id: string | null) {
  const { api, state, scope } = usePostScope();
  return useQuery({
    queryKey: postKeys.detail(scope, id ?? "invalid"),
    enabled: !!id && state.status !== "restoring",
    queryFn: ({ signal }) => api.get(id!, signal),
  });
}
export function useInvalidatePosts() {
  const client = useQueryClient(),
    { scope } = usePostScope();
  return async (id?: string, removed = false) => {
    await client.invalidateQueries({ queryKey: postKeys.lists(scope) });
    if (id && removed) client.removeQueries({ queryKey: postKeys.detail(scope, id) });
    else if (id) await client.invalidateQueries({ queryKey: postKeys.detail(scope, id) });
  };
}
export function authorLabel(
  post: PostResource,
  included: PostDocument["included"],
  fallback: string,
): string {
  const author = included?.find(
    (item) => item.type === "users" && item.id === post.relationships.author.data?.id,
  );
  return author?.type === "users" ? (author.attributes.name ?? fallback) : fallback;
}
