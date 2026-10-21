import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AccountApi } from "./api";
import { useSession, endSession } from "../../lib/session";
import { sessionQueryKey } from "../../lib/query/client";
import { locale } from "../../lib/i18n";
import { useSubmit } from "../../lib/forms/use-submit";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { Spinner } from "../../components/spinner";
import { RequestError } from "../../components/request-state";

export function SessionsScreen() {
  const scope = useSession(),
    { t, i18n } = useTranslation(),
    router = useRouter();
  const queryClient = useQueryClient(),
    submit = useSubmit();
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<
    { kind: "one"; id: string; current: boolean } | { kind: "others" | "all" }
  >();
  const api = new AccountApi(scope.api);
  const prefix = [...sessionQueryKey(scope.state.generation, locale(i18n.language)), "sessions"];
  const query = useQuery({
    queryKey: [...prefix, page],
    enabled: scope.state.status === "authenticated",
    queryFn: ({ signal }) => api.sessions(page, signal),
  });
  async function revoke() {
    const target = confirmation;
    if (!target) return;
    const generation = scope.manager.generation();
    await submit.run(async () => {
      if (target.kind === "one") await api.revoke(target.id);
      else if (target.kind === "others") await api.revokeOthers();
      else await api.revokeAll();
      if (generation !== scope.manager.generation()) return;
      setConfirmation(undefined);
      if (target.kind === "all" || (target.kind === "one" && target.current)) {
        await endSession(scope);
        router.replace("/login");
      } else await queryClient.invalidateQueries({ queryKey: prefix });
    });
  }
  return (
    <Screen>
      <Text accessibilityRole="header">{t("sessions")}</Text>
      <RequestError error={query.error} />
      {query.isPending ? <Spinner /> : null}
      {query.isError && (
        <Button
          title={t("retry")}
          onPress={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data?.data.length === 0 && <Text>{t("empty")}</Text>}
      {query.data?.data.map((item) => (
        <SessionRow
          key={item.id}
          label={item.attributes.userAgent ?? t("unknownDevice")}
          current={item.attributes.current}
          date={item.attributes.lastUsedAt}
          disabled={submit.pending}
          onRevoke={() =>
            setConfirmation({ kind: "one", id: item.id, current: item.attributes.current })
          }
        />
      ))}
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
      <Button
        title={t("revokeOthers")}
        disabled={submit.pending}
        onPress={() => setConfirmation({ kind: "others" })}
      />
      <Button
        title={t("revokeAll")}
        disabled={submit.pending}
        onPress={() => setConfirmation({ kind: "all" })}
      />
      {confirmation && (
        <>
          <Text accessibilityRole="alert">{t("confirmRevoke")}</Text>
          <Button
            title={t("confirm")}
            pending={submit.pending}
            onPress={() => {
              void revoke();
            }}
          />
          <Button
            title={t("cancel")}
            disabled={submit.pending}
            onPress={() => setConfirmation(undefined)}
          />
        </>
      )}
      <RequestError error={submit.error} />
      <Button
        title={t("logout")}
        pending={submit.pending}
        onPress={() => {
          void submit.run(async () => {
            await endSession(scope);
            router.replace("/login");
          });
        }}
      />
    </Screen>
  );
}
function SessionRow({
  label,
  current,
  date,
  disabled,
  onRevoke,
}: {
  label: string;
  current: boolean;
  date: string;
  disabled: boolean;
  onRevoke: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Text>{label}</Text>
      {current && <Text>{t("currentSession")}</Text>}
      <Text>{new Date(date).toLocaleString(i18n.language)}</Text>
      <Button title={t("revokeSession")} disabled={disabled} onPress={onRevoke} />
    </>
  );
}
