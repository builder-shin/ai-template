import "server-only";
import type { ApiPaths } from "../api/paths";

type Method = "get" | "post" | "patch" | "delete";
export type ResourceOperation = "list" | "detail" | "create" | "edit" | "delete";
type At<P extends string, M extends Method> = P extends keyof ApiPaths
  ? NonNullable<ApiPaths[P][M]>
  : never;
type JsonContent<Response> = Response extends {
  content: { "application/vnd.api+json": infer Document };
}
  ? Document
  : never;
type Success<Operation> = Operation extends { responses: infer Responses }
  ? JsonContent<Responses[Extract<keyof Responses, 200 | 201>]>
  : never;

/** 단일 컬렉션 경로와 응답의 JSON:API type이 일치하는 리소스만 선언한다. */
export type ResourceType = {
  [P in keyof ApiPaths]: P extends `/${infer T}`
    ? T extends `${string}/${string}`
      ? never
      : [Success<At<P, "get">>] extends [never]
        ? never
        : Success<At<P, "get">> extends {
              data: readonly { type: T; id: string; attributes: object }[];
            }
          ? T
          : never
    : never;
}[keyof ApiPaths];

export type ContractOperation<
  T extends ResourceType,
  M extends ResourceOperation,
> = M extends "list"
  ? At<`/${T}`, "get">
  : M extends "create"
    ? At<`/${T}`, "post">
    : At<`/${T}/{id}`, M extends "detail" ? "get" : M extends "edit" ? "patch" : "delete">;
export type ResourceDocument<T extends ResourceType, M extends ResourceOperation> = Success<
  ContractOperation<T, M>
>;
export type ResourceRecord<T extends ResourceType> =
  ResourceDocument<T, "list"> extends {
    data: readonly (infer R)[];
  }
    ? R
    : never;
type Attributes<R> = R extends { attributes?: infer A } ? NonNullable<A> : object;
type Relationships<R> = R extends { relationships?: infer A } ? NonNullable<A> : object;
export type AttributeKey<T extends ResourceType> = Extract<
  keyof Attributes<ResourceRecord<T>>,
  string
>;
export type RelationshipKey<T extends ResourceType> = Extract<
  keyof Relationships<ResourceRecord<T>>,
  string
>;
export type FieldKey<T extends ResourceType> = AttributeKey<T> | RelationshipKey<T>;
export type ListQuery<T extends ResourceType> =
  ContractOperation<T, "list"> extends {
    parameters: { query?: infer Q };
  }
    ? NonNullable<Q>
    : never;
export type FilterKey<T extends ResourceType> = Extract<keyof ListQuery<T>, `filter[${string}]`>;

// 현재 생성 타입의 sort는 string이다. 확장 값이 리터럴이면 쓰고, 아니면 속성 키로 제한한다.
type StripMinus<S extends string> = S extends `-${infer Key}` ? Key : S;
export type SortKey<T extends ResourceType> =
  ListQuery<T> extends { sort?: infer S }
    ? string extends S
      ? AttributeKey<T>
      : StripMinus<Extract<S, string>>
    : never;
type Body<Operation> = Operation extends {
  requestBody: { content: { "application/vnd.api+json": infer D } };
}
  ? D
  : never;
export type WriteDocument<T extends ResourceType, M extends "create" | "edit"> = Body<
  ContractOperation<T, M>
>;
type WriteData<T extends ResourceType, M extends "create" | "edit"> =
  WriteDocument<T, M> extends { data: infer D } ? D : never;
export type WriteAttributeKey<T extends ResourceType, M extends "create" | "edit"> = Extract<
  keyof Attributes<WriteData<T, M>>,
  string
>;
export type WriteRelationshipKey<T extends ResourceType, M extends "create" | "edit"> = Extract<
  keyof Relationships<WriteData<T, M>>,
  string
>;
type RelationshipValues<R> = {
  [K in keyof R]: NonNullable<R[K]> extends { data: infer D } ? D : never;
};
export type WriteValues<T extends ResourceType, M extends "create" | "edit"> = [
  WriteDocument<T, M>,
] extends [never]
  ? never
  : Partial<Attributes<WriteData<T, M>> & RelationshipValues<Relationships<WriteData<T, M>>>>;
