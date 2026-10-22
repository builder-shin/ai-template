export function deniedProviderCallback(endpoint, apiBaseUrl) {
  const request = new URL(endpoint),
    provider = /^\/(google|kakao|naver)\/authorize$/.exec(request.pathname)?.[1],
    states = request.searchParams.getAll("state"),
    redirects = request.searchParams.getAll("redirect_uri");
  const expected = `${apiBaseUrl.replace(/\/$/, "")}/oauth/${provider}/callback`;
  if (
    !provider ||
    request.username ||
    request.password ||
    request.hash ||
    states.length !== 1 ||
    !states[0] ||
    states[0].length > 4096 ||
    redirects.length !== 1 ||
    redirects[0] !== expected
  )
    throw new Error(
      "Owned denial must preserve the current provider state and exact API callback.",
    );
  const callback = new URL(expected);
  callback.searchParams.set("state", states[0]);
  callback.searchParams.set("error", "access_denied");
  return callback.href;
}
export async function completeProviderRequest(
  endpoint,
  { target, denied, apiBaseUrl, username, claims, signal },
) {
  signal?.throwIfAborted();
  // Navikt 6.0.3 has no denial form. Use the same protocol callback as the web adapter.
  if (denied && target !== "mock") return deniedProviderCallback(endpoint, apiBaseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
    body: new URLSearchParams(
      denied ? { error: "access_denied" } : { username, claims: JSON.stringify(claims) },
    ),
  });
  const location = response.headers.get("location");
  if (response.status !== 302 || !location)
    throw new Error("Owned OAuth provider did not redirect.");
  return location;
}
