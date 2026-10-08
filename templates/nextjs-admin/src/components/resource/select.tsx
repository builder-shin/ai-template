"use client";
import { useRef, useState, useTransition } from "react";
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
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [term, setTerm] = useState("");
  // 열린 검색은 새로고침과 무관하게 유지하고, 종료한 검색의 늦은 응답은 버린다.
  function endSearch() {
    searchVersion.current++;
    setSearchResult(undefined);
    setError(false);
  }
  function runSearch() {
    if (!search || pending) return;
    const version = ++searchVersion.current;
    start(async () => {
      try {
        const result = await search(term);
        if (version === searchVersion.current) {
          setSearchResult(result);
          setError(false);
        }
      } catch {
        if (version === searchVersion.current) setError(true);
      }
    });
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
  const items = [
    ...new Map(
      [...(term ? (searchResult ?? options) : options), ...selectedOptions].map((option) => [
        option.value,
        option,
      ]),
    ).values(),
  ];
  return (
    <Select
      name={name}
      multiple={multiple}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        const values = Array.isArray(next) ? next : [next];
        setRetainedOptions(items.filter((option) => values.includes(option.value)));
      }}
      onOpenChange={(open) => {
        if (!open) {
          endSearch();
          setTerm("");
        }
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
            <Button type="button" variant="outline" disabled={pending} onClick={runSearch}>
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
