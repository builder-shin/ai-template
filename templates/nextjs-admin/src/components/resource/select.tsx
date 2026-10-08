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
  disabled?: boolean;
}) {
  const t = useTranslations("resource");
  const [searchResult, setSearchResult] = useState<readonly Option[]>();
  const searchVersion = useRef(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [term, setTerm] = useState("");
  // 열린 검색은 새로고침과 무관하게 유지하고, 종료한 검색의 늦은 응답은 버린다.
  const items = term ? (searchResult ?? options) : options;
  function endSearch() {
    searchVersion.current++;
    setSearchResult(undefined);
    setError(false);
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
  return (
    <Select
      name={name}
      multiple={multiple}
      value={value}
      onValueChange={setValue}
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
                if (event.key === "Enter") event.preventDefault();
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
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
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
              }}
            >
              {pending ? <Spinner /> : t("search")}
            </Button>
          </div>
        )}
        {error && <p role="alert">{t("optionsError")}</p>}
        <SelectGroup>
          {allowEmpty && !multiple && <SelectItem value="">{t("all")}</SelectItem>}
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
