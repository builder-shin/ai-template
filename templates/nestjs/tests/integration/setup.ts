import { afterAll, beforeEach } from "vitest";
import { closeState, resetState } from "./state.js";
beforeEach(resetState);
afterAll(closeState);
