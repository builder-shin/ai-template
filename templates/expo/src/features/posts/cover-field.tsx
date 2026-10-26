import { useTranslation } from "react-i18next";
import { NativeImageField } from "../../components/native-image-field";
import type { FileResource } from "../../lib/upload";
export function PostCoverField({
  value,
  onChange,
  disabled,
  onPendingChange,
}: {
  value: FileResource | null;
  onChange(file: FileResource | null): Promise<void>;
  disabled: boolean;
  onPendingChange(pending: boolean): void;
}) {
  const { t } = useTranslation();
  return (
    <NativeImageField
      label={t("postCover")}
      value={value}
      onChange={onChange}
      disabled={disabled}
      onPendingChange={onPendingChange}
    />
  );
}
