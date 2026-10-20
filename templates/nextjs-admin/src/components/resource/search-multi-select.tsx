"use client";
import { useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../spinner";
import type { Option } from "./types";

export function SearchMultiSelect({
  name,
  label,
  value,
  selectedOptions,
  availableOptions,
  onValueChange,
  term,
  onTermChange,
  onSearch,
  onClose,
  pending,
  error,
  disabled,
  invalid,
  describedBy,
}: {
  name: string;
  label: string;
  value: string[];
  selectedOptions: readonly Option[];
  availableOptions: readonly Option[];
  onValueChange: (value: string[], choices: readonly Option[]) => void;
  term: string;
  onTermChange: (term: string) => void;
  onSearch: () => void;
  onClose: () => void;
  pending: boolean;
  error: boolean;
  disabled: boolean;
  invalid: boolean | undefined;
  describedBy: string | undefined;
}) {
  const t = useTranslations("resource");
  function choices() {
    return [
      ...new Map(
        [...availableOptions, ...selectedOptions].map((option) => [option.value, option]),
      ).values(),
    ];
  }
  // 같은 결과의 선택·해제로 행을 옮기지 않고, 다음 검색이나 재열기에서만 목록을 바꾼다.
  const [snapshot, setSnapshot] = useState(() => ({
    source: availableOptions,
    term,
    items: choices(),
  }));
  if (snapshot.source !== availableOptions || snapshot.term !== term)
    setSnapshot({ source: availableOptions, term, items: choices() });
  const keyboardOption = useRef<string | undefined>(undefined);
  const items = snapshot.items.map(
    (option) => selectedOptions.find((selected) => selected.value === option.value) ?? option,
  );
  return (
    <Combobox.Root
      name={name}
      multiple
      value={value}
      items={items.map((option) => option.value)}
      filter={null}
      itemToStringLabel={(id) =>
        selectedOptions.find((option) => option.value === id)?.label ??
        items.find((option) => option.value === id)?.label ??
        id
      }
      onValueChange={(next) => onValueChange(next, items)}
      inputValue={term}
      onInputValueChange={(next, details) => {
        // 선택 직후의 자동 비우기는 같은 검색 결과를 없애므로 공개 취소 API로 막는다.
        if (details.reason !== "input-change") details.cancel();
        else onTermChange(next);
      }}
      onItemHighlighted={(id, details) => {
        if (details.reason === "pointer") keyboardOption.current = undefined;
        else if (details.reason === "keyboard" || keyboardOption.current !== undefined)
          keyboardOption.current = id;
      }}
      onOpenChange={(open) => {
        keyboardOption.current = undefined;
        setSnapshot({ source: availableOptions, term, items: choices() });
        if (!open) onClose();
      }}
      disabled={disabled}
    >
      <Combobox.Trigger
        id={name}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        render={<Button variant="outline" />}
      >
        <Combobox.Value placeholder={t("choose")} />
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            aria-label={label}
            className="max-h-(--available-height) min-w-36 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            <div className="flex items-center gap-2 p-2">
              <Combobox.Input
                aria-label={t("searchRelation")}
                render={<Input />}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) {
                    event.preventBaseUIHandler();
                    return;
                  }
                  if (event.key === "Enter" && keyboardOption.current === undefined) {
                    event.preventDefault();
                    event.preventBaseUIHandler();
                    event.stopPropagation();
                    onSearch();
                  } else if (
                    [" ", "Enter"].includes(event.key) &&
                    keyboardOption.current !== undefined
                  ) {
                    // 방향키로 가리킨 항목은 입력의 가상 포커스를 유지하며 선택을 토글한다.
                    event.preventDefault();
                    event.preventBaseUIHandler();
                    const id = keyboardOption.current;
                    onValueChange(
                      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
                      items,
                    );
                  }
                }}
              />
              <Button type="button" variant="outline" aria-label={t("search")} onClick={onSearch}>
                {pending ? <Spinner /> : t("search")}
              </Button>
            </div>
            {error && <p role="alert">{t("optionsError")}</p>}
            <Combobox.List className="p-1">
              {items.map((option) => (
                <Combobox.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {option.label}
                  <Combobox.ItemIndicator className="absolute right-2">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
