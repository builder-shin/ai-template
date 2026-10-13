import { environment } from "#child-env";
export const secret = environment().JWT_SECRET;
