"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "../../components/spinner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { createFileAction, readyFileAction } from "./actions";
import type { FileValue, UploadFailure } from "./state";

function messages(result: UploadFailure) {
  return [result.formError, ...Object.values(result.fieldErrors).flat()].filter(Boolean).join("\n");
}

/** JS가 필요한 업로드만 처리한다. 관계 저장은 부모 폼의 Action이 한다. */
export function FileUpload({
  name,
  label,
  value,
  onChange,
  returnTo,
  onPendingChange,
}: {
  name: string;
  label: string;
  value: FileValue;
  onChange: (value: FileValue) => void;
  returnTo: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations("uploads");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const id = `upload-${name}`;
  async function upload(file: File) {
    setError("");
    try {
      const data = new FormData();
      data.set("filename", file.name);
      data.set("contentType", file.type);
      data.set("size", String(file.size));
      const created = await createFileAction(data, returnTo);
      if (!created.ok) {
        setError(messages(created));
        return;
      }
      // Content-Length는 브라우저가 본문 크기에서 정한다. 서명 헤더는 그대로 보낸다.
      try {
        const put = await fetch(created.upload.url, {
          method: created.upload.method,
          headers: created.upload.headers,
          body: file,
          credentials: "omit",
        });
        if (!put.ok) {
          setError(t("failed"));
          return;
        }
      } catch {
        setError(t("failed"));
        return;
      }
      const ready = await readyFileAction(created.id, returnTo);
      if (!ready.ok) {
        setError(messages(ready));
        return;
      }
      onChange(ready.file);
    } finally {
      onPendingChange?.(false);
    }
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept="image/*"
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            // 부모의 저장 차단은 Transition에 넣으면 업로드가 끝날 때까지 지연된다.
            onPendingChange?.(true);
            startTransition(() => upload(file));
          }
        }}
      />
      <input type="hidden" name={name} value={value.id} />
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {t("jsRequired")}
      </p>
      {pending && <Spinner />}
      {value.url && (
        // 사유: 서버가 서명한 짧은 수명의 URL은 Next 이미지 캐시를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element -- 사유: presigned URL을 그대로 표시한다.
        <img src={value.url} alt={label} className="max-h-64 rounded-lg object-contain" />
      )}
      {value.id && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setError("");
            onChange({ id: "", url: "" });
          }}
        >
          {t("clear")}
        </Button>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="whitespace-pre-line text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
