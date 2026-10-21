"use client";
import { createContext, useContext, useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../../lib/i18n/navigation";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { SubmitButton } from "../submit-button";
import { ResourceSelect } from "./select";
import type { FormAction, ResourceState, ResourceFieldState, InputProps } from "./types";

const FormContext = createContext<ResourceState>({ ok: true });
const FieldContext = createContext<{ name: string; notice?: string } | null>(null);
export function useResourceField(name: string): ResourceFieldState {
  const state = useContext(FormContext);
  const field = useContext(FieldContext);
  const errors = state.ok ? [] : (state.fieldErrors[name] ?? []);
  const errorId = errors.length ? `${name}-errors` : undefined;
  const noticeId = field?.name === name ? field.notice : undefined;
  return {
    errors,
    invalid: errors.length > 0,
    errorId,
    noticeId,
    labelledBy: `${name}-label`,
    describedBy: [errorId, noticeId].filter(Boolean).join(" ") || undefined,
  };
}
export function ResourceForm({
  title,
  action: serverAction,
  permalink,
  cancelHref,
  children,
}: {
  title: string;
  action: FormAction;
  permalink: string;
  cancelHref: string;
  children: ReactNode;
}) {
  const t = useTranslations("resource");
  const [state, action] = useActionState<ResourceState, FormData>(
    serverAction,
    { ok: true },
    permalink,
  );
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <FormContext.Provider value={state}>
        <form action={action} className="flex flex-col gap-4">
          {children}
          {!state.ok && state.formError && (
            <p role="alert" className="whitespace-pre-line text-destructive">
              {state.formError}
            </p>
          )}
          {state.retryAfter != null && <p>{t("retryAfter", { seconds: state.retryAfter })}</p>}
          <div className="flex items-center gap-4">
            <SubmitButton>{t("save")}</SubmitButton>
            <Link href={cancelHref}>{t("cancel")}</Link>
          </div>
        </form>
      </FormContext.Provider>
    </section>
  );
}
export function ResourceInput({
  name,
  label,
  kind,
  defaultValue,
  options,
  search,
  disabled = false,
  error,
  children,
}: InputProps) {
  const state = useContext(FormContext);
  const [value, setValue] = useState(state.values?.[name] ?? defaultValue);
  const { errors, invalid, errorId: fieldDescription } = useResourceField(name);
  const describedBy =
    [fieldDescription, error ? `${name}-notice` : undefined].filter(Boolean).join(" ") || undefined;
  const props = { id: name, name, "aria-invalid": invalid, "aria-describedby": describedBy };
  return (
    <fieldset
      disabled={disabled}
      className="flex min-w-0 flex-col gap-2"
      data-invalid={invalid || undefined}
    >
      {children ? (
        <span id={`${name}-label`} className="text-sm font-medium">
          {label}
        </span>
      ) : (
        <Label htmlFor={name}>{label}</Label>
      )}
      <input type="hidden" name={`__present_${name}`} value="1" />
      {children ? (
        <FieldContext.Provider value={{ name, ...(error ? { notice: `${name}-notice` } : {}) }}>
          {children}
        </FieldContext.Provider>
      ) : kind === "textarea" ? (
        <textarea
          {...props}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-32 rounded-lg border border-input bg-transparent p-3"
        />
      ) : kind === "boolean" ? (
        <Checkbox {...props} value="true" checked={value === true} onCheckedChange={setValue} />
      ) : ["enum", "enum-many", "relation", "relation-many"].includes(kind) ? (
        <ResourceSelect
          name={name}
          label={label}
          defaultValue={value}
          multiple={kind === "relation-many" || kind === "enum-many"}
          {...(options ? { options } : {})}
          {...(search ? { search } : {})}
          invalid={invalid}
          describedBy={describedBy}
          allowEmpty={kind === "relation"}
          emptyLabel="none"
          disabled={disabled}
        />
      ) : (
        <Input
          {...props}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      {errors.length > 0 && (
        <div id={fieldDescription} className="text-sm text-destructive">
          {errors.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      )}
      {error && (
        <p id={`${name}-notice`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
