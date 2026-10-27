import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards the design tokens in app/globals.css: stylesheets use the shared type, radius and breakpoint
// scale instead of one-off values, so the app keeps one look as it grows.
const files = ['app/globals.css', 'app/home.css', 'app/dialogs.css', 'app/components/KccCalculator.module.css'];
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Declarations outside custom-property definitions, with comments removed.
const declarations = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+);/g)]
    .map(([, prop, value]) => ({ prop, value: value.trim() }))
    .filter(({ prop }) => !prop.startsWith('--'));

test('text sizes come from the type scale, and the smallest is 9px', () => {
  const sizes = [...read('app/globals.css').matchAll(/--text-[\w]+:\s*(\d+)px/g)].map(([, px]) => Number(px));
  assert.ok(sizes.length >= 8);
  assert.ok(Math.min(...sizes) >= 9, 'no type token below 9px');
  for (const file of files)
    for (const { prop, value } of declarations(read(file))) {
      if (prop === 'font-size') assert.match(value, /^(var\(--text-[\w]+\)|inherit)$/, `${file}: font-size ${value}`);
      if (prop === 'font') assert.match(value, /var\(--text-[\w]+\)|^inherit$/, `${file}: font ${value}`);
    }
});

test('corners use the radius tokens', () => {
  for (const file of files)
    for (const { prop, value } of declarations(read(file)))
      if (prop === 'border-radius')
        for (const part of value.split(/\s+/))
          assert.match(part, /^(var\(--radius-[\w]+\)|0|50%|inherit)$/, `${file}: border-radius ${value}`);
});

test('layouts share the same breakpoints', () => {
  for (const file of files)
    for (const [, query] of read(file).matchAll(/@media\s*([^{]+)\{/g))
      assert.match(
        query.trim(),
        /^\((max-width: (680|850)px|min-width: 681px|prefers-reduced-motion: reduce)\)$/,
        `${file}: @media ${query.trim()}`,
      );
});
