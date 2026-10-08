"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../lib/i18n/navigation";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../ui/dialog";
import { SubmitButton } from "../submit-button";
import type { Control, ResourceState } from "./types";
const initialState: ResourceState = { ok: true };

function ActionButton({ control }: { control: Control }) {
  const t = useTranslations("resource");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ResourceState, FormData>(async () => {
    const result = await control.action();
    if (result.ok) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, initialState);
  const form = (
    <form action={action} className="flex flex-col gap-3">
      {!state.ok && state.formError && (
        <p role="alert" className="text-destructive">
          {state.formError}
        </p>
      )}
      {state.retryAfter != null && <p>{t("retryAfter", { seconds: state.retryAfter })}</p>}
      <div className="flex gap-3">
        {control.confirmation && (
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("cancel")}
          </DialogClose>
        )}
        <SubmitButton>{control.confirmation ? t("confirm") : control.label}</SubmitButton>
      </div>
    </form>
  );
  return control.confirmation ? (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={control.destructive ? "destructive" : "outline"} />}>
        {control.label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{control.label}</DialogTitle>
          <DialogDescription>
            {t(control.destructive ? "deleteDescription" : "actionDescription")}
          </DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  ) : (
    form
  );
}
export function ResourceControls({ controls }: { controls: readonly Control[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {controls.map((control, index) => (
        <ActionButton key={index} control={control} />
      ))}
    </div>
  );
}
