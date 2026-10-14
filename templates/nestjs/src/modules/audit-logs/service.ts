import { Inject, Injectable } from "@nestjs/common";
import { UnitOfWork, type Tx } from "../../core/db/unit-of-work.js";
import { IncludeRegistry } from "../../core/jsonapi/include.js";
import {
  collectionDocument,
  sparseResource,
  type ResourceObject,
} from "../../core/jsonapi/document.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
import { AuditLogsRepository } from "./repository.js";
@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(AuditLogsRepository) private readonly repository: AuditLogsRepository,
    @Inject(IncludeRegistry) private readonly includes: IncludeRegistry,
  ) {}
  async list(principal: Principal, query: ParsedQuery, search: string) {
    const { createdFrom, createdTo } = query.filter;
    if (
      typeof createdFrom === "string" &&
      typeof createdTo === "string" &&
      new Date(createdFrom) > new Date(createdTo)
    )
      throw new ApiError({
        status: 400,
        code: "jsonapi.invalid_query",
        title: "기간 시작은 종료보다 늦을 수 없다",
        source: { parameter: "filter[createdFrom]" },
      });
    return this.unit.run(async (tx) => {
      const { rows, total } = await this.repository.list(tx, query);
      const primary = rows.map((r) => this.repository.resource(r));
      const included = await this.included(tx, principal, primary, query);
      return collectionDocument(
        primary.map((r) => sparseResource(r, query.fields["audit-logs"])),
        {
          total,
          page: query.page,
          path: "/api/v1/audit-logs",
          search,
          ...(included === undefined ? {} : { included }),
        },
      );
    });
  }
  get(principal: Principal, id: string, query: ParsedQuery) {
    return this.unit.run(async (tx) => {
      const row = await this.repository.find(tx, id);
      if (!row)
        throw new ApiError({ status: 404, code: "resource.not_found", title: "감사 로그가 없다" });
      const data = this.repository.resource(row);
      const included = await this.included(tx, principal, [data], query);
      return {
        data: sparseResource(data, query.fields["audit-logs"]),
        ...(included === undefined ? {} : { included }),
      };
    });
  }
  private async included(
    tx: Tx,
    principal: Principal,
    primary: ResourceObject[],
    query: ParsedQuery,
  ) {
    if (!query.include.length) return undefined;
    return (await this.includes.load(tx, query.include, primary, principal)).map((r) =>
      sparseResource(r, query.fields[r.type]),
    );
  }
}
