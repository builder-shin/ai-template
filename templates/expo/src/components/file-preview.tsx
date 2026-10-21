import { useEffect, useState } from "react";
import { Image } from "react-native";
import { useTranslation } from "react-i18next";
import type { FileResource } from "../lib/upload/types";
import { downloadUrl } from "../lib/upload/resource";
import { Text } from "./text";
import { Button } from "./button";
export function FilePreview({
  file,
  label,
  localUri,
  retry,
}: {
  file: FileResource | null;
  label: string;
  localUri?: string;
  retry?: () => void;
}) {
  const { t } = useTranslation(),
    [failed, setFailed] = useState(false);
  const uri = localUri && /^(?:file|content):\/\//.test(localUri) ? localUri : downloadUrl(file);
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  if (!file && !localUri) return <Text>{t("noImage")}</Text>;
  return uri && !failed ? (
    <Image
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      source={{ uri }}
      style={{ width: 160, height: 160, borderRadius: 12 }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <>
      <Text accessibilityRole="alert">{t("imageUnavailable")}</Text>
      {retry && <Button title={t("retry")} onPress={retry} />}
    </>
  );
}
