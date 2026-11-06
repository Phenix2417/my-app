// Opening the person's own books in the browser: EPUB (a zip of XHTML pages) and plain text.
// Book pages are never inserted as HTML: each one is rebuilt from an allowlist of elements, so nothing in a
// book file can run code or style the app.

/* ----- Zip (EPUB container) ----- */
export async function openZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map(), utf8 = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    entries.set(utf8.decode(u8.subarray(p + 46, p + 46 + nlen)), { method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  async function read(name) {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error('unsupported compression');
    const out = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  return { entries, read, text: async (name) => { const b = await read(name); return b && utf8.decode(b); } };
}

// "OEBPS/text/ch1.xhtml" + "../images/a.jpg#x" -> "OEBPS/images/a.jpg" (the #fragment is dropped)
export function resolvePath(fromFile, href) {
  let rel = String(href || '').split('#')[0];
  try { rel = decodeURIComponent(rel); } catch { /* keep as is */ }
  if (!rel) return fromFile;
  const parts = rel.startsWith('/') ? [] : fromFile.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
const fragmentOf = (href) => { const i = String(href).indexOf('#'); return i < 0 ? '' : String(href).slice(i + 1); };

const parseXml = (text, type = 'application/xml') => {
  let doc = new DOMParser().parseFromString(text, type);
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html');
  return doc;
};
const byTag = (root, name) => [...root.getElementsByTagNameNS('*', name)];
const DC = 'http://purl.org/dc/elements/1.1/';

/* ----- EPUB ----- */
export async function openEpub(buf) {
  const zip = await openZip(buf);
  const container = await zip.text('META-INF/container.xml');
  const opfPath = container && byTag(parseXml(container), 'rootfile')[0]?.getAttribute('full-path');
  const opfText = opfPath && await zip.text(opfPath);
  if (!opfText) throw new Error('missing package file');
  const opf = parseXml(opfText);
  const dc = (name) => (opf.getElementsByTagNameNS(DC, name)[0]?.textContent || '').replace(/\s+/g, ' ').trim();

  const manifest = new Map();
  for (const it of byTag(opf, 'item')) {
    manifest.set(it.getAttribute('id'), { href: resolvePath(opfPath, it.getAttribute('href')), type: it.getAttribute('media-type') || '',
      props: (it.getAttribute('properties') || '').split(/\s+/) });
  }
  const spineEl = byTag(opf, 'spine')[0];
  const chapters = byTag(opf, 'itemref').map((r) => manifest.get(r.getAttribute('idref')))
    .filter((it) => it && /html|xml/.test(it.type)).map((it) => ({ href: it.href }));
  if (!chapters.length) throw new Error('no readable pages');

  // Cover image: EPUB 3 marks it; EPUB 2 names it in <meta name="cover">.
  const items = [...manifest.entries()];
  const coverId = byTag(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const cover = items.find(([, it]) => it.props.includes('cover-image'))?.[1]
    || manifest.get(coverId)
    || items.find(([id, it]) => /cover/i.test(id + it.href) && it.type.startsWith('image/'))?.[1];

  // Table of contents: EPUB 3 nav document, else the EPUB 2 NCX file.
  const toc = [];
  const navItem = items.find(([, it]) => it.props.includes('nav'))?.[1];
  if (navItem) {
    const nav = parseXml(await zip.text(navItem.href) || '', 'application/xhtml+xml');
    const navs = byTag(nav, 'nav');
    const tocNav = navs.find((n) => /toc/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) || navs[0];
    if (tocNav) {
      for (const a of byTag(tocNav, 'a')) {
        let depth = 0;
        for (let el = a.parentElement; el && el !== tocNav; el = el.parentElement) if (/^(ol|ul)$/i.test(el.localName)) depth++;
        const label = a.textContent.replace(/\s+/g, ' ').trim();
        if (label && a.getAttribute('href')) toc.push({ label, file: resolvePath(navItem.href, a.getAttribute('href')), anchor: fragmentOf(a.getAttribute('href')), depth: Math.max(0, depth - 1) });
      }
    }
  }
  if (!toc.length) {
    const ncxItem = manifest.get(spineEl?.getAttribute('toc')) || items.find(([, it]) => it.type === 'application/x-dtbncx+xml')?.[1];
    const ncxText = ncxItem && await zip.text(ncxItem.href);
    if (ncxText) {
      const walk = (parent, depth) => {
        for (const np of [...parent.children].filter((c) => c.localName === 'navPoint')) {
          const label = (byTag(np, 'text')[0]?.textContent || '').replace(/\s+/g, ' ').trim();
          const src = [...np.children].find((c) => c.localName === 'content')?.getAttribute('src');
          if (label && src) toc.push({ label, file: resolvePath(ncxItem.href, src), anchor: fragmentOf(src), depth });
          walk(np, depth + 1);
        }
      };
      const navMap = byTag(parseXml(ncxText), 'navMap')[0];
      if (navMap) walk(navMap, 0);
    }
  }
  for (const t of toc) t.chapter = chapters.findIndex((c) => c.href === t.file);
  const tocInBook = toc.filter((t) => t.chapter >= 0);

  return { kind: 'epub', title: dc('title'), author: dc('creator'), lang: dc('language'), zip, chapters, toc: tocInBook,
    coverPath: cover?.href || null,
    blobs: new Map(),
    blobUrl(path, bytes) {
      if (!this.blobs.has(path)) {
        const ext = path.split('.').pop().toLowerCase();
        const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || '';
        this.blobs.set(path, URL.createObjectURL(new Blob([bytes], { type })));
      }
      return this.blobs.get(path);
    },
    chapterTitle(i) {
      const t = tocInBook.find((x) => x.chapter === i) || [...tocInBook].reverse().find((x) => x.chapter < i);
      return t?.label || '';
    },
    async render(i) { return renderEpubPage(zip, chapters[i].href, this); } };
}

// Build a safe copy of one book page. Ids are prefixed so they can't clash with the app's own.
const KEEP = new Set(['p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'em', 'i', 'strong', 'b', 'u', 's', 'sup', 'sub', 'small', 'big', 'br', 'hr',
  'span', 'pre', 'code', 'cite', 'q', 'abbr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'figure', 'figcaption', 'center']);
const DROP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select',
  'textarea', 'noscript', 'template', 'audio', 'video', 'canvas', 'math']);
export const ANCHOR_PREFIX = 'bk-';

async function renderEpubPage(zip, file, book) {
  const doc = parseXml(await zip.text(file) || '', 'application/xhtml+xml');
  const body = byTag(doc, 'body')[0] || doc.documentElement;
  const images = [];
  const conv = (node) => {
    if (node.nodeType === 3) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== 1) return null;
    const tag = node.localName.toLowerCase();
    if (DROP.has(tag)) return null;
    let el;
    if (tag === 'img' || tag === 'image') {
      const src = node.getAttribute('src') || node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      el = document.createElement('img');
      el.alt = node.getAttribute('alt') || '';
      if (src && !/^[a-z]+:/i.test(src)) images.push([el, resolvePath(file, src)]);
      return el;
    }
    if (tag === 'svg') { // usually a cover page wrapping one <image>
      const img = byTag(node, 'image')[0];
      return img ? conv(img) : null;
    }
    if (tag === 'a') {
      const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      if (/^https?:\/\//i.test(href)) { el = document.createElement('a'); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      else if (href && !/^[a-z]+:/i.test(href)) { el = document.createElement('span'); el.className = 'bk-link'; el.dataset.file = resolvePath(file, href); el.dataset.anchor = fragmentOf(href); el.tabIndex = 0; el.setAttribute('role', 'link'); }
      else el = document.createElement('span');
    } else el = KEEP.has(tag) ? document.createElement(tag === 'center' ? 'div' : tag) : document.createDocumentFragment();
    if (el.nodeType === 1) {
      const id = node.getAttribute('id');
      if (id) el.id = ANCHOR_PREFIX + id;
      const lang = node.getAttribute('lang') || node.getAttribute('xml:lang');
      if (lang) el.lang = lang;
      const dir = node.getAttribute('dir');
      if (dir === 'rtl' || dir === 'ltr') el.dir = dir;
      if (tag === 'td' || tag === 'th') { for (const a of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(node.getAttribute(a) || '')) el.setAttribute(a, node.getAttribute(a)); }
      if (tag === 'ol' && /^\d{1,6}$/.test(node.getAttribute('start') || '')) el.setAttribute('start', node.getAttribute('start'));
    }
    for (const c of node.childNodes) { const k = conv(c); if (k) el.append(k); }
    if (node.getAttribute('id') && el.nodeType === 11) { const mark = document.createElement('span'); mark.id = ANCHOR_PREFIX + node.getAttribute('id'); el.prepend(mark); }
    return el;
  };
  const frag = document.createDocumentFragment();
  for (const c of body.childNodes) { const k = conv(c); if (k) frag.append(k); }
  await Promise.all(images.map(async ([img, path]) => {
    const bytes = await zip.read(path).catch(() => null);
    if (bytes) img.src = book.blobUrl(path, bytes);
    else img.remove();
  }));
  return frag;
}

/* ----- Plain text ----- */
// UTF-8 if it decodes cleanly, otherwise the Chinese GB18030 encoding (most older Chinese .txt books).
export function decodeText(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('gb18030').decode(buf); }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}
const HEADING = /^\s*(第\s*[0-9０-９一二三四五六七八九十百千零〇两]+\s*[章回节卷篇部集]|(chapter|book|part)\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b|序[言章]?|前言|引言|后记|尾声|楔子)/i;
export function openText(buf, fallbackTitle = '') {
  const lines = decodeText(buf).split('\n');
  const chapters = [];
  let cur = { title: '', paras: [] }, para = [];
  const endPara = () => { if (para.length) { cur.paras.push(para.join(' ').replace(/\s+/g, ' ').trim()); para = []; } };
  const isHeading = (l) => l.trim().length <= 40 && HEADING.test(l);
  const headings = lines.filter(isHeading).length;
  for (const line of lines) {
    if (headings >= 2 && isHeading(line)) {
      endPara();
      if (cur.title || cur.paras.length) chapters.push(cur);
      cur = { title: line.trim(), paras: [] };
    } else if (!line.trim()) endPara();
    else if (/^[　\s]{2,}/.test(line)) { endPara(); para.push(line.trim()); } // an indented line starts a paragraph (Chinese style)
    else para.push(line.trim());
  }
  endPara();
  if (cur.title || cur.paras.length) chapters.push(cur);
  // No headings: split long text into parts so a page never gets too heavy.
  const parts = [];
  for (const ch of chapters) {
    let size = 0, piece = { title: ch.title, paras: [] };
    for (const p of ch.paras) {
      if (size > 40000 && piece.paras.length) { parts.push(piece); piece = { title: ch.title ? `${ch.title} (cont.)` : '', paras: [] }; size = 0; }
      piece.paras.push(p); size += p.length;
    }
    parts.push(piece);
  }
  if (!parts.length) parts.push({ title: '', paras: [] });
  parts.forEach((p, i) => { if (!p.title) p.title = parts.length > 1 ? `Part ${i + 1}` : fallbackTitle; });
  return { kind: 'txt', title: fallbackTitle, author: '', chapters: parts, toc: parts.map((p, i) => ({ label: p.title, chapter: i, anchor: '', depth: 0 })),
    chapterTitle: (i) => parts[i]?.title || '',
    async render(i) {
      const frag = document.createDocumentFragment();
      const ch = parts[i];
      if (headings >= 2 && ch.title && !ch.title.endsWith('(cont.)')) { const h = document.createElement('h2'); h.textContent = ch.title; frag.append(h); }
      for (const t of ch.paras) { const p = document.createElement('p'); p.textContent = t; frag.append(p); }
      return frag;
    } };
}

/* ----- A Bible ebook the person owns, read into books / chapters / verses ----- */
// OSIS book codes in the app's book order (Genesis … Revelation).
const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra',
  'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah',
  'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
// "The Gospel According to John", "First Letter of Paul to the Corinthians", "Psalm" … -> a key for matching book names.
function bookKey(name) {
  return String(name).toLowerCase()
    .replace(/\bfirst\b|\bi\b(?=\s)/g, '1').replace(/\bsecond\b|\bii\b(?=\s)/g, '2').replace(/\bthird\b|\biii\b(?=\s)/g, '3')
    .replace(/\b(the|book|of|gospel|according|to|letter|letters|epistle|general|paul|apostle|st|saint|prophet|prophecy)\b/g, ' ')
    .replace(/\bpsalm\b/g, 'psalms').replace(/\bsong\s+songs\b|\bcanticles?\b|\bsong\s+solomon\b/g, 'songofsolomon')
    .replace(/\bqoheleth\b/g, 'ecclesiastes').replace(/\bapocalypse\b|\brevelations\b/g, 'revelation')
    .replace(/[^a-z0-9]/g, '');
}
const BLOCK = /^(p|div|li|blockquote|section|article|table|tr|td|dd|dt|ul|ol|pre|figure|h[1-6])$/;
const SKIP_CLASS = /foot|note|xref|cross|crossref|ref-?list|annotation|chapter-?title|psalm-?title|superscription|subtitle|heading|^title|\btitle\b|toc|copyright/i;

// books: [{ id, name, chapters }] in Bible order. Returns { title, lang, data: { bookId: [[ [text, 1?], … ] per chapter] }, report }.
export async function parseBibleEpub(buf, books) {
  const ep = await openEpub(buf);
  const byKey = new Map(books.map((b) => [bookKey(b.name), b]));
  byKey.set('psalms', books.find((b) => b.id === 'psalms')); byKey.set('songofsolomon', books.find((b) => b.id === 'songofsolomon'));
  const findBook = (text) => {
    const k = bookKey(text);
    if (!k || k.length > 24) return null;
    return byKey.get(k) || books.find((b) => bookKey(b.name) === k.replace(/s$/, '')) || null;
  };
  const osis = new Map(OSIS.map((c, i) => [c.toLowerCase(), books[i]]));
  const tocBook = new Map(); // spine file -> book named in the table of contents
  for (const t of ep.toc) { const b = findBook(t.label); if (b && t.anchor === '' && !tocBook.has(ep.chapters[t.chapter]?.href)) tocBook.set(ep.chapters[t.chapter].href, b); }

  const data = {};
  let book = null, ch = 0, v = 0, blockStart = true, byIds = 0, byMarkers = 0;
  const setVerse = (b, c, n) => {
    if (b !== book) { book = b; }
    ch = c; v = n;
    const chapters = (data[book.id] ||= []);
    const verses = (chapters[ch - 1] ||= []);
    if (!verses[v - 1]) verses[v - 1] = blockStart || v === 1 ? ['', 1] : [''];
    blockStart = false;
  };
  const append = (t) => { if (book && ch && v) data[book.id][ch - 1][v - 1][0] += t; };
  const num = (el) => { const m = /^\s*(\d{1,3})\s*$/.exec(el.textContent || ''); return m ? +m[1] : 0; };
  const cls = (el) => `${el.getAttribute('class') || ''} ${el.getAttribute('epub:type') || el.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') || ''}`;

  const walk = (node) => {
    if (node.nodeType === 3) { append(node.nodeValue); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName.toLowerCase(), c = cls(node), id = node.getAttribute('id') || '';
    if (/^(script|style|head|nav|aside|title|meta|link)$/.test(tag)) return;
    // 1. Exact verse ids: v43003016, 43003016, John.3.16, JHN_3_16 …
    let m = /^v?(\d{1,2})(\d{3})(\d{3})$/.exec(id);
    if (m && +m[1] >= 1 && +m[1] <= 66 && +m[3] >= 1) { setVerse(books[+m[1] - 1], +m[2], +m[3]); byIds++; }
    else if ((m = /^(?:v-?)?([1-3]?[A-Za-z]{2,6})[._](\d{1,3})[._](\d{1,3})$/.exec(id)) && osis.has(m[1].toLowerCase())) { setVerse(osis.get(m[1].toLowerCase()), +m[2], +m[3]); byIds++; }
    // Footnotes, cross references and section headings aren't Bible text.
    if (tag === 'a' && /^#/.test(node.getAttribute('href') || '') && !/^\s*\d{1,3}\s*$/.test(node.textContent)) return;
    if (SKIP_CLASS.test(c) && !/verse|chapter/i.test(c)) return;
    if (/^h[1-6]$/.test(tag)) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      const b = findBook(text);
      if (b) { book = b; ch = 0; v = 0; return; }
      const cm = /^(?:chapter|psalm)\s+(\d{1,3})$/i.exec(text) || /^(\d{1,3})$/.exec(text);
      if (cm && book && !byIds) { setVerse(book, +cm[1], 1); byMarkers++; }
      blockStart = true;
      return;
    }
    // 2. Chapter and verse number markers.
    const n = num(node);
    if (n && !byIds && book && (/chapter|chap-?num|chapnum|drop-?cap|\bc-?num/i.test(c))) { setVerse(book, n, 1); byMarkers++; return; }
    if (n && !byIds && book && ch && (/verse|vnum|v-?num|versenum|\bv\b/i.test(c) || (tag === 'sup' && !node.querySelector('a')))) {
      if (n === 1 && v > 1) setVerse(book, ch + 1, 1); // a new chapter without a chapter marker
      else if (n > v) setVerse(book, ch, n);
      byMarkers++;
      return;
    }
    if (n && byIds && (/verse|vnum|chapter|chap/i.test(c) || tag === 'sup' || n === v || n === ch)) return; // the number shown for an id'd verse
    if (BLOCK.test(tag)) { blockStart = true; if (book && v) append(' '); }
    for (const k of node.childNodes) walk(k);
    if (BLOCK.test(tag)) { blockStart = true; if (book && v) append(' '); }
  };

  for (const { href } of ep.chapters) {
    const text = await ep.zip.text(href);
    if (!text) continue;
    let doc = new DOMParser().parseFromString(text, 'application/xhtml+xml');
    if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html');
    if (tocBook.has(href) && !byIds) { book = tocBook.get(href); ch = 0; v = 0; }
    blockStart = true;
    const body = doc.getElementsByTagNameNS('*', 'body')[0] || doc.documentElement;
    walk(body);
  }

  // Tidy the text; fill gaps so verse numbers line up.
  let verses = 0, cjk = 0, letters = 0;
  for (const chapters of Object.values(data)) {
    for (let c = 0; c < chapters.length; c++) {
      const vs = (chapters[c] ||= []);
      for (let i = 0; i < vs.length; i++) {
        vs[i] ||= [''];
        vs[i][0] = vs[i][0].replace(/\s+/g, ' ').replace(/ ([,.;:!?’”)\]，。；：！？、」』）])/g, '$1').replace(/([(\[“‘「『（]) /g, '$1').trim();
        if (vs[i][0]) verses++;
        for (const ch of vs[i][0].slice(0, 40)) { if (/[㐀-鿿]/.test(ch)) cjk++; else if (/[a-z]/i.test(ch)) letters++; }
      }
    }
  }
  const lang = cjk > letters ? (/[們這說來為與們對]/.test(JSON.stringify(data).slice(0, 20000)) ? 'zh-Hant' : 'zh-Hans') : 'en';
  return { title: ep.title, lang, data, report: { verses, byIds, byMarkers, books: Object.keys(data).length } };
}
