"use client";

import type { ComponentProps } from "react";
import { ErrorBoundary } from "../../components/error-boundary";

export default function ErrorPage(props: ComponentProps<typeof ErrorBoundary>) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8">
      <ErrorBoundary {...props} />
    </main>
  );
}
