import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
export function LanguagePicker() {
  const { i18n } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Button
        title="한국어"
        onPress={() => {
          void i18n.changeLanguage("ko");
        }}
      />
      <Button
        title="English"
        onPress={() => {
          void i18n.changeLanguage("en");
        }}
      />
    </View>
  );
}
