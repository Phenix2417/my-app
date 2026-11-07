// A book's name made readable: from a file name (or an ebook's own title) keep the title, subtitle, author and year,
// and the publisher when it's there, and drop what download sites and scanners add: site names and addresses, ISBNs,
// file hashes, format and scan labels. Bible version abbreviations — "(ESV-CUV)", "(NIV)" — are part of a title and stay.
const SITE = /z-?lib(rary)?|\b1lib\b|libgen|library genesis|anna[’']?s[ _-]?archive|\bb-ok\b|bookzz|ebook3000|epubee|sobooks|\bwww\.|[\w-]+\.(com|org|net|sk|io|cc|cn|ru|me|to|se|is|li|lc|gs|pw|xyz)\b/i;
const LABEL = /^(e-?books?|epub\d?|pdf|mobi|azw3?|kindle|retail|converted|scan(ned)?|ocr(ed)?|true pdf|ebook edition|kindle edition|v?\d+(\.\d+)+|eng(lish)?|repost|uploaded by .*)$/i;
const LANG_PAIR = /^[a-z]{2}-[a-z]{2,3}$/; // "en-zh" (lower case: "ESV-CUV" is a Bible version, part of the title)
const ISBN = /\b(isbn(-1[03])?[:\s]*)?(97[89][-\s]?)?\d[-\s]?\d{2,5}[-\s]?\d{2,7}[-\s]?\d{1,6}[-\s]?[\dX]\b/gi;
const HASH = /\b[0-9a-f]{24,}\b/gi;
const YEAR = /^(1[5-9]|20)\d\d$/;
const BOOK_EXT = /\.(epub|pdf|txt|mobi|azw3?|djvu|fb2|docx?|md)$/i;

export const isBookName = (name) => BOOK_EXT.test(String(name || ''));

// "The Bible Book (DK) (z-library.sk, 1lib.sk, z-lib.sk).pdf" -> "The Bible Book.pdf"
export function cleanBookName(name) {
  const raw = String(name || '');
  const ext = (BOOK_EXT.exec(raw) || [''])[0];
  return `${cleanBookTitle(raw.slice(0, raw.length - ext.length)) || raw.slice(0, raw.length - ext.length)}${ext}`;
}

export function cleanBookTitle(title) {
  let s = String(title || '').replace(/_+/g, ' ');
  // Anna's Archive style: "Title -- Author -- Publisher, 2019 -- ISBN -- hash -- Anna’s Archive"
  if (/\s--\s/.test(s)) {
    const parts = s.split(/\s+--\s+/).map((p) => p.trim()).filter(Boolean);
    const year = s.match(/\b(1[5-9]|20)\d\d\b/)?.[0];
    // Title, author, and the publisher (with its year) when given; not the ISBN, file code or site.
    const keep = parts.slice(0, 3).filter((p) => !SITE.test(p) && !/^[0-9a-f]{24,}$/i.test(p) && !/^\s*(isbn|97[89])/i.test(p));
    const [title, author, pub] = keep;
    s = [title, author].filter(Boolean).join(' - ') + (pub ? ` (${pub})` : year ? ` (${year})` : '');
  }
  // Bracketed groups: keep a year, a publisher or anything else that's part of the name; drop site names, labels, codes.
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\s*[(\[（【{]([^()[\]（）【】{}]*)[)\]）】}]/g, (m, inner) => {
      const parts = inner.split(/[,，;；]/).map((t) => t.trim()).filter(Boolean);
      if (!parts.length) return '';
      if (parts.every((t) => YEAR.test(t))) return m;
      const kept = parts.filter((t) => YEAR.test(t) || !(SITE.test(t) || LABEL.test(t) || LANG_PAIR.test(t) || /^(isbn|97[89])/i.test(t) || /^[0-9a-f]{16,}$/i.test(t)));
      if (!kept.length) return '';
      if (kept.length === parts.length) return m;
      const open = m.trim()[0], close = { '(': ')', '[': ']', '（': '）', '【': '】', '{': '}' }[open];
      return `${/^\s/.test(m) ? ' ' : ''}${open}${kept.join(', ')}${close}`;
    });
  }
  s = s.replace(ISBN, (m) => (m.replace(/\D/g, '').length >= 10 ? '' : m)).replace(HASH, '');
  // Site names and addresses outside brackets.
  s = s.replace(/\s*[-–|]?\s*\b(?:www\.)?[\w-]+\.(?:com|org|net|sk|io|cc|cn|ru|me|to|se|is|li|lc|gs|pw|xyz)\b/gi, '')
    .replace(/\s*[-–|]?\s*\b(z-?library|1lib|libgen|anna[’']?s archive)\b/gi, '');
  return s.replace(/\(\s*\)|\[\s*\]|（\s*）|【\s*】/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—|.,;:]+|[\s\-–—|,;:]+$/g, '').trim();
}
