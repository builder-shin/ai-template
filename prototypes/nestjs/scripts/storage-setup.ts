import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings } from "../src/core/config/settings.js";
import { storageSetup } from "../src/core/storage/setup.js";
export { storageSetup };
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await storageSetup(loadSettings(process.env));
