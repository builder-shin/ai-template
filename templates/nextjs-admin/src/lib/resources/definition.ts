import "server-only";
import type { ComponentType } from "react";
import type { DisplayProps, InputProps } from "../../components/resource/types";
import type { FormResult } from "../api/errors";
import type { components } from "../api/schema";
import type {
  ContractOperation,
  FieldKey,
  FilterKey,
  ListQuery,
  RelationshipKey,
  ResourceRecord,
  ResourceType,
  SortKey,
  WriteAttributeKey,
  WriteRelationshipKey,
} from "./contract";

export type Permission = components["schemas"]["PermissionCode"];
export type InputKind = "text" | "textarea" | "enum" | "boolean";
export type FilterKind = "text" | "enum" | "relation" | "date";
export type DisplayKind =
  "text" | "textarea" | "date" | "enum" | "boolean" | "relation" | "relation-many" | "file";
export type FieldPresentation = {
  kind?: DisplayKind;
  values?: readonly string[];
  relation?: { type: string; label: string; search?: boolean };
  display?: ComponentType<DisplayProps>;
  input?: ComponentType<InputProps>;
};
export type ResourceForm<T extends ResourceType, M extends "create" | "edit"> = {
  permission: Permission;
  visible?: (record: ResourceRecord<T>) => boolean;
  fields: {
    readonly [K in WriteAttributeKey<T, M>]?: InputKind;
  } & {
    readonly [K in WriteRelationshipKey<T, M>]?: "relation" | "relation-many";
  };
};
export type ResourceAction<T extends ResourceType> = {
  name: string;
  permission: Permission;
  action: (id: string) => Promise<FormResult>;
  visible?: (record: ResourceRecord<T>) => boolean;
  confirmation?: boolean;
};
export type ResourceDefinition<T extends ResourceType> = {
  type: T;
  permission: Permission;
  fields?: Partial<Record<FieldKey<T>, FieldPresentation>>;
  list: {
    columns: readonly FieldKey<T>[];
    filters?: [FilterKey<T>] extends [never] ? never : Partial<Record<FilterKey<T>, FilterKind>>;
    sort?: "sort" extends keyof ListQuery<T>
      ? {
          fields: readonly SortKey<T>[];
          default?: SortKey<T> | `-${SortKey<T>}`;
        }
      : never;
    include?: "include" extends keyof ListQuery<T> ? readonly RelationshipKey<T>[] : never;
  };
  detail?: [ContractOperation<T, "detail">] extends [never]
    ? never
    : {
        fields: readonly FieldKey<T>[];
      };
  create?: [ContractOperation<T, "create">] extends [never] ? never : ResourceForm<T, "create">;
  edit?: [ContractOperation<T, "edit">] extends [never] ? never : ResourceForm<T, "edit">;
  delete?: [ContractOperation<T, "delete">] extends [never]
    ? never
    : { permission: Permission; visible?: (record: ResourceRecord<T>) => boolean };
  actions?: readonly ResourceAction<T>[];
  realtime?: { channel: components["schemas"]["RealtimeChannel"] };
};
export type AnyResource = { [T in ResourceType]: ResourceDefinition<T> }[ResourceType];

/** type만으로 계약을 고르고, 다른 선언에서 별도 type으로 추론을 넓히지 않는다. */
export function defineResource<const T extends ResourceType>(
  resource: { type: T } & ResourceDefinition<NoInfer<T>>,
): ResourceDefinition<T> {
  return resource;
}
