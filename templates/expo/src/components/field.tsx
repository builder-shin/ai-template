import {
  TextInput,
  Text,
  View,
  StyleSheet,
  useColorScheme,
  type TextInputProps,
} from "react-native";
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | undefined }) {
  const color = useColorScheme() === "dark" ? "#f8fafc" : "#101828";
  return (
    <View style={styles.group}>
      <Text style={{ color }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor="#64748b"
        {...props}
        style={[styles.input, { color }, props.style]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 8,
    padding: 12,
    fontSize: 17,
  },
  error: { color: "#dc2626" },
});
