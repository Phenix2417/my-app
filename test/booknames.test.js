import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBookName, cleanBookTitle } from '../public/booknames.js';

test('book names keep the title, subtitle, author and year, and drop what download sites add', () => {
  const cases = [
    ['The Bible Book (DK) (z-library.sk, 1lib.sk, z-lib.sk).pdf', 'The Bible Book.pdf'],
    ['圣经 HOLY BIBLE(ESV-CUV)中英对照（修订版）（英国圣经公会和福音出版社出版）.epub', '圣经 HOLY BIBLE(ESV-CUV)中英对照（修订版）.epub'],
    ['Mere Christianity - C. S. Lewis (2001, HarperOne) [z-lib.org].epub', 'Mere Christianity - C. S. Lewis (2001).epub'],
    ['Knowing_God_J._I._Packer_(1993).epub', 'Knowing God J. I. Packer (1993).epub'],
    ['The Cross of Christ -- John Stott -- IVP Books, 2006 -- 9780830833207 -- 3f2a9c1be4d5f6a7b8c9d0e1f2a3b4c5 -- Anna’s Archive.epub', 'The Cross of Christ - John Stott (2006).epub'],
    ['Systematic Theology: An Introduction to Biblical Doctrine (Wayne Grudem) (Z-Library).pdf', 'Systematic Theology: An Introduction to Biblical Doctrine (Wayne Grudem).pdf'],
    ['The Holy Bible (NIV) [epub] (ISBN 978-0-310-43450-8).epub', 'The Holy Bible (NIV).epub'],
    ['Study notes.txt', 'Study notes.txt'],
  ];
  for (const [from, to] of cases) assert.equal(cleanBookName(from), to, from);
  assert.equal(cleanBookTitle('Orthodoxy (Retail) (www.ebook3000.com)'), 'Orthodoxy');
});
