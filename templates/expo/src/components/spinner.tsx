import { ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
export function Spinner() {
  const { t } = useTranslation();
  return (
    <ActivityIndicator
      accessibilityRole="progressbar"
      accessibilityLabel={t("activity")}
      size="large"
    />
  );
}
