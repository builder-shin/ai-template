import { Text as NativeText, useColorScheme, type TextProps } from "react-native";
export function Text({ style, ...props }: TextProps) {
  const color = useColorScheme() === "dark" ? "#f8fafc" : "#101828";
  return <NativeText {...props} style={[{ color, fontSize: 17 }, style]} />;
}
