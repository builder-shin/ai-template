import "server-only";
import { defineResource } from "../../lib/resources/definition";

export default defineResource({
  type: "permissions",
  permission: "roles:read",
  list: { columns: ["id", "group", "description"] },
});
