import { access, readFile } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);
const serviceWorker = await readFile(new URL("sw.js", outputDirectory), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("manifest.webmanifest", outputDirectory), "utf8"),
);

const cachedPaths = [...serviceWorker.matchAll(/'\.\/([^']+)'/g)]
  .map((match) => match[1])
  .filter(Boolean);
const manifestPaths = manifest.icons.map((icon) => icon.src);

for (const path of [...cachedPaths, ...manifestPaths]) {
  await access(new URL(path, outputDirectory));
}

console.log(`Verified ${cachedPaths.length} cached files and ${manifestPaths.length} manifest icons.`);
