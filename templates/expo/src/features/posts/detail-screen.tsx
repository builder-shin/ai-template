import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePost, authorLabel, usePostScope, useInvalidatePosts } from "./queries";
import { postId } from "./schemas";
import { useAccount } from "../account";
import { useSubmit } from "../../lib/forms/use-submit";
import { Screen } from "../../components/screen";
import { Text } from "../../components/text";
import { Button } from "../../components/button";
import { Spinner } from "../../components/spinner";
import { RequestError } from "../../components/request-state";
export function PostDetailScreen() {
  const params = useLocalSearchParams(),
    id = postId(params.id),
    query = usePost(id),
    me = useAccount();
  const { t } = useTranslation(),
    router = useRouter(),
    scope = usePostScope(),
    invalidate = useInvalidatePosts(),
    submit = useSubmit();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const post = query.data?.data;
  const canEdit =
    scope.state.status === "authenticated" &&
    !!me.data &&
    (post?.relationships.author.data?.id === me.data.data.id ||
      me.data.meta.permissions.includes("posts:manage"));
  async function changeStatus() {
    if (!post) return;
    const generation = scope.manager.generation();
    await submit.run(async () => {
      await scope.api.update(post!.id, {
        attributes: { status: post!.attributes.status === "draft" ? "published" : "draft" },
      });
      if (scope.manager.generation() === generation) await invalidate(post!.id);
    });
  }
  async function remove() {
    if (!post) return;
    const generation = scope.manager.generation();
    await submit.run(async () => {
      await scope.api.remove(post!.id);
      if (scope.manager.generation() !== generation) return;
      await invalidate(post!.id, true);
      if (scope.manager.generation() === generation) router.replace("/");
    });
  }
  return (
    <Screen>
      {!id ? (
        <Text accessibilityRole="alert">{t("notFound")}</Text>
      ) : query.isPending ? (
        <Spinner />
      ) : (
        <RequestError error={query.error} />
      )}
      {query.isError && (
        <Button
          title={t("retry")}
          onPress={() => {
            void query.refetch();
          }}
        />
      )}
      {post && (
        <>
          <Text accessibilityRole="header">{post.attributes.title}</Text>
          <Text>{authorLabel(post, query.data?.included, t("postUnknownAuthor"))}</Text>
          <Text>{t(post.attributes.status === "draft" ? "postDraft" : "postPublished")}</Text>
          <Text selectable>{post.attributes.body}</Text>
          {canEdit && (
            <>
              <Button
                title={t("postEdit")}
                disabled={submit.pending}
                onPress={() => router.push(`/posts/${post.id}/edit`)}
              />
              <Button
                title={t(post.attributes.status === "draft" ? "postPublish" : "postUnpublish")}
                pending={submit.pending}
                onPress={() => {
                  void changeStatus();
                }}
              />
              <Button
                title={t("postDelete")}
                disabled={submit.pending}
                onPress={() => setConfirmDelete(true)}
              />
              {confirmDelete && (
                <>
                  <Text accessibilityRole="alert">{t("postConfirmDelete")}</Text>
                  <Button
                    title={t("confirm")}
                    pending={submit.pending}
                    onPress={() => {
                      void remove();
                    }}
                  />
                  <Button
                    title={t("cancel")}
                    disabled={submit.pending}
                    onPress={() => setConfirmDelete(false)}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      <RequestError error={submit.error} />
      <Button title={t("posts")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
