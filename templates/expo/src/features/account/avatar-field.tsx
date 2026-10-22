import { NativeImageField } from "../../components/native-image-field";
import type { FileResource } from "../../lib/upload";
import { useTranslation } from "react-i18next";
export function AvatarField({
  value,
  onChange,
}: {
  value: FileResource | null;
  onChange(file: FileResource | null): Promise<void>;
}) {
  const { t } = useTranslation();
  return <NativeImageField label={t("avatar")} value={value} onChange={onChange} />;
}
