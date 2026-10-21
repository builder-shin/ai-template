import { useEffect, useRef, useState } from "react";
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [succeeded, setSucceeded] = useState(false);
  const busy = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run(operation: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    setSucceeded(false);
    try {
      await operation();
      if (mounted.current) setSucceeded(true);
    } catch (failure) {
      if (mounted.current && !(failure instanceof Error && failure.name === "AbortError"))
        setError(failure);
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { pending, error, succeeded, run };
}
