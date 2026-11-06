import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateTitles, pickPage, createWikiService } from '../server/wiki.js';

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('candidate titles prefer Bible-specific articles and end with the bare word', () => {
  const t = candidateTitles('grace');
  assert.equal(t[0], 'Grace (Bible)');
  assert.ok(t.includes('Grace in Christianity'));
  assert.equal(t.at(-1), 'Grace');
});

test('pickPage follows redirects, skips disambiguation, and only takes the bare word when it is about the Bible', () => {
  const titles = candidateTitles('light');
  const query = { pages: [
    { title: 'Light', extract: 'Light is electromagnetic radiation that can be perceived by the human eye.' },
    { title: 'Light (disambiguation)', missing: true },
  ] };
  assert.equal(pickPage(query, titles), null);
  const grace = candidateTitles('grace');
  const q2 = { redirects: [{ from: 'Grace in Christianity', to: 'Divine grace' }], pages: [
    { title: 'Grace', extract: 'Grace may refer to:', pageprops: { disambiguation: '' } },
    { title: 'Divine grace', extract: 'Divine grace is a theological term present in many religions.' },
  ] };
  assert.equal(pickPage(q2, grace).title, 'Divine grace');
  const q3 = { pages: [{ title: 'Abraham', extract: 'Abraham is the common Hebrew patriarch of the Abrahamic religions.' }] };
  assert.equal(pickPage(q3, candidateTitles('abraham')).title, 'Abraham');
});

test('the service returns English and Chinese, caches, and reports missing articles', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    assert.match(opts.headers['User-Agent'], /BibleStudyApp/);
    if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
      const titles = new URL(url).searchParams.get('titles');
      if (titles.includes('Abraham')) return reply({ query: { pages: [{ title: 'Abraham', extract: 'Abraham is the Hebrew patriarch.', langlinks: [{ lang: 'zh', title: '亞伯拉罕' }] }] } });
      return reply({ query: { pages: [] } });
    }
    if (url.startsWith('https://zh.wikipedia.org/api/rest_v1/page/summary/')) {
      assert.equal(opts.headers['Accept-Language'], 'zh-cn');
      return reply({ title: '亚伯拉罕', extract: '亚伯拉罕是希伯来人的始祖。', content_urls: { mobile: { page: 'https://zh.m.wikipedia.org/wiki/x' } } });
    }
    throw new Error(`unexpected ${url}`);
  };
  const wiki = createWikiService({ fetchImpl });
  const a = await wiki('Abraham');
  assert.equal(a.en.title, 'Abraham');
  assert.equal(a.en.url, 'https://en.wikipedia.org/wiki/Abraham');
  assert.equal(a.zh.title, '亚伯拉罕');
  assert.equal(await wiki('zzzz'), null);
  await assert.rejects(wiki('<script>'), /Not a word/);
});

test('an unreachable Wikipedia is a 503', async () => {
  const wiki = createWikiService({ fetchImpl: async () => reply({}, 429) });
  await assert.rejects(wiki('moses'), (e) => e.status === 503);
});
