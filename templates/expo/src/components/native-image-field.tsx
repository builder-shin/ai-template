import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { createNativeUploader, pickImage, type FileResource } from "../lib/upload";
import { useSession } from "../lib/session";
import { ApiError } from "../lib/api/errors";
import { DisplayError } from "../lib/forms/errors";
import { useSubmit } from "../lib/forms/use-submit";
import { Button } from "./button";
import { Text } from "./text";
import { RequestError } from "./request-state";
import { FilePreview } from "./file-preview";
export function NativeImageField({
  value,
  label,
  onChange,
  disabled = false,
  onPendingChange,
}: {
  value: FileResource | null;
  label: string;
  onChange(file: FileResource | null): Promise<void>;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const scope = useSession(),
    { t } = useTranslation(),
    submit = useSubmit();
  const active = useRef<AbortController | null>(null),
    [preview, setPreview] = useState<FileResource>();
  const phase = useRef<"idle" | "upload" | "attach">("idle");
  const mounted = useRef(true);
  const [canCancel, setCanCancel] = useState(false);
  useEffect(() => {
    onPendingChange?.(submit.pending);
  }, [submit.pending, onPendingChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    setPreview(undefined);
  }, [value?.id, value?.meta?.downloadUrl]);
  async function select() {
    if (disabled) return;
    await submit.run(async () => {
      const generation = scope.manager.generation(),
        controller = new AbortController();
      active.current = controller;
      phase.current = "upload";
      setCanCancel(true);
      try {
        const selected = await pickImage();
        if (!selected) return;
        if (controller.signal.aborted || generation !== scope.manager.generation())
          throw new DOMException("Image selection cancelled.", "AbortError");
        const file = await createNativeUploader(scope.api, scope.manager).uploadFile(selected, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || generation !== scope.manager.generation())
          throw new DOMException("Image upload cancelled.", "AbortError");
        phase.current = "attach";
        setCanCancel(false);
        try {
          await onChange(file);
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status < 500 &&
            generation === scope.manager.generation()
          )
            await scope.api
              .DELETE("/files/{id}", {
                params: { path: { id: file.id } },
                signal: AbortSignal.timeout(10000),
              })
              .catch(() => undefined);
          throw error;
        }
      } finally {
        phase.current = "idle";
        active.current = null;
        if (mounted.current) setCanCancel(false);
      }
    });
  }
  return (
    <>
      <Text>{label}</Text>
      <FilePreview
        file={preview?.id === value?.id ? (preview ?? value) : value}
        label={label}
        retry={() => {
          if (!value) return;
          void submit.run(async () => {
            const { data } = await scope.api.GET("/files/{id}", {
              params: { path: { id: value.id } },
            });
            if (data?.data.attributes.status === "ready") setPreview(data.data);
          });
        }}
      />
      <Button
        title={`${t("chooseImage")}: ${label}`}
        disabled={disabled}
        pending={submit.pending}
        onPress={() => {
          void select();
        }}
      />
      <Button
        title={`${t("removeImage")}: ${label}`}
        disabled={disabled || !value || submit.pending}
        onPress={() => {
          void submit.run(() => onChange(null));
        }}
      />
      {submit.pending && canCancel && (
        <Button
          title={t("cancelUpload")}
          onPress={() => {
            if (phase.current === "upload") active.current?.abort();
          }}
        />
      )}
      <RequestError error={submit.error} />
      {submit.error instanceof DisplayError && submit.error.key === "photoPermission" && (
        <Button
          title={t("openSettings")}
          onPress={() => {
            void submit.run(() => Linking.openSettings());
          }}
        />
      )}
    </>
  );
}
