import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sources = await Promise.all([
  'performance-common.js',
  'flight-tools.js',
].map(fileName => readFile(
  new URL(`../dist/assets/js/${fileName}`, import.meta.url),
  'utf8',
)));
const context = vm.createContext({});
for (const source of sources) {
  vm.runInContext(source, context);
}
const evaluate = expression => vm.runInContext(expression, context);

test('shared wind triangle handles crosswind, calm wind, and impossible wind', () => {
  assert.equal(
    evaluate('Math.round(FlightTools.calculateWindTriangle(360, 120, 270, 20).trueHeading)'),
    350,
  );
  assert.equal(evaluate('FlightTools.calculateWindTriangle(90, 120, 0, 0).groundSpeed'), 120);
  assert.equal(evaluate('FlightTools.calculateWindTriangle(0, 10, 90, 20) === null'), true);
});

test('shared descent and standard-rate helpers preserve the DA40 formulas', () => {
  assert.equal(evaluate('FlightTools.descentDistance(1000, 3).toFixed(1)'), '3.1');
  assert.equal(evaluate('Math.round(FlightTools.standardRateBank(120))'), 18);
});

test('shared tool interactions preserve the original DA40 rounding', () => {
  const result = evaluate(`(() => {
    const makeElement = (value) => {
      const classes = new Set();
      const listeners = new Map();
      return {
        ...(value === undefined ? {} : { value }),
        textContent: '',
        checked: false,
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          contains: name => classes.has(name),
        },
        addEventListener(type, listener) {
          const registered = listeners.get(type) ?? [];
          registered.push(listener);
          listeners.set(type, registered);
        },
        fire(type) {
          for (const listener of listeners.get(type) ?? []) listener();
        },
      };
    };
    const inputSelectors = [
      '.wc-dir', '.wc-vel', '.wc-rwy', '.h-in', '.h-out', '.h-hdg', '.h-left',
      '.vr', '.tc', '.winvel', '.windir', '.tas', '.d-slope', '.d-gs', '.d-alt',
      '.t-tas', '.c-cel', '.c-fah', '.c-nm', '.c-sm', '.c-ft', '.c-m',
      '.c-lb', '.c-kg', '.fpm-gs', '.fpm-rate', '.fpm-gradient',
    ];
    const outputSelectors = [
      '.wc-cross', '.wc-head', '.h-type', '.hdg', '.gs', '.d-dist', '.d-rate',
      '.t-bank',
    ];
    const elements = new Map([
      ...inputSelectors.map(selector => [selector, makeElement(selector === '.d-slope' ? '3' : '')]),
      ...outputSelectors.map(selector => [selector, makeElement()]),
    ]);
    const root = {
      querySelector: selector => elements.get(selector) ?? null,
      querySelectorAll: selector => selector === 'input.update'
        ? inputSelectors.map(inputSelector => elements.get(inputSelector))
        : [],
    };
    elements.get('.fpm-rate').value = '777';
    elements.get('.fpm-gradient').value = '333';
    FlightTools.initialize(root);
    const initialFpmPair = [
      elements.get('.fpm-rate').value,
      elements.get('.fpm-gradient').value,
    ];

    const convert = (selector, value) => {
      const input = elements.get(selector);
      input.fire('focus');
      input.value = value;
      input.fire('input');
      input.fire('blur');
    };
    convert('.c-cel', '10');
    convert('.c-nm', '10');
    convert('.c-ft', '10');
    convert('.c-lb', '10');
    elements.get('.fpm-gs').value = '100';
    convert('.fpm-rate', '500');
    return JSON.stringify({
      fahrenheit: elements.get('.c-fah').value,
      statuteMiles: elements.get('.c-sm').value,
      metres: elements.get('.c-m').value,
      kilograms: elements.get('.c-kg').value,
      initialFpmPair,
      gradient: elements.get('.fpm-gradient').value,
    });
  })()`);
  assert.deepEqual(JSON.parse(result), {
    fahrenheit: '50.00',
    statuteMiles: '11.51',
    metres: '3',
    kilograms: '5',
    initialFpmPair: ['777', '333'],
    gradient: '300',
  });
});
