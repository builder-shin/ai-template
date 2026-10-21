export const apiFetchPolicy = { credentials: "omit", redirect: "error" } as const;
export type ApiFetch = (request: Request, policy: typeof apiFetchPolicy) => Promise<Response>;
/** The SDK transport honors redirect/credential policy discarded by native whatwg Request. */
export const nativeApiFetch: ApiFetch = async (request, policy) => {
  const { fetch } = await import("expo/fetch");
  return fetch(request, policy);
};
