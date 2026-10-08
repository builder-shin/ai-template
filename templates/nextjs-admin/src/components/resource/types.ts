import type { FilterKind, InputKind } from "../../lib/resources/definition";
import type { ReactNode } from "react";
import type { FormResult } from "../../lib/api/errors";
export type Option = { value: string; label: string };
export type SearchOptions = (query: string) => Promise<Option[]>;
export type InputProps = {
  name: string;
  label: string;
  kind: InputKind | "relation" | "relation-many";
  defaultValue?: unknown;
  options?: readonly Option[];
  search?: SearchOptions;
  children?: ReactNode;
};
export type FilterProps = {
  name: string;
  label: string;
  kind: FilterKind;
  options?: readonly Option[];
  search?: SearchOptions;
  disabled?: boolean;
  error?: string;
};
export type ResourceState = FormResult & {
  retryAfter?: number | null;
  values?: Record<string, unknown>;
};
export type FormAction = (state: ResourceState, data: FormData) => Promise<ResourceState>;
export type Control = {
  label: string;
  action: () => Promise<ResourceState>;
  confirmation?: boolean;
  destructive?: boolean;
};
export type ScreenRecord = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: unknown }>;
};
export type DisplayProps = {
  name: string;
  value: unknown;
  record: ScreenRecord;
  included: readonly ScreenRecord[];
  locale: "ko" | "en";
  timeZone: string;
};
