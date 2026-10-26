import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children }: PropsWithChildren) {
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: dark ? "#101828" : "#f8fafc" }]}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: 20 },
  body: { width: "100%", maxWidth: 680, alignSelf: "center", gap: 16 },
});
