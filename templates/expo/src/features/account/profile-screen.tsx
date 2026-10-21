import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { AccountApi } from "./api";
import { useAccount } from "./queries";
import { AvatarField } from "./avatar-field";
import { useSession } from "../../lib/session";
import { validatedLocale } from "../../lib/session/locale";
import { locale } from "../../lib/i18n";
import { sessionQueryKey } from "../../lib/query/client";
import { relatedFile, type FileResource } from "../../lib/upload";
import { useSubmit } from "../../lib/forms/use-submit";
import { DisplayError, fieldError } from "../../lib/forms/errors";
import type { components } from "../../lib/api/generated/schema";
import { Screen } from "../../components/screen";
import { Field } from "../../components/field";
import { Text } from "../../components/text";
import { Button } from "../../components/button";
import { Spinner } from "../../components/spinner";
import { RequestError } from "../../components/request-state";
const schema = z.object({
  name: z.string().trim().min(1, "invalidField").max(100, "invalidField"),
  locale: z.enum(["ko", "en"]),
});
type Values = z.infer<typeof schema>;
function ProfileForm({
  user,
  save,
}: {
  user: components["schemas"]["UserResource"];
  save(values: Values): Promise<void>;
}) {
  const { t, i18n } = useTranslation(),
    submit = useSubmit();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.attributes.name ?? "",
      locale: validatedLocale(user.attributes.locale) ?? locale(i18n.language),
    },
  });
  const send = form.handleSubmit((values) => submit.run(() => save(values)));
  const remote = fieldError(submit.error, "name");
  return (
    <>
      <Text>{user.attributes.email ?? t("emailUnavailable")}</Text>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <Field
            label={t("name")}
            value={field.value}
            ref={field.ref}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            editable={!submit.pending}
            returnKeyType="done"
            onSubmitEditing={() => {
              void send();
            }}
            error={remote ? t(remote) : form.formState.errors.name ? t("invalidField") : undefined}
          />
        )}
      />
      <Text>{t("language")}</Text>
      <Controller
        control={form.control}
        name="locale"
        render={({ field }) => (
          <>
            <Button title="한국어" disabled={submit.pending} onPress={() => field.onChange("ko")} />
            <Button
              title="English"
              disabled={submit.pending}
              onPress={() => field.onChange("en")}
            />
            <Text>{field.value === "ko" ? "한국어" : "English"}</Text>
          </>
        )}
      />
      <RequestError error={submit.error} />
      {submit.succeeded && <Text accessibilityRole="alert">{t("saved")}</Text>}
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
export function ProfileScreen() {
  const scope = useSession(),
    query = useAccount(),
    client = useQueryClient(),
    router = useRouter(),
    { t, i18n } = useTranslation();
  const api = new AccountApi(scope.api);
  async function update(
    input: Pick<
      components["schemas"]["UserMeUpdateDocument"]["data"],
      "attributes" | "relationships"
    >,
  ) {
    const generation = scope.manager.generation(),
      user = query.data?.data;
    if (!user) throw new DisplayError("error");
    try {
      const result = await api.update(user.id, input);
      if (generation !== scope.manager.generation())
        throw new DOMException("Account changed.", "AbortError");
      const language = validatedLocale(result.data.attributes.locale);
      if (!language) throw new DisplayError("error");
      client.setQueryData([...sessionQueryKey(generation, language), "me"], result);
      await i18n.changeLanguage(language);
    } finally {
      if (generation === scope.manager.generation())
        await client.invalidateQueries({
          predicate: (item) =>
            item.queryKey[0] === "session" &&
            item.queryKey[1] === generation &&
            item.queryKey[3] === "me",
        });
    }
  }
  async function avatar(file: FileResource | null) {
    await update({
      relationships: { avatar: { data: file ? { type: "files", id: file.id } : null } },
    });
  }
  return (
    <Screen>
      <Text accessibilityRole="header">{t("account")}</Text>
      {query.isPending ? <Spinner /> : <RequestError error={query.error} />}
      {query.isError && (
        <Button
          title={t("retry")}
          onPress={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && (
        <>
          <ProfileForm
            key={`${scope.state.generation}:${query.data.data.id}`}
            user={query.data.data}
            save={(attributes) => update({ attributes })}
          />
          <AvatarField
            value={relatedFile(query.data.included, query.data.data.relationships.avatar.data?.id)}
            onChange={avatar}
          />
        </>
      )}
      <Button title={t("sessions")} onPress={() => router.push("/me/sessions")} />
      <Button title={t("posts")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
