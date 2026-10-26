import { useEffect, useRef } from "react";
import { useSession } from "./context";
import i18n from "../i18n";
export function validatedLocale(value: unknown): "ko" | "en" | null {
  return value === "ko" || value === "en" ? value : null;
}
export function SessionLocale() {
  const { state, manager, api } = useSession(),
    adopted = useRef<number>(-1);
  useEffect(() => {
    if (state.status !== "authenticated" || adopted.current === state.generation) return;
    const controller = new AbortController(),
      generation = state.generation;
    void api
      .GET("/me", { signal: controller.signal })
      .then(({ data }) => {
        const language = validatedLocale(data?.data.attributes.locale);
        if (language && !controller.signal.aborted && manager.generation() === generation) {
          adopted.current = generation;
          void i18n.changeLanguage(language);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [state.status, state.generation, api, manager]);
  return null;
}
