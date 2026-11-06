import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncyclopedias, headwords } from '../server/encyclopedia.js';
import { cleanEntry } from '../scripts/build-encyclopedias.mjs';

test('headwords split alternatives and drop numbering', () => {
  assert.deepEqual(headwords('ABEL (1)'), ['abel']);
  assert.deepEqual(headwords('LIGHT; LIGHTNESS'), ['light', 'lightness']);
  assert.deepEqual(headwords('ABRAHAM’S BOSOM'), ["abraham's bosom"]);
});

test('entries: exact word or base form, several numbered entries, which sources have it', () => {
  const enc = createEncyclopedias({ data: {
    easton: [['ABEL', 'Easton text on Abel.'], ['KING', 'Easton text on kings.']],
    isbe: [['ABEL (1)', 'First.'], ['ABEL (2)', 'Second.'], ['AFTER; AFTERWARD', 'Word study.']],
  } });
  assert.deepEqual(enc.has('abel'), { easton: true, isbe: true });
  assert.deepEqual(enc.has('kings'), { easton: true, isbe: false });
  assert.deepEqual(enc.has('zzz'), { easton: false, isbe: false });
  assert.deepEqual(enc.entry('isbe', 'abel').entries.map((e) => e.term), ['ABEL (1)', 'ABEL (2)']);
  assert.equal(enc.entry('easton', 'after'), null);
  // Colouring uses Easton only (the ISBE also covers ordinary words like "after").
  assert.deepEqual(enc.marks(['abel', 'after', 'kings']), ['abel', 'kings']);
});

test('SWORD TEI markup becomes paragraphs and ⟦OSIS|label⟧ references', () => {
  const t = cleanEntry('<entryFree n="X"><title>X</title><p>Favour (<ref osisRef="Bible:Gen.6.8">Gen. 6:8</ref>; <foreign>charis</foreign> &amp; more).</p><p>Next</p></entryFree>');
  assert.equal(t, 'Favour (⟦Gen.6.8|Gen. 6:8⟧; charis & more).\nNext');
});

test('the built-in data loads (public domain Easton and ISBE)', () => {
  const enc = createEncyclopedias();
  assert.ok(enc.entry('easton', 'grace').entries[0].text.includes('⟦'));
  assert.ok(enc.entry('isbe', 'moses').entries.length >= 1);
});
