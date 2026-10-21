"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "../ui/select";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Spinner } from "../spinner";
import type { Option, SearchOptions } from "./types";
import { SearchMultiSelect } from "./search-multi-select";

const emptyOptions: readonly Option[] = [];

export function ResourceSelect({
  name,
  label,
  options = emptyOptions,
  defaultValue,
  multiple = false,
  search,
  invalid,
  describedBy,
  allowEmpty = false,
  emptyLabel = "all",
  disabled = false,
}: {
  name: string;
  label: string;
  options?: readonly Option[];
  defaultValue?: unknown;
  multiple?: boolean;
  search?: SearchOptions;
  invalid?: boolean;
  describedBy?: string | undefined;
  allowEmpty?: boolean;
  emptyLabel?: "all" | "none";
  disabled?: boolean;
}) {
  const t = useTranslations("resource");
  const [searchResult, setSearchResult] = useState<readonly Option[]>();
  const searchVersion = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [term, setTerm] = useState("");
  // 열린 검색은 새로고침과 무관하게 유지하고, 종료한 검색의 늦은 응답은 버린다.
  function endSearch() {
    searchVersion.current++;
    setSearchResult(undefined);
    setError(false);
    setPending(false);
  }
  async function runSearch() {
    if (!search) return;
    const version = ++searchVersion.current;
    setPending(true);
    try {
      const result = await search(term);
      if (version === searchVersion.current) {
        setSearchResult(result);
        setError(false);
      }
    } catch {
      if (version === searchVersion.current) setError(true);
    } finally {
      if (version === searchVersion.current) setPending(false);
    }
  }
  const [value, setValue] = useState<string | string[] | null>(
    multiple
      ? Array.isArray(defaultValue)
        ? defaultValue.filter((value): value is string => typeof value === "string")
        : []
      : typeof defaultValue === "string"
        ? defaultValue
        : null,
  );
  const [retainedOptions, setRetainedOptions] = useState<readonly Option[]>([]);
  // 현재 선택에서 본 라벨만 보관하고 최신 기본 옵션의 라벨을 우선한다.
  const selectedOptions = (Array.isArray(value) ? value : [value]).flatMap((id) => {
    const option =
      options.find((option) => option.value === id) ??
      searchResult?.find((option) => option.value === id) ??
      retainedOptions.find((option) => option.value === id);
    return option ? [option] : [];
  });
  if (
    selectedOptions.length !== retainedOptions.length ||
    selectedOptions.some(
      (option, index) =>
        option.value !== retainedOptions[index]?.value ||
        option.label !== retainedOptions[index]?.label,
    )
  )
    setRetainedOptions(selectedOptions);
  const availableOptions = term ? (searchResult ?? options) : options;
  // 검색 결과가 바뀌어도 선택한 항목의 위치를 고정해 선택기의 포커스 동기화를 막는다.
  const orderedOptions = search
    ? [...selectedOptions, ...availableOptions]
    : [...availableOptions, ...selectedOptions];
  const items = [...new Map(orderedOptions.map((option) => [option.value, option])).values()];
  function changeValue(next: string | string[] | null, choices: readonly Option[] = items) {
    setValue(next);
    const values = Array.isArray(next) ? next : [next];
    setRetainedOptions(choices.filter((option) => values.includes(option.value)));
  }
  function closeSearch() {
    endSearch();
    setTerm("");
  }
  if (search && multiple && Array.isArray(value))
    return (
      <SearchMultiSelect
        name={name}
        label={label}
        value={value}
        selectedOptions={selectedOptions}
        availableOptions={availableOptions}
        onValueChange={changeValue}
        term={term}
        onTermChange={(next) => {
          endSearch();
          setTerm(next);
        }}
        onSearch={runSearch}
        onClose={closeSearch}
        pending={pending}
        error={error}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
      />
    );
  return (
    <Select
      name={name}
      multiple={multiple}
      value={value}
      onValueChange={(next) => changeValue(next)}
      onOpenChange={(open) => {
        if (!open) closeSearch();
      }}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger
        id={name}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={t("choose")} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {search && (
          <div className="flex items-center gap-2 p-2">
            <Input
              aria-label={t("searchRelation")}
              value={term}
              onChange={(event) => {
                endSearch();
                setTerm(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
                if (
                  event.key === "Enter" ||
                  event.key.length === 1 ||
                  ["Backspace", "Delete", "Home", "End", "ArrowLeft", "ArrowRight"].includes(
                    event.key,
                  )
                )
                  event.stopPropagation();
              }}
            />
            <Button type="button" variant="outline" aria-label={t("search")} onClick={runSearch}>
              {pending ? <Spinner /> : t("search")}
            </Button>
          </div>
        )}
        {error && <p role="alert">{t("optionsError")}</p>}
        <SelectGroup>
          {allowEmpty && !multiple && <SelectItem value="">{t(emptyLabel)}</SelectItem>}
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
