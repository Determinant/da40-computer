import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { collectRelativeFiles } from "./file-tree.mjs";

const outputDirectory = new URL("../dist/", import.meta.url);
const serviceWorker = await readFile(new URL("sw.js", outputDirectory), "utf8");
const html = await readFile(new URL("da40.html", outputDirectory), "utf8");
const appSource = await readFile(new URL("assets/js/da40.js", outputDirectory), "utf8");
const pwaSource = await readFile(new URL("assets/js/pwa.js", outputDirectory), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("manifest.webmanifest", outputDirectory), "utf8"),
);

const precacheMatch = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
assert.ok(precacheMatch, "The generated service worker has no precache list.");
const precacheUrls = JSON.parse(precacheMatch[1]);
assert.equal(new Set(precacheUrls).size, precacheUrls.length, "Precache URLs must be unique.");
assert.ok(
  !serviceWorker.includes("__DA40_"),
  "The generated service worker still contains build placeholders.",
);
assert.match(
  serviceWorker,
  /const CACHE_NAME = `\$\{CACHE_PREFIX\}static-[a-f0-9]{16}`;/,
  "The generated service worker cache is not content-versioned.",
);

const outputFiles = (await collectRelativeFiles(outputDirectory))
  .filter(relativePath => relativePath !== "sw.js")
  .sort();
const cachedFiles = precacheUrls.map(url => url.replace(/^\.\//, "")).sort();
assert.deepEqual(cachedFiles, outputFiles, "Every deployable app file must be precached.");

assert.equal(manifest.id, manifest.start_url, "Keep the existing installed-app identity stable.");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.lang, "en");
assert.ok(manifest.name && manifest.short_name && manifest.description);

const iconSizes = new Set(manifest.icons.map(icon => icon.sizes));
assert.ok(iconSizes.has("192x192"), "The manifest needs a 192px icon.");
assert.ok(iconSizes.has("512x512"), "The manifest needs a 512px icon.");
const maskableIcon = manifest.icons.find(icon =>
  icon.purpose?.split(/\s+/).includes("maskable"),
);
assert.equal(maskableIcon?.sizes, "512x512", "The manifest needs a 512px maskable icon.");

const readPngMetadata = async relativePath => {
  const png = await readFile(new URL(relativePath, outputDirectory));
  assert.equal(
    png.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `${relativePath} is not a PNG file.`,
  );
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  };
};

const appleTouchIconMatch = html.match(
  /<link rel="apple-touch-icon" sizes="(\d+)x(\d+)" href="([^"]+)">/,
);
assert.ok(appleTouchIconMatch, "The page needs a sized Apple touch icon.");
const appleTouchIcon = await readPngMetadata(appleTouchIconMatch[3]);
assert.deepEqual(
  [appleTouchIcon.width, appleTouchIcon.height],
  [Number(appleTouchIconMatch[1]), Number(appleTouchIconMatch[2])],
  "The Apple touch icon dimensions do not match its HTML declaration.",
);
assert.ok(
  appleTouchIcon.colorType !== 4 && appleTouchIcon.colorType !== 6,
  "The Apple touch icon must not be transparent.",
);

for (const icon of manifest.icons.filter(icon => icon.type === "image/png")) {
  const [declaredWidth, declaredHeight] = icon.sizes.split("x").map(Number);
  const metadata = await readPngMetadata(icon.src);
  assert.deepEqual(
    [metadata.width, metadata.height],
    [declaredWidth, declaredHeight],
    `${icon.src} dimensions do not match its manifest entry.`,
  );
  if (icon === maskableIcon) {
    assert.ok(
      metadata.colorType !== 4 && metadata.colorType !== 6,
      "The maskable icon must have an opaque, full-bleed background.",
    );
  }
}

const resourceReferences = [
  ...html.matchAll(/(?:src|href|data)="([^"]+)"/g),
  ...html.matchAll(/url\(["']?([^"')]+)["']?\)/g),
].map(match => match[1]);
for (const reference of resourceReferences) {
  assert.ok(
    !/^https?:/i.test(reference),
    `Runtime resource must be served locally for offline use: ${reference}`,
  );
  const relativePath = new URL(reference, new URL("da40.html", outputDirectory))
    .pathname
    .replace(outputDirectory.pathname, "");
  assert.ok(outputFiles.includes(relativePath), `Referenced app file is missing: ${reference}`);
  assert.ok(cachedFiles.includes(relativePath), `Referenced app file is not precached: ${reference}`);
}

assert.doesNotMatch(html, /\bcontenteditable\b/, "Use native form controls for editable values.");
assert.doesNotMatch(
  html,
  /<div\b[^>]*class="[^"]*\bupdate\b[^"]*"/,
  "Editable values must not be generic div elements.",
);
const textInputs = [...html.matchAll(/<input\b[^>]*\btype="text"[^>]*>/g)]
  .map(match => match[0]);
assert.ok(textInputs.length > 0, "The calculator must expose editable form controls.");
for (const input of textInputs) {
  for (const attribute of ["aria-label", "autocomplete", "inputmode", "maxlength"]) {
    assert.match(input, new RegExp(`\\b${attribute}="[^"]+"`), `Text input lacks ${attribute}: ${input}`);
  }
}
const checkboxes = [...html.matchAll(/<input\b[^>]*\btype="checkbox"[^>]*>/g)];
const labeledCheckboxes = [...html.matchAll(
  /<label>\s*<input\b[^>]*\btype="checkbox"[^>]*>[\s\S]*?<\/label>/g,
)];
assert.equal(
  labeledCheckboxes.length,
  checkboxes.length,
  "Every checkbox must have a clickable label.",
);

const htmlClasses = new Set(
  [...html.matchAll(/\bclass="([^"]*)"/g)]
    .flatMap(match => match[1].split(/\s+/))
    .filter(Boolean),
);
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const selectorSource = `${appSource}\n${pwaSource}`;
const literalSelectors = [...selectorSource.matchAll(
  /(?:querySelector(?:All)?|getElementById)\((['"])(.*?)\1\)/g,
)].map(match => match[2]);
for (const selector of literalSelectors) {
  for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    assert.ok(htmlClasses.has(match[1]), `Script references missing HTML class: ${match[1]}`);
  }
  for (const match of selector.matchAll(/#([A-Za-z_][\w-]*)/g)) {
    assert.ok(htmlIds.has(match[1]), `Script references missing HTML id: ${match[1]}`);
  }
  if (/^[A-Za-z_][\w-]*$/.test(selector)) {
    assert.ok(htmlIds.has(selector), `Script references missing HTML id: ${selector}`);
  }
}

const bundledLicenseNames = [
  "babel-runtime-corejs2-LICENSE.txt",
  "base64-js-LICENSE.txt",
  "bl-LICENSE.md",
  "bluebird-LICENSE.txt",
  "buffer-LICENSE.txt",
  "core-js-LICENSE.txt",
  "ieee754-LICENSE.txt",
  "inherits-LICENSE.txt",
  "json-url-LICENSE.txt",
  "lzma-LICENSE.txt",
  "msgpack5-LICENSE.txt",
  "readable-stream-LICENSE.txt",
  "safe-buffer-LICENSE.txt",
  "string-decoder-LICENSE.txt",
  "urlsafe-base64-LICENSE.txt",
  "util-deprecate-LICENSE.txt",
];
for (const licenseName of bundledLicenseNames) {
  const relativePath = `assets/vendor/json-url/licenses/${licenseName}`;
  const license = await readFile(new URL(relativePath, outputDirectory), "utf8");
  assert.ok(license.length > 100, `Bundled license is unexpectedly empty: ${relativePath}`);
  assert.ok(cachedFiles.includes(relativePath), `Bundled license is not precached: ${relativePath}`);
}

const codecBundleNames = [
  "json-url.js",
  "json-url-998.js",
  "json-url-lzma.js",
  "json-url-msgpack.js",
  "json-url-safe64.js",
];
const codecBundles = new Map(await Promise.all(codecBundleNames.map(async fileName => [
  fileName,
  await readFile(new URL(`assets/vendor/json-url/${fileName}`, outputDirectory), "utf8"),
])));
let codecContext;
const codecDocument = {
  currentScript: {
    src: "https://example.test/assets/vendor/json-url/json-url.js",
    tagName: "SCRIPT",
  },
  getElementsByTagName: () => [],
  createElement: tagName => {
    assert.equal(tagName, "script");
    const attributes = new Map();
    return {
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, String(value)),
    };
  },
  head: {
    appendChild: script => {
      script.parentNode = codecDocument.head;
      const fileName = new URL(script.src).pathname.split("/").at(-1);
      const bundle = codecBundles.get(fileName);
      if (!bundle) {
        script.onerror?.({ type: "error", target: script });
        return;
      }

      try {
        vm.runInContext(bundle, codecContext, { filename: fileName });
        script.onload?.({ type: "load", target: script });
      } catch (error) {
        script.onerror?.({ type: "error", target: script, error });
      }
    },
    removeChild: () => undefined,
  },
};
codecContext = {
  self: {},
  document: codecDocument,
  setTimeout,
  clearTimeout,
  console,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  DataView,
};
vm.createContext(codecContext);
vm.runInContext(codecBundles.get("json-url.js"), codecContext, { filename: "json-url.js" });
assert.equal(typeof codecContext.self.JsonUrl, "function", "The local JSON URL codec did not load.");
const codec = codecContext.self.JsonUrl("lzma");
const codecFixture = { aircraft: "DA40", offline: true, values: [1, 2, 3] };
const compressedFixture = await codec.compress(codecFixture);
const restoredFixture = await codec.decompress(compressedFixture);
assert.equal(JSON.stringify(restoredFixture), JSON.stringify(codecFixture));
const legacyFixture = {
  emptyMass: "1800",
  oat: "15",
  headwind: "8",
  offline: true,
};
const restoredLegacyFixture = await codec.decompress(
  "XQAAAAIrAAAAAAAAAABCKkim07boF4ii0rlrpdN1wDMlzcTeb2adp2idH_222FUeSoGmneqDRZboAUMgiN__4bWAAA",
);
assert.equal(
  JSON.stringify(restoredLegacyFixture),
  JSON.stringify(legacyFixture),
  "The local codec must remain compatible with existing saved links.",
);

console.log(
  `Verified ${outputFiles.length} offline files, ${manifest.icons.length} icons, and the local state codec.`,
);
