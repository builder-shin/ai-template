import { Pressable, Text, StyleSheet } from "react-native";
import { Spinner } from "./spinner";
export function Button({
  title,
  onPress,
  pending = false,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  pending?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      onPress={onPress}
      disabled={disabled || pending}
      testID={testID ?? `button-${title}`}
      style={[styles.button, (disabled || pending) && styles.disabled]}
    >
      {pending ? <Spinner /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  text: { color: "#fff", fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
