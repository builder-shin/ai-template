import { useLocalSearchParams } from "expo-router";
import { VerifyEmailScreen } from "../features/auth";
import { mailToken } from "../lib/links/intent";
export default function VerifyEmail() {
  return <VerifyEmailScreen token={mailToken(useLocalSearchParams())} />;
}
