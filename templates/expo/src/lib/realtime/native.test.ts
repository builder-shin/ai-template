import { AppState, Platform, type AppStateStatus } from "react-native";
import { nativeAppState } from "./native";

const platformProperty = Object.getOwnPropertyDescriptor(Platform, "OS")!;
const stateProperty = Object.getOwnPropertyDescriptor(AppState, "currentState")!;
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, "OS", platformProperty);
  Object.defineProperty(AppState, "currentState", stateProperty);
});

function nativeState(os: "ios" | "android", initial: AppStateStatus | null = "active") {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
  Object.defineProperty(AppState, "currentState", { configurable: true, value: initial });
  const handlers = new Map<string, (state: AppStateStatus) => void>();
  const removals: jest.Mock[] = [];
  const subscribe = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((event, handler) => {
      if (os === "ios" && event !== "change" && event !== "memoryWarning")
        throw new Error("appStateFocusChange is not a supported event type for RCTAppState");
      handlers.set(event, handler);
      const remove = jest.fn(() => {
        handlers.delete(event);
      });
      removals.push(remove);
      return { remove };
    });
  return { handlers, removals, subscribe };
}

test("iOS subscribes only to supported state changes and removes its native listener", () => {
  const native = nativeState("ios");
  const state = nativeAppState();
  const changed = jest.fn();
  const stop = state.subscribe(changed);
  expect(native.subscribe.mock.calls.map(([event]) => event)).toEqual(["change"]);
  expect(state.current()).toBe("active");
  for (const next of ["inactive", "background", "active"] as const) {
    native.handlers.get("change")!(next);
    expect(state.current()).toBe(next);
    expect(changed).toHaveBeenLastCalledWith(next);
  }
  stop();
  expect(native.handlers.size).toBe(0);
  expect(native.removals[0]).toHaveBeenCalledTimes(1);
});

test("Android preserves focus and blur handling without treating background focus as foreground", () => {
  const native = nativeState("android");
  const state = nativeAppState();
  const changed = jest.fn();
  const stop = state.subscribe(changed);
  expect(native.subscribe.mock.calls.map(([event]) => event)).toEqual(["change", "blur", "focus"]);
  native.handlers.get("blur")!("active");
  expect(state.current()).toBe("inactive");
  expect(changed).toHaveBeenLastCalledWith("inactive");
  native.handlers.get("focus")!("active");
  expect(state.current()).toBe("active");
  native.handlers.get("change")!("background");
  native.handlers.get("focus")!("active");
  expect(state.current()).toBe("background");
  expect(changed).toHaveBeenLastCalledWith("background");
  native.handlers.get("change")!("active");
  expect(state.current()).toBe("active");
  stop();
  expect(native.handlers.size).toBe(0);
  for (const remove of native.removals) expect(remove).toHaveBeenCalledTimes(1);
});

test("iOS remains inactive until an initially unavailable native state becomes active", () => {
  const native = nativeState("ios", null);
  const state = nativeAppState();
  expect(state.current()).toBe("inactive");
  const stop = state.subscribe(jest.fn());
  native.handlers.get("change")!("active");
  expect(state.current()).toBe("active");
  stop();
});
