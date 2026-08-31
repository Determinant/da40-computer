import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { collectRelativeFiles } from "./file-tree.mjs";

const outputDirectory = new URL("../dist/", import.meta.url);
const serviceWorkerUrl = new URL("sw.js", outputDirectory);
const cacheVersionPlaceholder = "__DA40_BUILD_ID__";
const precachePlaceholder = "/* __DA40_PRECACHE_URLS__ */ []";

const serviceWorkerTemplate = await readFile(serviceWorkerUrl, "utf8");
if (!serviceWorkerTemplate.includes(cacheVersionPlaceholder) ||
    !serviceWorkerTemplate.includes(precachePlaceholder)) {
  throw new Error("Service worker build placeholders are missing.");
}

const relativePaths = (await collectRelativeFiles(outputDirectory))
  .filter(relativePath => relativePath !== "sw.js")
  .sort();
const buildHash = createHash("sha256").update(serviceWorkerTemplate);
for (const relativePath of relativePaths) {
  buildHash.update("\0").update(relativePath).update("\0");
  buildHash.update(await readFile(new URL(relativePath, outputDirectory)));
}

const buildId = buildHash.digest("hex").slice(0, 16);
const precacheUrls = relativePaths.map(relativePath => `./${relativePath}`);
const serviceWorker = serviceWorkerTemplate
  .replace(cacheVersionPlaceholder, buildId)
  .replace(precachePlaceholder, JSON.stringify(precacheUrls, null, 2));

await writeFile(serviceWorkerUrl, serviceWorker);
console.log(`Generated offline cache ${buildId} with ${precacheUrls.length} files.`);
