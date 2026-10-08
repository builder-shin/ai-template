import { vi } from "vitest";

/** 네트워크 경계만 대체한다. 실제 프로토콜은 Socket.IO 통합 검사에서 확인한다. */
export class TestSocket {
  connected = false;
  auth: (answer: (data: object) => void) => void = () => {};
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  connect = vi.fn(() => this);
  disconnect = vi.fn(() => this);
  emit = vi.fn();
  on(event: string, handler: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(handler);
    this.listeners.set(event, listeners);
    return this;
  }
  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(handler);
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    if (event === "connect") this.connected = true;
    if (event === "disconnect") this.connected = false;
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }
}
