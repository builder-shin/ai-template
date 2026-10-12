import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const inspect = spawnSync("docker", ["image", "inspect", "nestjs-template-app"], {
  encoding: "utf8",
});
assert.equal(inspect.status, 0);
const images = JSON.parse(inspect.stdout) as {
  Size: number;
  Config: { User: string; Healthcheck?: unknown };
}[];
const image = images[0];
assert(image);
assert.equal(image.Config.User, "10001:10001");
assert.equal(image.Config.Healthcheck, undefined);
const command =
  "const fs=require('node:fs'),path=require('node:path');const root=fs.realpathSync(require.resolve('prisma/package.json'));function size(p){return fs.statSync(p).isDirectory()?fs.readdirSync(p).reduce((n,x)=>n+size(path.join(p,x)),0):fs.statSync(p).size;} console.log(JSON.stringify({uid:process.getuid(),node:process.version,prisma:JSON.parse(fs.readFileSync(root)).version,prismaPackageBytes:size(path.dirname(root))}));";
const observed = spawnSync(
  "docker",
  ["run", "--rm", "nestjs-template-app", "node", "-e", command],
  { encoding: "utf8" },
);
assert.equal(observed.status, 0);
const runtime = JSON.parse(observed.stdout) as {
  uid: number;
  node: string;
  prisma: string;
  prismaPackageBytes: number;
};
assert.equal(runtime.uid, 10001);
assert.equal(runtime.node, "v24.19.0");
assert.equal(runtime.prisma, "7.10.0");
const evidence = {
  observedAt: new Date().toISOString(),
  imageBytes: image.Size,
  runtime,
  migrateChoice: "Prisma CLI retained as production dependency in the single image.",
  limitation:
    "prismaPackageBytes excludes its transitive dependencies; it is not a full CLI-free image-size comparison.",
};
mkdirSync(".cache/stack", { recursive: true });
writeFileSync(".cache/stack/image.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ imageEvidence: evidence }));
