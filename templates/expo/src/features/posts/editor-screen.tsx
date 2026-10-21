import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Switch } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PostCreateInput, PostResource, PostDocument } from "./api";
import { PostCoverField } from "./cover-field";
import { relatedFile, type FileResource } from "../../lib/upload";
import { useSession } from "../../lib/session";
import { ApiError } from "../../lib/api/errors";
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
  children,
  disabled = false,
}: {
  initial?: PostResource;
  save: (input: PostCreateInput) => Promise<void>;
  children?: (pending: boolean) => ReactNode;
  disabled?: boolean;
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
  const send = form.handleSubmit((attributes) => {
    if (!disabled) return submit.run(() => save({ attributes }));
  });
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
                editable={!submit.pending && !disabled}
                autoCapitalize="none"
                autoCorrect={false}
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
            disabled={submit.pending || disabled}
            onValueChange={(value) => field.onChange(value ? "published" : "draft")}
          />
        )}
      />
      {children?.(submit.pending)}
      <RequestError error={submit.error} />
      <Button
        title={t("save")}
        pending={submit.pending}
        disabled={disabled}
        onPress={() => {
          void send();
        }}
      />
    </>
  );
}
function CoverEditor({
  initial,
  save,
}: {
  initial?: PostDocument;
  save(input: PostCreateInput, committed: () => void): Promise<void>;
}) {
  const { api, manager } = useSession(),
    generation = useRef(manager.generation()).current;
  const original = initial?.data.relationships.coverImage.data?.id;
  const [cover, setCover] = useState<FileResource | null>(() =>
    relatedFile(initial?.included, original),
  );
  const [dirty, setDirty] = useState(false),
    [uploading, setUploading] = useState(false);
  const created = useRef(new Set<string>()),
    uncertain = useRef(new Set<string>());
  function discard(id: string) {
    if (generation === manager.generation() && manager.credentials())
      void api
        .DELETE("/files/{id}", { params: { path: { id } }, signal: AbortSignal.timeout(10000) })
        .catch(() => undefined);
  }
  useEffect(
    () => () => {
      for (const id of created.current)
        if (
          !uncertain.current.has(id) &&
          generation === manager.generation() &&
          manager.credentials()
        )
          void api
            .DELETE("/files/{id}", { params: { path: { id } }, signal: AbortSignal.timeout(10000) })
            .catch(() => undefined);
    },
    [api, manager, generation],
  );
  async function change(file: FileResource | null) {
    if (generation !== manager.generation())
      throw new DOMException("Account changed.", "AbortError");
    if (
      cover &&
      cover.id !== file?.id &&
      created.current.has(cover.id) &&
      !uncertain.current.has(cover.id)
    ) {
      created.current.delete(cover.id);
      discard(cover.id);
    }
    if (file && file.id !== original) created.current.add(file.id);
    setCover(file);
    setDirty(true);
  }
  async function send(input: PostCreateInput) {
    const id = cover?.id;
    // Once a write starts, a lost acknowledgement may still mean the file was attached.
    if (id && created.current.has(id)) uncertain.current.add(id);
    try {
      await save(
        {
          ...input,
          ...(dirty
            ? {
                relationships: {
                  ...input.relationships,
                  coverImage: { data: id ? { type: "files" as const, id } : null },
                },
              }
            : {}),
        },
        () => {
          if (id) {
            created.current.delete(id);
            uncertain.current.delete(id);
          }
        },
      );
    } catch (error) {
      if (id && error instanceof ApiError && error.status < 500) uncertain.current.delete(id);
      throw error;
    }
  }
  return (
    <PostForm {...(initial ? { initial: initial.data } : {})} save={send} disabled={uploading}>
      {(pending) => (
        <PostCoverField
          value={cover}
          onChange={change}
          disabled={pending}
          onPendingChange={setUploading}
        />
      )}
    </PostForm>
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
  async function save(input: PostCreateInput, committed: () => void) {
    const generation = scope.manager.generation();
    const result =
      editing && id ? await scope.api.update(id, input) : await scope.api.create(input);
    if (generation !== scope.manager.generation())
      throw new DOMException("Account changed.", "AbortError");
    committed();
    await invalidate(result.data.id);
    if (generation === scope.manager.generation()) router.replace(`/posts/${result.data.id}`);
  }
  return (
    <Screen>
      <Text accessibilityRole="header">{t(editing ? "postEdit" : "postNew")}</Text>
      {editing && query.isError && query.data && !scope.state.networkError && (
        <>
          <RequestError error={query.error} />
          <Button
            title={t("retry")}
            onPress={() => {
              void query.refetch();
            }}
          />
        </>
      )}
      {editing && !id ? (
        <Text accessibilityRole="alert">{t("notFound")}</Text>
      ) : editing && query.isPending ? (
        <Spinner />
      ) : editing && query.isError && !query.data ? (
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
        <CoverEditor
          key={`${scope.state.generation}:${id ?? "new"}`}
          {...(query.data ? { initial: query.data } : {})}
          save={save}
        />
      )}
      <Button title={t("cancel")} onPress={() => router.replace(id ? `/posts/${id}` : "/")} />
    </Screen>
  );
}
