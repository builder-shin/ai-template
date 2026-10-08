import type { FilterKind } from "../../lib/resources/definition";
export type Option = { value: string; label: string };
export type SearchOptions = (query: string) => Promise<Option[]>;
export type FilterProps = {
  name: string;
  label: string;
  kind: FilterKind;
  options?: readonly Option[];
  search?: SearchOptions;
  disabled?: boolean;
  error?: string;
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
