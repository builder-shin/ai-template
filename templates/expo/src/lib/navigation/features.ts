import registry from "./features.json";
import messages from "../i18n/messages/ko.json";
function titleKey(value: string): keyof typeof messages {
  if (!Object.hasOwn(messages, value)) throw new Error("Navigation message key is missing.");
  return value as keyof typeof messages;
}
export const featureRoutes = registry.features.map((item) => ({
  ...item,
  titleKey: titleKey(item.titleKey),
}));
export const protectedScreens = registry.protectedScreens.map((item) => ({
  ...item,
  titleKey: titleKey(item.titleKey),
}));
