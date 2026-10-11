import { Injectable } from "@nestjs/common";
import { PermissionRegistry } from "./permissions.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { paginationLinks } from "../../core/jsonapi/pagination.js";
import { applySparseFields } from "../../core/jsonapi/fields.js";
@Injectable()
export class PermissionService {
  constructor(private readonly registry: PermissionRegistry) {}
  list(query: ParsedQuery) {
    const all = [...this.registry.list()];
    if (query.sort[0]?.descending) all.reverse();
    const offset = (query.page.number - 1) * query.page.size;
    return applySparseFields(
      {
        data: all.slice(offset, offset + query.page.size).map((p) => ({
          type: "permissions",
          id: p.code,
          attributes: { description: p.description, group: p.group },
        })),
        ...paginationLinks("/api/v1/permissions", query.raw, query.page, all.length),
      },
      query.fields,
    );
  }
}
