import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/errors";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, error) =>
          count < 1 && error.name !== "AbortError" && !(error instanceof ApiError),
      },
      mutations: { retry: false },
    },
  });
}
export function sessionQueryKey(generation: number, locale: "ko" | "en"): readonly unknown[] {
  return ["session", generation, locale] as const;
}
