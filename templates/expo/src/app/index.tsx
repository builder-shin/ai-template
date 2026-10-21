import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/screen";
export default function Home() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Text>{t("appName")}</Text>
    </Screen>
  );
}
