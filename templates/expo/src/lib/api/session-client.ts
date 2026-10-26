import type { SessionPort } from "./session-port";

const methods = new Set([
  "GET",
  "PUT",
  "POST",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "PATCH",
  "TRACE",
  "request",
]);

/** Guard the complete typed operation, including asynchronous JSON body consumption. */
export function bindSession<T extends object>(client: T, session: SessionPort): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== "function" || !methods.has(String(property))) return method;
      return async (...args: unknown[]) => {
        const generation = session.generation?.() ?? session.credentials()?.generation;
        const index = property === "request" ? 2 : 1;
        const options = (args[index] ?? {}) as { signal?: AbortSignal };
        const controller = new AbortController();
        const signals = [options.signal, session.signal?.()].filter((s): s is AbortSignal => !!s);
        const abort = () => controller.abort();
        for (const signal of signals) {
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }
        const check = () => {
          const current = session.generation?.() ?? session.credentials()?.generation;
          if (controller.signal.aborted || current !== generation)
            throw new DOMException("Session changed or request cancelled.", "AbortError");
        };
        const scoped = [...args];
        scoped[index] = { ...options, signal: controller.signal };
        try {
          check();
          const result: unknown = await Reflect.apply(method, target, scoped);
          check();
          return result;
        } catch (error) {
          check();
          throw error;
        } finally {
          for (const signal of signals) signal.removeEventListener("abort", abort);
        }
      };
    },
  });
}
