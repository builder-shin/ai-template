import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { featureRoutes } from "../lib/navigation/features";
export function FeatureLinks() {
  const router = useRouter(),
    { t } = useTranslation();
  return (
    <>
      {featureRoutes.map((item) => (
        <Button key={item.name} title={t(item.titleKey)} onPress={() => router.push(item.path)} />
      ))}
    </>
  );
}
