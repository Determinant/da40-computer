import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { collectRelativeFiles } from "./file-tree.mjs";

const outputDirectory = new URL("../dist/", import.meta.url);
const serviceWorker = await readFile(new URL("sw.js", outputDirectory), "utf8");
const html = await readFile(new URL("da40.html", outputDirectory), "utf8");
const calculatorCss = await readFile(
  new URL("assets/calculator.css", outputDirectory),
  "utf8",
);
const appSource = await readFile(new URL("assets/js/da40.js", outputDirectory), "utf8");
const da62Html = await readFile(new URL("da62.html", outputDirectory), "utf8");
const da62AppSource = await readFile(new URL("assets/js/da62.js", outputDirectory), "utf8");
const flightToolsSource = await readFile(
  new URL("assets/js/flight-tools.js", outputDirectory),
  "utf8",
);
const pwaSource = await readFile(new URL("assets/js/pwa.js", outputDirectory), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("manifest.webmanifest", outputDirectory), "utf8"),
);
const da62Manifest = JSON.parse(
  await readFile(new URL("da62.webmanifest", outputDirectory), "utf8"),
);
const iconSource = await readFile(
  new URL("assets/icons/icon.svg", outputDirectory),
  "utf8",
);
const previewServerSource = await readFile(new URL("serve.mjs", import.meta.url), "utf8");

const pageHtml = [
  ["DA40", html],
  ["DA62", da62Html],
];
const sharedSubtitle = "Weight, balance, performance, and flight planning";
const sharedBasisLabels = [
  "Loading.",
  "Field performance.",
  "Climb performance.",
  "Coverage.",
  "Use.",
];
for (const [aircraft, aircraftHtml] of pageHtml) {
  assert.match(
    aircraftHtml,
    new RegExp(`<p class="subtitle">${sharedSubtitle}</p>`),
    `${aircraft} page must use the shared calculator subtitle.`,
  );
  const basis = aircraftHtml.match(
    /<section class="card notes" aria-labelledby="basis-title">([\s\S]*?)<\/section>/,
  )?.[1];
  assert.ok(basis, `${aircraft} page must include Basis and limitations.`);
  assert.deepEqual(
    [...basis.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(match => match[1]),
    sharedBasisLabels,
    `${aircraft} Basis and limitations must use the shared information structure.`,
  );
  assert.match(
    aircraftHtml,
    new RegExp(`<p class="source">Source: ${aircraft.replace(/(DA)(\d+)/, "$1 $2")} AFM,`),
    `${aircraft} page must identify its AFM source below the limitations.`,
  );
  for (const tableRole of [
    "weights-table",
    "environment-table",
    "aircraft-data-table",
    "field-performance-table",
    "climb-performance-table",
    "tools-table",
  ]) {
    assert.match(
      aircraftHtml,
      new RegExp(`<table class="[^"]*\\b${tableRole}\\b[^"]*"`),
      `${aircraft} page must use the shared ${tableRole} layout.`,
    );
  }
}

assert.match(
  calculatorCss,
  /table\.main td,\s*table\.main th \{[\s\S]*?padding: var\(--table-cell-padding-block\) var\(--table-cell-padding-inline\);/,
  "All calculator cells must use the shared spacing scale.",
);
assert.match(
  calculatorCss,
  /\.summary-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  "The on-screen calculator summary must use two shrinkable, equal columns.",
);
assert.match(
  calculatorCss,
  /@media \(max-width: 600px\) \{\s*\.summary-grid \{\s*display: block;\s*\}/,
  "The on-screen calculator summary must remain two-column above 600px.",
);
assert.doesNotMatch(
  calculatorCss,
  /#(?:field-performance|climb-performance)\s+(?:td|th)\b[^{]*\{[^}]*padding/s,
  "Performance-table IDs must not override the shared cell spacing.",
);
assert.match(
  calculatorCss,
  /table\.main input\[type="text"\] \{[\s\S]*?padding: var\(--table-cell-padding-block\) var\(--table-cell-padding-inline\);[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
  "Calculator text inputs must remain flat, borderless cell surfaces.",
);
assert.match(
  calculatorCss,
  /td:has\(input\[type="text"\]\),\s*table\.main td:has\(> \.table-edit\) \{\s*padding: 0;\s*background: var\(--control-fill\);/,
  "Editable cells must own the input background without double padding.",
);
assert.match(
  calculatorCss,
  /\.tools-drawer \{[\s\S]*?inset: 0 0 0 auto;[\s\S]*?margin: 0;/,
  "The General Tools drawer must stay pinned inside the right viewport edge.",
);
assert.match(
  calculatorCss,
  /tr\.header input\[type="text"\]:focus-visible,[\s\S]*?box-shadow: inset 0 -2px 0 var\(--accent\);/,
  "Header and compound inputs must retain an individual keyboard-focus cue.",
);
assert.match(
  calculatorCss,
  /@media \(max-width: 520px\) \{[\s\S]*?table\.main input\[type="text"\],[\s\S]*?font-size: 16px;/,
  "Mobile text inputs must remain large enough to focus without browser zoom.",
);
assert.match(
  previewServerSource,
  /\["\.css", "text\/css; charset=utf-8"\]/,
  "The local preview server must serve the calculator stylesheet as CSS.",
);

const da40ChartEmbeds = [
  ["takeoff", "assets/charts/takeoff-chart.svg"],
  ["landing", "assets/charts/landing-chart.svg"],
  ["takeoff-climb", "assets/charts/takeoff-climb-chart.svg"],
  ["cruise-climb", "assets/charts/cruise-climb-chart.svg"],
];
assert.doesNotMatch(html, /<object\b[^>]*class="chart"/);
for (const [id, relativePath] of da40ChartEmbeds) {
  assert.match(
    html,
    new RegExp(`<div class="chart chart-inline" id="${id}"><template><style>`),
    `Built DA40 page must inline the original ${id} chart for file:// use.`,
  );
}
assert.doesNotMatch(
  html,
  /data-chart-source=/,
  "Built DA40 chart markup must not retain paths to removed source files.",
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
for (const [, relativePath] of da40ChartEmbeds) {
  assert.ok(
    !outputFiles.includes(relativePath),
    `Inlined chart must not also be shipped as a standalone file: ${relativePath}`,
  );
}

for (const match of calculatorCss.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const reference = match[1];
  assert.ok(
    !/^https?:/i.test(reference),
    `Stylesheet resource must be served locally for offline use: ${reference}`,
  );
  const relativePath = new URL(reference, new URL("assets/calculator.css", outputDirectory))
    .pathname
    .replace(outputDirectory.pathname, "");
  assert.ok(outputFiles.includes(relativePath), `Referenced stylesheet file is missing: ${reference}`);
  assert.ok(cachedFiles.includes(relativePath), `Referenced stylesheet file is not precached: ${reference}`);
}

const manifests = [
  { aircraft: "DA40", fileName: "manifest.webmanifest", html, manifest },
  { aircraft: "DA62", fileName: "da62.webmanifest", html: da62Html, manifest: da62Manifest },
];
const themeColor = "#172033";
const backgroundColor = "#edf1f5";
for (const entry of manifests) {
  assert.match(
    entry.html,
    new RegExp(`<link rel="manifest" href="${entry.fileName}">`),
    `${entry.aircraft} page must link its own manifest.`,
  );
  assert.equal(
    entry.manifest.id,
    entry.manifest.start_url,
    `${entry.aircraft} installed-app identity must match its start URL.`,
  );
  assert.equal(entry.manifest.scope, "./");
  assert.equal(entry.manifest.display, "standalone");
  assert.equal(entry.manifest.lang, "en");
  assert.equal(entry.manifest.theme_color, themeColor);
  assert.equal(entry.manifest.background_color, backgroundColor);
  assert.match(
    entry.html,
    new RegExp(`<meta name="theme-color" content="${themeColor}">`),
    `${entry.aircraft} document and manifest must use the same theme color.`,
  );
  assert.match(
    entry.html,
    /<meta name="mobile-web-app-capable" content="yes">/,
    `${entry.aircraft} page must declare its standalone-capable presentation.`,
  );
  assert.ok(entry.manifest.name && entry.manifest.short_name && entry.manifest.description);
  assert.match(entry.manifest.start_url, new RegExp(`${entry.aircraft.toLowerCase()}\\.html$`));

  assert.equal(
    entry.manifest.icons.length,
    2,
    `${entry.aircraft} manifest must use the minimal shared PWA icon set.`,
  );
  const iconSizes = new Set(entry.manifest.icons.map(icon => icon.sizes));
  assert.ok(iconSizes.has("192x192"), `${entry.aircraft} manifest needs a 192px icon.`);
  assert.ok(iconSizes.has("512x512"), `${entry.aircraft} manifest needs a 512px icon.`);
  const maskableIcon = entry.manifest.icons.find(icon =>
    icon.purpose?.split(/\s+/).includes("maskable"),
  );
  assert.equal(
    maskableIcon?.sizes,
    "512x512",
    `${entry.aircraft} manifest needs a 512px maskable icon.`,
  );
}

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

for (const [aircraft, pageHtml] of [["DA40", html], ["DA62", da62Html]]) {
  const appleTouchIconMatch = pageHtml.match(
    /<link rel="apple-touch-icon" sizes="(\d+)x(\d+)" href="([^"]+)">/,
  );
  assert.ok(appleTouchIconMatch, `${aircraft} page needs a sized Apple touch icon.`);
  const appleTouchIcon = await readPngMetadata(appleTouchIconMatch[3]);
  assert.deepEqual(
    [appleTouchIcon.width, appleTouchIcon.height],
    [Number(appleTouchIconMatch[1]), Number(appleTouchIconMatch[2])],
    `${aircraft} Apple touch icon dimensions do not match its HTML declaration.`,
  );
  assert.ok(
    appleTouchIcon.colorType !== 4 && appleTouchIcon.colorType !== 6,
    `${aircraft} Apple touch icon must not be transparent.`,
  );
}

for (const entry of manifests) {
  const maskableIcon = entry.manifest.icons.find(icon =>
    icon.purpose?.split(/\s+/).includes("maskable"),
  );
  for (const icon of entry.manifest.icons.filter(icon => icon.type === "image/png")) {
    const [declaredWidth, declaredHeight] = icon.sizes.split("x").map(Number);
    const metadata = await readPngMetadata(icon.src);
    assert.deepEqual(
      [metadata.width, metadata.height],
      [declaredWidth, declaredHeight],
      `${icon.src} dimensions do not match its manifest entry.`,
    );
    if (icon !== maskableIcon) {
      continue;
    }
    assert.ok(
      metadata.colorType !== 4 && metadata.colorType !== 6,
      "The maskable icon must have an opaque, full-bleed background.",
    );
  }
}

assert.deepEqual(
  da62Manifest.icons,
  manifest.icons,
  "DA40 and DA62 manifests must use the shared DA40/62 icon set.",
);
assert.match(
  iconSource,
  /<text[^>]*font-family="B612, sans-serif"[^>]*>DA40\/62<\/text>/,
  "The shared icon must label both aircraft with the bundled B612 font.",
);
assert.match(
  da62Html,
  /<link rel="icon" href="assets\/icons\/icon\.svg" type="image\/svg\+xml">/,
  "DA62 must use the shared DA40/62 browser icon.",
);
assert.match(
  da62Html,
  /<link rel="apple-touch-icon" sizes="180x180" href="assets\/icons\/apple-touch-icon-180\.png">/,
  "DA62 must use the shared DA40/62 Apple touch icon.",
);

const pages = [
  { fileName: "da40.html", html, source: `${appSource}\n${flightToolsSource}\n${pwaSource}` },
  { fileName: "da62.html", html: da62Html, source: `${da62AppSource}\n${flightToolsSource}\n${pwaSource}` },
];
for (const page of pages) {
  const resourceReferences = [
    ...page.html.matchAll(/(?:src|href|data)="([^"]+)"/g),
    ...page.html.matchAll(/url\(["']?([^"')]+)["']?\)/g),
  ].map(match => match[1]).filter(reference =>
    !reference.startsWith("data:") && !reference.startsWith("#"),
  );
  for (const reference of resourceReferences) {
    assert.ok(
      !/^https?:/i.test(reference),
      `Runtime resource must be served locally for offline use: ${reference}`,
    );
    const relativePath = new URL(reference, new URL(page.fileName, outputDirectory))
      .pathname
      .replace(outputDirectory.pathname, "");
    assert.ok(outputFiles.includes(relativePath), `Referenced app file is missing: ${reference}`);
    assert.ok(cachedFiles.includes(relativePath), `Referenced app file is not precached: ${reference}`);
  }

  assert.doesNotMatch(
    page.html,
    /\bcontenteditable\b/,
    `${page.fileName} must use native form controls for editable values.`,
  );
  assert.doesNotMatch(
    page.html,
    /<div\b[^>]*class="[^"]*\bupdate\b[^"]*"/,
    `${page.fileName} must not use generic div elements for editable values.`,
  );
  const textInputs = [...page.html.matchAll(/<input\b[^>]*\btype="text"[^>]*>/g)]
    .map(match => match[0]);
  assert.ok(textInputs.length > 0, `${page.fileName} must expose editable form controls.`);
  for (const input of textInputs) {
    for (const attribute of ["aria-label", "autocomplete", "inputmode", "maxlength"]) {
      assert.match(
        input,
        new RegExp(`\\b${attribute}="[^"]+"`),
        `${page.fileName} text input lacks ${attribute}: ${input}`,
      );
    }
  }
  const checkboxes = [...page.html.matchAll(/<input\b[^>]*\btype="checkbox"[^>]*>/g)];
  const labeledCheckboxes = [...page.html.matchAll(
    /<label>\s*<input\b[^>]*\btype="checkbox"[^>]*>[\s\S]*?<\/label>/g,
  )];
  assert.equal(
    labeledCheckboxes.length,
    checkboxes.length,
    `${page.fileName} must give every checkbox a clickable label.`,
  );

  const htmlClasses = new Set(
    [...page.html.matchAll(/\bclass="([^"]*)"/g)]
      .flatMap(match => match[1].split(/\s+/))
      .filter(Boolean),
  );
  const htmlIds = new Set([...page.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const literalSelectors = [...page.source.matchAll(
    /(?:querySelector(?:All)?|getElementById|\bquery|\bgetValue|\bnumberValue|\bsetInput|\bsetOutput)\((['"])([^'"]*)\1(?=[,)])/g,
  )].map(match => match[2]);
  for (const selector of literalSelectors) {
    for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      assert.ok(
        htmlClasses.has(match[1]),
        `${page.fileName} script references missing HTML class: ${match[1]}`,
      );
    }
    for (const match of selector.matchAll(/#([A-Za-z_][\w-]*)/g)) {
      assert.ok(
        htmlIds.has(match[1]),
        `${page.fileName} script references missing HTML id: ${match[1]}`,
      );
    }
    if (/^[A-Za-z_][\w-]*$/.test(selector)) {
      assert.ok(
        htmlIds.has(selector),
        `${page.fileName} script references missing HTML id: ${selector}`,
      );
    }
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

const codecBundleName = "json-url-single.js";
const codecBundle = await readFile(
  new URL(`assets/vendor/json-url/${codecBundleName}`, outputDirectory),
  "utf8",
);
assert.ok(
  cachedFiles.includes(`assets/vendor/json-url/${codecBundleName}`),
  "The self-contained JSON URL codec is not precached.",
);
assert.ok(
  cachedFiles.includes("assets/vendor/json-url/json-url-single.js.LICENSE.txt"),
  "The self-contained JSON URL codec notice is not precached.",
);
const codecDocument = {
  currentScript: {
    src: `https://example.test/assets/vendor/json-url/${codecBundleName}`,
    tagName: "SCRIPT",
  },
  getElementsByTagName: () => [],
};
const codecContext = {
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
vm.runInContext(codecBundle, codecContext, { filename: codecBundleName });
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
  `Verified ${outputFiles.length} offline files, ${manifests.reduce((count, entry) => count + entry.manifest.icons.length, 0)} icons, and the local state codec.`,
);
