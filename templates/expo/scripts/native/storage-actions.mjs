export function storageActions({ storage, proxy, jsonRequest, token }) {
  const account = async () => {
    const me = await jsonRequest("/me?include=avatar", "GET", undefined, await token());
    if (me.data.relationships.avatar.data !== null)
      throw new Error("Failed storage must not attach an avatar.");
  };
  return {
    "storage-unavailable": async () => {
      await account();
      await storage.suspend();
      return { apiReachable: true };
    },
    "inspect-storage-failure": async () => {
      await account();
      if (proxy.storageFallbackCount() !== 0)
        throw new Error("The signed storage host must not fall back to the API.");
      return { ok: true, apiReachable: true };
    },
    "storage-available": async () => {
      await storage.resume();
      return { ok: true };
    },
  };
}
