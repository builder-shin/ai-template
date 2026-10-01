import "server-only";
import { cache } from "react";
import { createSessionApiClient } from "../../lib/api/session-client";
import { resolveIncluded } from "../../lib/api/jsonapi";
import { getPathname } from "../../lib/i18n/navigation";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { Profile } from "./state";

export const getProfile = cache(async (locale: "ko" | "en"): Promise<Profile> => {
  const client = await createSessionApiClient({ locale });
  try {
    const { data: document } = await client.GET("/me", {
      params: { query: { include: "avatar" } },
    });
    const user = document!.data;
    const avatar = resolveIncluded(document!, user.relationships.avatar.data);
    return {
      name: user.attributes.name,
      locale: user.attributes.locale,
      avatar: {
        id: user.relationships.avatar.data?.id ?? "",
        url: avatar?.meta?.downloadUrl ?? "",
      },
    };
  } catch (error) {
    redirectOnUnauthorized(error, getPathname({ locale, href: "/me" }));
    throw error;
  }
});
