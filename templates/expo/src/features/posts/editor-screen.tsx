import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Switch } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import type { PostCreateInput, PostResource } from "./api";
import { postSchema, postId } from "./schemas";
import { usePost, usePostScope, useInvalidatePosts } from "./queries";
import { useSubmit } from "../../lib/forms/use-submit";
import { fieldError } from "../../lib/forms/errors";
import { Screen } from "../../components/screen";
import { Field } from "../../components/field";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { RequestError } from "../../components/request-state";
import { Spinner } from "../../components/spinner";

export function PostForm({
  initial,
  save,
}: {
  initial?: PostResource;
  save: (input: PostCreateInput) => Promise<void>;
}) {
  const { t } = useTranslation(),
    submit = useSubmit();
  const form = useForm<z.infer<typeof postSchema>>({
    resolver: zodResolver(postSchema),
    defaultValues: initial
      ? {
          title: initial.attributes.title,
          body: initial.attributes.body,
          status: initial.attributes.status,
        }
      : { title: "", body: "", status: "draft" },
  });
  const send = form.handleSubmit((attributes) => submit.run(() => save({ attributes })));
  return (
    <>
      {(["title", "body"] as const).map((name) => {
        const remote = fieldError(submit.error, name),
          error = form.formState.errors[name];
        return (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <Field
                label={t(name === "title" ? "postTitle" : "postBody")}
                value={field.value}
                onChangeText={field.onChange}
                ref={field.ref}
                onBlur={field.onBlur}
                error={
                  remote
                    ? t(remote)
                    : error
                      ? t(name === "title" ? "postTitleLength" : "postBodyLength")
                      : undefined
                }
                editable={!submit.pending}
                multiline={name === "body"}
                style={name === "body" ? { minHeight: 180, textAlignVertical: "top" } : {}}
                returnKeyType={name === "title" ? "next" : "default"}
                onSubmitEditing={() => {
                  if (name === "title") form.setFocus("body");
                }}
              />
            )}
          />
        );
      })}
      <Text>{t("postPublished")}</Text>
      <Controller
        control={form.control}
        name="status"
        render={({ field }) => (
          <Switch
            accessibilityLabel={t("postPublished")}
            accessibilityRole="switch"
            value={field.value === "published"}
            disabled={submit.pending}
            onValueChange={(value) => field.onChange(value ? "published" : "draft")}
          />
        )}
      />
      <RequestError error={submit.error} />
      <Button
        title={t("save")}
        pending={submit.pending}
        onPress={() => {
          void send();
        }}
      />
    </>
  );
}
export function PostEditorScreen() {
  const params = useLocalSearchParams(),
    id = postId(params.id),
    editing = params.id !== undefined;
  const query = usePost(editing ? id : null),
    scope = usePostScope(),
    invalidate = useInvalidatePosts(),
    router = useRouter(),
    { t } = useTranslation();
  async function save(input: PostCreateInput) {
    const generation = scope.manager.generation();
    const result =
      editing && id ? await scope.api.update(id, input) : await scope.api.create(input);
    if (generation !== scope.manager.generation()) return;
    await invalidate(result.data.id);
    if (generation === scope.manager.generation()) router.replace(`/posts/${result.data.id}`);
  }
  return (
    <Screen>
      <Text accessibilityRole="header">{t(editing ? "postEdit" : "postNew")}</Text>
      {editing && !id ? (
        <Text accessibilityRole="alert">{t("notFound")}</Text>
      ) : editing && query.isPending ? (
        <Spinner />
      ) : editing && query.isError ? (
        <>
          <RequestError error={query.error} />
          <Button
            title={t("retry")}
            onPress={() => {
              void query.refetch();
            }}
          />
        </>
      ) : (
        <PostForm
          key={`${scope.state.generation}:${id ?? "new"}`}
          {...(query.data ? { initial: query.data.data } : {})}
          save={save}
        />
      )}
      <Button title={t("cancel")} onPress={() => router.replace(id ? `/posts/${id}` : "/")} />
    </Screen>
  );
}
