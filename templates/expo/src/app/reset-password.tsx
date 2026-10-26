import { useLocalSearchParams } from "expo-router";
import { ResetPasswordScreen } from "../features/auth";
import { mailToken } from "../lib/links/intent";
export default function ResetPassword() {
  return <ResetPasswordScreen token={mailToken(useLocalSearchParams())} />;
}
