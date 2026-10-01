"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";
import { Button } from "./ui/button";
import { useRealtimeFormStatus } from "../lib/realtime/mutations";

export function SubmitButton({
  children,
  disabled = false,
}: {
  children: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  useRealtimeFormStatus(pending);
  return (
    <Button type="submit" disabled={pending || disabled} aria-label={children}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}
