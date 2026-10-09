"use client";
import { useState } from "react";
import { Checkbox } from "../../components/ui/checkbox";
import { Label } from "../../components/ui/label";
import { useResourceField } from "../../components/resource/form";
import type { InputProps } from "../../components/resource/types";

export default function PermissionPicker({
  name,
  label,
  defaultValue,
  options = [],
  disabled,
}: InputProps) {
  const { invalid, describedBy } = useResourceField(name);
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(defaultValue)
      ? defaultValue.filter((value): value is string => typeof value === "string")
      : [],
  );
  const groups = Map.groupBy(options, (option) => option.value.split(":")[0]!);
  return (
    <div
      id={name}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex flex-col gap-4"
    >
      {[...groups].map(([group, values]) => (
        <fieldset
          key={group}
          disabled={disabled}
          className="flex flex-col gap-2 rounded-lg border p-3"
        >
          <legend className="px-1 font-medium">{group}</legend>
          {values.map((option) => {
            const id = `${name}-${option.value}`;
            return (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  name={name}
                  value={option.value}
                  checked={selected.includes(option.value)}
                  disabled={disabled}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, option.value]
                        : current.filter((value) => value !== option.value),
                    )
                  }
                />
                <Label htmlFor={id}>{option.label}</Label>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
