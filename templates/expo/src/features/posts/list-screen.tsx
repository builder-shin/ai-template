import { useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePosts, authorLabel, usePostScope } from "./queries";
import { useAccount } from "../account";
import { AuthNavigation } from "../auth";
import { Screen } from "../../components/screen";
import { Text } from "../../components/text";
import { Button } from "../../components/button";
import { Spinner } from "../../components/spinner";
import { RequestError } from "../../components/request-state";
import { FeatureLinks } from "../../components/feature-links";
import { LanguagePicker } from "../../components/language-picker";
export function PostsListScreen() {
  const { t } = useTranslation(),
    router = useRouter(),
    { state } = usePostScope();
  const me = useAccount(),
    [mine, setMine] = useState(false),
    [page, setPage] = useState(1);
  const author = mine && state.status === "authenticated" ? me.data?.data.id : undefined;
  const query = usePosts({ page, ...(author ? { author } : {}) });
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("posts")}</Text>
      <FeatureLinks />
      {state.status === "restoring" ? (
        <Spinner />
      ) : state.status === "authenticated" ? (
        <>
          <Button title={t("sessions")} onPress={() => router.push("/me/sessions")} />
          <Button title={t("account")} onPress={() => router.push("/me")} />
          {me.data?.meta.permissions.includes("posts:create") && (
            <Button title={t("postNew")} onPress={() => router.push("/posts/new")} />
          )}
          <Button
            title={t(author ? "postAll" : "postMine")}
            disabled={!me.data}
            onPress={() => {
              setMine(!mine);
              setPage(1);
            }}
          />
        </>
      ) : (
        <AuthNavigation />
      )}
      <RequestError error={query.error} />
      {query.isPending ? <Spinner /> : null}
      {query.data?.data.length === 0 && <Text>{t("empty")}</Text>}
      {query.data?.data.map((post) => (
        <PostListItem
          key={post.id}
          title={post.attributes.title}
          author={authorLabel(post, query.data.included, t("postUnknownAuthor"))}
          status={post.attributes.status}
          open={() => router.push(`/posts/${post.id}`)}
        />
      ))}
      <Button
        title={t("postRefresh")}
        pending={query.isFetching}
        onPress={() => {
          void query.refetch();
        }}
      />
      <Button
        title={t("previous")}
        disabled={page === 1 || query.isFetching}
        onPress={() => setPage(page - 1)}
      />
      <Button
        title={t("next")}
        disabled={!query.data?.links.next || query.isFetching}
        onPress={() => setPage(page + 1)}
      />
    </Screen>
  );
}
function PostListItem({
  title,
  author,
  status,
  open,
}: {
  title: string;
  author: string;
  status: "draft" | "published";
  open: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Button title={title} onPress={open} />
      <Text>{author}</Text>
      <Text>{t(status === "draft" ? "postDraft" : "postPublished")}</Text>
    </>
  );
}
