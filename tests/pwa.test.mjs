import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const serviceWorker = await readFile(
  new URL("../dist/sw.js", import.meta.url),
  "utf8",
);
const cacheNameMatch = serviceWorker.match(/static-([a-f0-9]{16})/);
assert.ok(cacheNameMatch);
const currentCacheName = `da40-static-${cacheNameMatch[1]}`;
const precacheMatch = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
assert.ok(precacheMatch);
const precacheUrls = JSON.parse(precacheMatch[1]);

const createHarness = ({
  addAllError,
  cacheMatch = async () => undefined,
  cacheNames = [],
  fetchResponse,
} = {}) => {
  const listeners = new Map();
  const addedRequests = [];
  const deletedCaches = [];
  let claimedClients = 0;
  let skippedWaiting = 0;
  let fetchCalls = 0;

  const context = {
    self: {
      registration: { scope: "https://example.test/app/" },
      location: { origin: "https://example.test" },
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => { skippedWaiting += 1; },
      clients: {
        claim: async () => { claimedClients += 1; },
      },
    },
    caches: {
      open: async name => {
        assert.equal(name, currentCacheName);
        return {
          addAll: async requests => {
            if (addAllError) {
              throw addAllError;
            }
            addedRequests.push(...requests);
          },
        };
      },
      keys: async () => cacheNames,
      delete: async name => {
        deletedCaches.push(name);
        return true;
      },
      match: cacheMatch,
    },
    fetch: async request => {
      fetchCalls += 1;
      return typeof fetchResponse === "function" ? fetchResponse(request) : fetchResponse;
    },
    Request,
    URL,
  };
  vm.createContext(context);
  vm.runInContext(serviceWorker, context);

  return {
    addedRequests,
    deletedCaches,
    listeners,
    get claimedClients() { return claimedClients; },
    get fetchCalls() { return fetchCalls; },
    get skippedWaiting() { return skippedWaiting; },
  };
};

const dispatchExtendableEvent = async listener => {
  let completion;
  listener({ waitUntil: promise => { completion = promise; } });
  assert.ok(completion, "The service worker event must extend its lifetime.");
  await completion;
};

const dispatchFetch = (listener, request) => {
  let response;
  listener({
    request,
    respondWith: promise => { response = promise; },
  });
  return response;
};

test("install atomically caches every local file before activating", async () => {
  const harness = createHarness();
  await dispatchExtendableEvent(harness.listeners.get("install"));

  assert.equal(harness.addedRequests.length, precacheUrls.length);
  assert.ok(harness.addedRequests.every(request =>
    request.url.startsWith("https://example.test/app/") && request.cache === "reload",
  ));
  assert.equal(harness.skippedWaiting, 1);
});

test("a failed precache prevents the new worker from activating", async () => {
  const harness = createHarness({ addAllError: new Error("missing asset") });
  await assert.rejects(
    dispatchExtendableEvent(harness.listeners.get("install")),
    /missing asset/,
  );
  assert.equal(harness.skippedWaiting, 0);
});

test("activate removes only obsolete DA40 caches", async () => {
  const harness = createHarness({
    cacheNames: ["unrelated-app", "da40-v25", currentCacheName],
  });
  await dispatchExtendableEvent(harness.listeners.get("activate"));

  assert.deepEqual(harness.deletedCaches, ["da40-v25"]);
  assert.equal(harness.claimedClients, 1);
});

test("saved app URLs fall back to the cached document while offline", async () => {
  const appShell = { source: "offline app shell" };
  const harness = createHarness({
    cacheMatch: async request => {
      const url = String(request.url ?? request);
      return url === "https://example.test/app/da40.html" ? appShell : undefined;
    },
    fetchResponse: () => { throw new Error("network must not be used"); },
  });
  const response = dispatchFetch(harness.listeners.get("fetch"), {
    method: "GET",
    mode: "navigate",
    url: "https://example.test/app/da40.html?s=saved-state",
  });

  assert.equal(await response, appShell);
  assert.equal(harness.fetchCalls, 0);
});

test("precached resources are returned without using the network", async () => {
  const cachedResponse = { source: "cache" };
  const harness = createHarness({
    cacheMatch: async request =>
      request.url.endsWith("/assets/js/da40.js") ? cachedResponse : undefined,
    fetchResponse: () => { throw new Error("network must not be used"); },
  });
  const response = dispatchFetch(harness.listeners.get("fetch"), {
    method: "GET",
    mode: "cors",
    url: "https://example.test/app/assets/js/da40.js",
  });

  assert.equal(await response, cachedResponse);
  assert.equal(harness.fetchCalls, 0);
});

test("uncached same-origin requests use the network and external requests are ignored", async () => {
  const networkResponse = { source: "network" };
  const harness = createHarness({ fetchResponse: networkResponse });
  const sameOriginResponse = dispatchFetch(harness.listeners.get("fetch"), {
    method: "GET",
    mode: "cors",
    url: "https://example.test/app/new-file.txt",
  });
  assert.equal(await sameOriginResponse, networkResponse);
  assert.equal(harness.fetchCalls, 1);

  const externalResponse = dispatchFetch(harness.listeners.get("fetch"), {
    method: "GET",
    mode: "cors",
    url: "https://outside.example/file.txt",
  });
  assert.equal(externalResponse, undefined);
  assert.equal(harness.fetchCalls, 1);
});
