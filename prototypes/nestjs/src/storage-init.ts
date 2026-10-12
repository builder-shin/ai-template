import { loadSettings } from "./core/config/settings.js";
import { storageSetup } from "./core/storage/setup.js";
await storageSetup(loadSettings(process.env));
