"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";
import { Button } from "./ui/button";

export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-label={children}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}
