import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import type { createApiClient } from "../api/client";
import type { SessionManager } from "../session/manager";
import { createUploader } from "./core";
import { DisplayError } from "../forms/errors";
export function createNativeUploader(
  api: ReturnType<typeof createApiClient>,
  session: SessionManager,
) {
  return createUploader({
    api,
    session,
    release: !__DEV__,
    put: fetch,
    prepare: async (file) => {
      const local = new File(file.uri);
      if (!local.exists) throw new DisplayError("invalidImage");
      return { body: local, size: local.size };
    },
  });
}
