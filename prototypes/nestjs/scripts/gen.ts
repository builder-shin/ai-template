import { clientManifest } from "./client-manifest.js";
import { prisma } from "./prisma.js";
prisma(["generate"]);
clientManifest();
await import("./gen-openapi.js");
