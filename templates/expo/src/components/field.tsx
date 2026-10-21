import { TextInput, Text, View, StyleSheet, useColorScheme } from "react-native";
import type { ComponentPropsWithRef } from "react";
export function Field({
  label,
  error,
  ...props
}: ComponentPropsWithRef<typeof TextInput> & { label: string; error?: string | undefined }) {
  const dark = useColorScheme() === "dark";
  const color = dark ? "#f8fafc" : "#101828";
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
        <Text accessibilityRole="alert" style={{ color: dark ? "#fda4af" : "#b91c1c" }}>
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
});
