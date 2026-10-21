import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AccountApi } from "./api";
import { useSession } from "../../lib/session";
import { sessionQueryKey } from "../../lib/query/client";
import { locale } from "../../lib/i18n";
export function useAccount() {
  const { state, api } = useSession(),
    { i18n } = useTranslation();
  return useQuery({
    queryKey: [...sessionQueryKey(state.generation, locale(i18n.language)), "me"],
    enabled: state.status === "authenticated",
    queryFn: ({ signal }) => new AccountApi(api).me(signal),
  });
}
