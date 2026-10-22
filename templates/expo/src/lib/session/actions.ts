export async function endSession(scope: {
  oauth: { cancel(): Promise<void> };
  manager: { signOut(): Promise<void> };
}): Promise<void> {
  // Both operations start even if one fails. Wait for both before callers navigate.
  const results = await Promise.allSettled([scope.oauth.cancel(), scope.manager.signOut()]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
