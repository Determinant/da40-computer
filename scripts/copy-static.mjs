import { cp, mkdir } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);
const vendorDirectory = new URL("assets/vendor/json-url/", outputDirectory);
const vendorLicenseDirectory = new URL("licenses/", vendorDirectory);
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
const vendorLicenses = [
  ["json-url/LICENSE", "json-url-LICENSE.txt"],
  ["lzma/LICENSE", "lzma-LICENSE.txt"],
  ["msgpack5/LICENSE", "msgpack5-LICENSE.txt"],
  ["@babel/runtime-corejs2/LICENSE", "babel-runtime-corejs2-LICENSE.txt"],
  ["core-js/LICENSE", "core-js-LICENSE.txt"],
  ["bluebird/LICENSE", "bluebird-LICENSE.txt"],
  ["bl/LICENSE.md", "bl-LICENSE.md"],
  ["buffer/LICENSE", "buffer-LICENSE.txt"],
  ["base64-js/LICENSE", "base64-js-LICENSE.txt"],
  ["ieee754/LICENSE", "ieee754-LICENSE.txt"],
  ["safe-buffer/LICENSE", "safe-buffer-LICENSE.txt"],
  ["inherits/LICENSE", "inherits-LICENSE.txt"],
  ["readable-stream/LICENSE", "readable-stream-LICENSE.txt"],
  ["string_decoder/LICENSE", "string-decoder-LICENSE.txt"],
  ["util-deprecate/LICENSE", "util-deprecate-LICENSE.txt"],
];

await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });
await mkdir(vendorDirectory, { recursive: true });
await mkdir(vendorLicenseDirectory, { recursive: true });
await Promise.all([
  ...vendorFiles.map(fileName => cp(
    new URL(fileName, jsonUrlBrowserDirectory),
    new URL(fileName, vendorDirectory),
  )),
  ...vendorLicenses.map(([sourcePath, outputName]) => cp(
    new URL(`../node_modules/${sourcePath}`, import.meta.url),
    new URL(outputName, vendorLicenseDirectory),
  )),
  cp(new URL("../LICENSE", import.meta.url), new URL("LICENSE.txt", outputDirectory)),
]);
