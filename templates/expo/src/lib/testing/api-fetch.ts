import type { ApiFetch } from "../api/fetch";
/** Test networking remains real Node HTTP; callers can still observe/hold global fetch. */
export const nodeApiFetch: ApiFetch = (request, policy) => globalThis.fetch(request, policy);
