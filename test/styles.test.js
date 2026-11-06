import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// A broken stylesheet (a leftover half rule) makes browsers drop the next rule silently — once it was the
// Read page's layout, and the Bible text stopped scrolling. Braces must balance and no declaration may sit
// outside a rule.
test('styles.css has no stray declarations or unbalanced braces', () => {
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  css.split('\n').forEach((line, i) => {
    const s = line.trim();
    if (depth === 0 && /^[a-z-]+\s*:[^{]*;?\s*}?$/i.test(s) && !s.includes('{')) assert.fail(`stray declaration on line ${i + 1}: ${s}`);
    for (const ch of line) { if (ch === '{') depth++; if (ch === '}') depth--; assert.ok(depth >= 0, `unbalanced } on line ${i + 1}`); }
  });
  assert.equal(depth, 0, 'unclosed {');
});
