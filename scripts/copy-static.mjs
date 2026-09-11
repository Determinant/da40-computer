import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);
const vendorDirectory = new URL("assets/vendor/json-url/", outputDirectory);
const vendorLicenseDirectory = new URL("licenses/", vendorDirectory);
const jsonUrlBrowserDirectory = new URL(
  "../node_modules/json-url/dist/browser/",
  import.meta.url,
);
const vendorFiles = [
  // The split bundle loads codec chunks dynamically, which is unreliable for
  // a page opened directly from file:// because every local file has an
  // opaque origin. The single bundle keeps saved links usable both locally
  // and through a web server.
  "json-url-single.js",
  "json-url-single.js.LICENSE.txt",
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

// Browsers may assign separate opaque origins to neighboring file:// URLs.
// That makes an SVG rendered through <object> visible but prevents the parent
// page from reading its paths for the DA40 nomograph calculation. Embed the
// four original chart files into the deployable HTML so dist/da40.html works
// both from a web server and when opened directly from disk. Each chart is
// instantiated in its own shadow root to preserve the ID isolation previously
// provided by separate SVG documents.
const da40HtmlUrl = new URL("da40.html", outputDirectory);
const da40Charts = [
  ["takeoff", "assets/charts/takeoff-chart.svg"],
  ["landing", "assets/charts/landing-chart.svg"],
  ["takeoff-climb", "assets/charts/takeoff-climb-chart.svg"],
  ["cruise-climb", "assets/charts/cruise-climb-chart.svg"],
];
let da40Html = await readFile(da40HtmlUrl, "utf8");
for (const [id, relativePath] of da40Charts) {
  const objectMarkup =
    `<object class="chart" data="${relativePath}" type="image/svg+xml" id="${id}"></object>`;
  if (!da40Html.includes(objectMarkup)) {
    throw new Error(`DA40 chart placeholder is missing: ${id}`);
  }
  const svg = (await readFile(new URL(relativePath, publicDirectory), "utf8"))
    .replace(/^\s*<\?xml[^>]*\?>\s*/, "");
  const inlineMarkup = `<div class="chart chart-inline" id="${id}">` +
    `<template><style>:host{display:block}svg{display:block;width:100%;height:auto}</style>` +
    `${svg}</template></div>`;
  da40Html = da40Html.replace(objectMarkup, inlineMarkup);
}
await writeFile(da40HtmlUrl, da40Html);

// The built page now owns the chart markup. Avoid also shipping and
// precaching the four source SVGs as redundant standalone files.
await Promise.all(da40Charts.map(([, relativePath]) =>
  rm(new URL(relativePath, outputDirectory)),
));
