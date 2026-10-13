import { Injectable } from "@nestjs/common";
import { PERMISSION_CODES } from "../../core/security/permissions.js";
import {
  collectionDocument,
  resourceObject,
  type CollectionDocument,
} from "../../core/jsonapi/document.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { permissionAttributes } from "./permissions.js";
@Injectable()
export class RolesService {
  permissions(query: ParsedQuery, search: string): CollectionDocument {
    const codes = [...PERMISSION_CODES].sort();
    if (query.sort[0]?.descending) codes.reverse();
    const offset = (query.page.number - 1) * query.page.size;
    const data = codes.slice(offset, offset + query.page.size).map((code) => {
      const attributes = permissionAttributes(code);
      const fields = query.fields.permissions;
      return resourceObject(
        "permissions",
        code,
        fields === undefined
          ? attributes
          : Object.fromEntries(Object.entries(attributes).filter(([key]) => fields.includes(key))),
      );
    });
    return collectionDocument(data, {
      total: codes.length,
      page: query.page,
      path: "/api/v1/permissions",
      search,
    });
  }
}
