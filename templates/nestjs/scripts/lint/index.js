import noUnsafeRawSql from "./no-unsafe-raw-sql.js";
import prismaImportBoundary from "./prisma-import-boundary.js";
import noDirectEnv from "./no-direct-env.js";

export default {
  rules: {
    "no-unsafe-raw-sql": noUnsafeRawSql,
    "prisma-import-boundary": prismaImportBoundary,
    "no-direct-env": noDirectEnv,
  },
};
