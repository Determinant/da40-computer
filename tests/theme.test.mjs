import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/assets/js/theme.js', import.meta.url), 'utf8');
const start = ({ saved = null, dark = false, storageBlocked = false } = {}) => {
  const listeners = new Map();
  const documentListeners = new Map();
  const systemListeners = new Map();
  let stored = saved;
  let ready = false;
  const system = { matches: dark, addEventListener: (name, callback) => systemListeners.set(name, callback) };
  const attributes = new Map();
  const buttonListeners = new Map();
  const button = {
    textContent: '',
    setAttribute: (key, value) => attributes.set(key, value),
    addEventListener: (name, callback) => buttonListeners.set(name, callback),
  };
  const document = {
    documentElement: { dataset: {} },
    querySelector: () => ({ setAttribute: (name, value) => attributes.set('meta-' + name, value) }),
    getElementById: () => ready ? button : null,
    addEventListener: (name, callback) => documentListeners.set(name, callback),
  };
  const context = vm.createContext({
    document,
    window: { matchMedia: () => system, addEventListener: (name, callback) => listeners.set(name, callback) },
    localStorage: {
      getItem() {
        if (storageBlocked) throw new Error('blocked');
        return stored;
      },
      setItem(key, value) {
        assert.equal(key, 'flight-computer-theme');
        if (storageBlocked) throw new Error('blocked');
        stored = value;
      },
    },
  });
  vm.runInContext(source, context);
  const initialTheme = document.documentElement.dataset.theme;
  ready = true;
  documentListeners.get('DOMContentLoaded')();
  return {
    document, button, attributes, initialTheme,
    stored: () => stored,
    click: () => buttonListeners.get('click')(),
    systemChange: value => {
      system.matches = value;
      systemListeners.get('change')();
    },
    storageChange: value => listeners.get('storage')({ key: 'flight-computer-theme', newValue: value }),
  };
};

test('system theme applies before paint and follows changes until explicitly toggled', () => {
  const page = start({ dark: true });
  assert.equal(page.initialTheme, 'dark');
  assert.equal(page.button.textContent, 'Light mode');
  page.systemChange(false);
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  page.click();
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.stored(), 'dark');
  assert.equal(page.attributes.get('aria-label'), 'Switch to light mode');
  page.systemChange(false);
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
});

test('saved preference survives page loads, syncs other tabs, and handles unavailable storage', () => {
  const first = start({ saved: 'light', dark: true });
  assert.equal(first.initialTheme, 'light');
  first.click();
  const second = start({ saved: first.stored(), dark: false });
  assert.equal(second.initialTheme, 'dark');
  second.storageChange('light');
  assert.equal(second.document.documentElement.dataset.theme, 'light');
  second.storageChange(null);
  second.systemChange(true);
  assert.equal(second.document.documentElement.dataset.theme, 'dark');
  const blocked = start({ storageBlocked: true });
  blocked.click();
  assert.equal(blocked.document.documentElement.dataset.theme, 'dark');
  blocked.click();
  assert.equal(blocked.document.documentElement.dataset.theme, 'light');
});
