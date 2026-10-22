import { useTranslation } from "react-i18next";
import { Text } from "./text";
import { errorKey } from "../lib/forms/errors";
export function RequestError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? <Text accessibilityRole="alert">{t(errorKey(error))}</Text> : null;
}
