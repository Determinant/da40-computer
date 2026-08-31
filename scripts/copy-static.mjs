import { cp, mkdir } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);
const vendorDirectory = new URL("assets/vendor/json-url/", outputDirectory);
const jsonUrlBrowserDirectory = new URL(
  "../node_modules/json-url/dist/browser/",
  import.meta.url,
);
const vendorFiles = [
  "json-url.js",
  "json-url-998.js",
  "json-url-998.js.LICENSE.txt",
  "json-url-lzma.js",
  "json-url-msgpack.js",
  "json-url-safe64.js",
  "json-url-safe64.js.LICENSE.txt",
  "json-url.js.LICENSE.txt",
];

await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });
await mkdir(vendorDirectory, { recursive: true });
await Promise.all([
  ...vendorFiles.map(fileName => cp(
    new URL(fileName, jsonUrlBrowserDirectory),
    new URL(fileName, vendorDirectory),
  )),
  cp(new URL("../LICENSE", import.meta.url), new URL("LICENSE.txt", outputDirectory)),
]);
