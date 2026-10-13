import { environment } from "../../../../scripts/child-environment.mjs";
export const secret = environment().JWT_SECRET;
