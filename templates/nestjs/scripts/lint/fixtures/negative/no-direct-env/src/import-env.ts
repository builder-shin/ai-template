import { env } from "node:process";
import { env as legacyEnv } from "process";
export const values = [env.PORT, legacyEnv.PORT];
