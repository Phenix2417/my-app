import test from 'node:test';
import assert from 'node:assert/strict';
import { videoOf, embedUrl, seconds, LINK_RE } from '../public/video.js';

const id = (u) => { const v = videoOf(u); return v && [v.kind, v.id, v.start || 0]; };

test('YouTube: every link form (desktop, mobile web, app share, music, shorts, live, embed, attribution) gives the same video', () => {
  for (const u of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'https://youtube.com/watch?feature=youtu.be&v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=AbCdEf123', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD', 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share',
    'https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/v/dQw4w9WgXcQ', 'https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3DdQw4w9WgXcQ%26feature%3Dshare',
    'youtu.be/dQw4w9WgXcQ', 'www.youtube.com/watch?v=dQw4w9WgXcQ', 'vnd.youtube:dQw4w9WgXcQ',
  ]) assert.deepEqual(id(u), ['youtube', 'dQw4w9WgXcQ', 0], u);
  assert.equal(videoOf('https://youtu.be/dQw4w9WgXcQ?t=1m30s').start, 90);
  assert.equal(videoOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s').start, 42);
  assert.equal(videoOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=1:05').start, 65);
  assert.equal(videoOf('https://www.youtube.com/channel/UC123').kind, 'card'); // a channel: shown as a card
});

test('Vimeo: page, channel, group, showcase, player and unlisted links', () => {
  for (const u of ['https://vimeo.com/76979871', 'https://vimeo.com/channels/staffpicks/76979871', 'https://vimeo.com/groups/shortfilms/videos/76979871',
    'https://vimeo.com/showcase/123/video/76979871', 'https://player.vimeo.com/video/76979871']) assert.deepEqual(id(u), ['vimeo', '76979871', 0], u);
  assert.equal(videoOf('https://vimeo.com/76979871/abc123def4').hash, 'abc123def4');
  assert.match(embedUrl(videoOf('https://player.vimeo.com/video/76979871?h=abc123def4')), /h=abc123def4/);
});

test('Bilibili: desktop, mobile web, av numbers, parts, start times, and app short links', () => {
  for (const u of ['https://www.bilibili.com/video/BV1GJ411x7h7', 'https://m.bilibili.com/video/BV1GJ411x7h7?share_source=copy_web', 'https://b23.tv/BV1GJ411x7h7',
    'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7']) assert.equal(videoOf(u).id, 'BV1GJ411x7h7', u);
  assert.equal(videoOf('https://www.bilibili.com/video/av170001').aid, '170001');
  const v = videoOf('https://www.bilibili.com/video/BV1GJ411x7h7?p=3&t=75');
  assert.deepEqual([v.page, v.start], [3, 75]);
  assert.match(embedUrl(v), /bvid=BV1GJ411x7h7&page=3.*&t=75/);
  assert.equal(videoOf('https://b23.tv/aBcD123').kind, 'short');
});

test('links are found in text, with or without https://, without trailing punctuation', () => {
  const text = '看这个：youtu.be/dQw4w9WgXcQ。还有【标题】https://b23.tv/aBcD123 和 https://vimeo.com/76979871, 好!';
  assert.deepEqual([...text.matchAll(LINK_RE)].map((m) => videoOf(m[0])?.id), ['dQw4w9WgXcQ', 'aBcD123', '76979871']);
  assert.equal(seconds('1h2m3s'), 3723);
});

test('X / Twitter: x.com, twitter.com, mobile, /statuses/, /i/web/status/, mirrors', () => {
  for (const u of ['https://x.com/someone/status/1750000000000000001', 'https://twitter.com/someone/status/1750000000000000001?s=20',
    'https://mobile.twitter.com/someone/status/1750000000000000001', 'https://x.com/i/web/status/1750000000000000001',
    'https://twitter.com/someone/statuses/1750000000000000001', 'https://fxtwitter.com/someone/status/1750000000000000001', 'x.com/someone/status/1750000000000000001/photo/1'])
    assert.deepEqual(id(u), ['x', '1750000000000000001', 0], u);
  assert.equal(videoOf('https://x.com/someone').kind, 'card');
  assert.match(embedUrl(videoOf('https://x.com/a/status/1750000000000000001')), /platform\.twitter\.com\/embed\/Tweet\.html\?id=1750000000000000001/);
});

test('Instagram: posts, reels, IGTV, with user paths and share parameters', () => {
  for (const [u, type] of [['https://www.instagram.com/p/C1a2B3c4D5e/', 'p'], ['https://instagram.com/reel/C1a2B3c4D5e/?igsh=abc', 'reel'], ['https://www.instagram.com/reels/C1a2B3c4D5e/', 'reel'],
    ['https://www.instagram.com/tv/C1a2B3c4D5e', 'tv'], ['https://www.instagram.com/someone/p/C1a2B3c4D5e/', 'p'], ['https://instagr.am/p/C1a2B3c4D5e', 'p']]) {
    const v = videoOf(u); assert.deepEqual([v.kind, v.id, v.type], ['instagram', 'C1a2B3c4D5e', type], u);
  }
  assert.match(embedUrl(videoOf('https://instagram.com/reel/C1a2B3c4D5e')), /instagram\.com\/reel\/C1a2B3c4D5e\/embed/);
});

test('TikTok and 抖音: web, mobile, embed and app short links', () => {
  for (const u of ['https://www.tiktok.com/@someone/video/7300000000000000001', 'https://www.tiktok.com/@someone/video/7300000000000000001?is_from_webapp=1&sender_device=pc',
    'https://m.tiktok.com/v/7300000000000000001.html', 'https://www.tiktok.com/embed/v2/7300000000000000001', 'https://www.tiktok.com/player/v1/7300000000000000001'])
    assert.deepEqual(id(u), ['tiktok', '7300000000000000001', 0], u);
  for (const u of ['https://vm.tiktok.com/ZMabc123/', 'https://vt.tiktok.com/ZSabc123/', 'https://www.tiktok.com/t/ZTabc123/']) assert.equal(videoOf(u).kind, 'short', u);
  for (const u of ['https://www.douyin.com/video/7300000000000000002', 'https://www.iesdouyin.com/share/video/7300000000000000002/?region=CN',
    'https://www.douyin.com/discover?modal_id=7300000000000000002', 'https://www.douyin.com/user/abc?modal_id=7300000000000000002'])
    assert.deepEqual(id(u), ['douyin', '7300000000000000002', 0], u);
  assert.equal(videoOf('https://v.douyin.com/iRNBho6u/').kind, 'short');
  // 抖音's app share text: the link sits among Chinese words and a code.
  const share = '7.94 复制打开抖音，看看【某某的作品】讲道片段 # 圣经 https://v.douyin.com/iRNBho6u/ ZTX:/ 01/23 a@b.cn';
  assert.deepEqual([...share.matchAll(LINK_RE)].map((m) => videoOf(m[0])?.url), ['https://v.douyin.com/iRNBho6u/']);
  assert.match(embedUrl(videoOf('https://www.douyin.com/video/7300000000000000002')), /open\.douyin\.com\/player\/video\?vid=7300000000000000002/);
});

test('Facebook: watch, page videos, video.php, reels, live, mobile and web hosts, app short links', () => {
  for (const u of ['https://www.facebook.com/watch/?v=1234567890123456', 'https://m.facebook.com/watch/?v=1234567890123456&mibextid=abc',
    'https://www.facebook.com/somepage/videos/1234567890123456/', 'https://www.facebook.com/somepage/videos/some-title/1234567890123456/',
    'https://web.facebook.com/video.php?v=1234567890123456', 'https://www.facebook.com/watch/live/?v=1234567890123456', 'facebook.com/watch?v=1234567890123456'])
    assert.deepEqual(id(u), ['facebook', '1234567890123456', 0], u);
  assert.equal(videoOf('https://www.facebook.com/reel/1234567890123456?s=yWDuG2').reel, true);
  for (const u of ['https://fb.watch/abcDEF123/', 'https://www.facebook.com/share/v/1AbCdEfGh/', 'https://www.facebook.com/share/r/1AbCdEfGh/']) assert.equal(videoOf(u).kind, 'short', u);
  assert.equal(videoOf('https://www.facebook.com/somepage').kind, 'card');
  assert.match(embedUrl(videoOf('https://www.facebook.com/watch/?v=1234567890123456')), /facebook\.com\/plugins\/video\.php\?href=https%3A%2F%2Fwww\.facebook\.com%2Fwatch%2F%3Fv%3D1234567890123456/);
});

test('微博: post, status, detail and video links, and t.cn short links', () => {
  for (const [u, want] of [['https://weibo.com/1234567890/NrXyZ12ab', 'NrXyZ12ab'], ['https://m.weibo.cn/status/NrXyZ12ab', 'NrXyZ12ab'], ['https://m.weibo.cn/detail/4950000000000001', '4950000000000001'],
    ['https://weibo.com/detail/4950000000000001?from=share', '4950000000000001'], ['https://weibo.cn/status/NrXyZ12ab', 'NrXyZ12ab'], ['weibo.com/1234567890/NrXyZ12ab?type=comment', 'NrXyZ12ab']])
    assert.deepEqual([videoOf(u).kind, videoOf(u).id], ['weibo', want], u);
  for (const u of ['https://weibo.com/tv/show/1034:4950000000000002', 'https://video.weibo.com/show?fid=1034:4950000000000002']) assert.deepEqual([videoOf(u).id, videoOf(u).video], ['1034:4950000000000002', true], u);
  assert.equal(videoOf('http://t.cn/A6abcDEF').kind, 'short');
  assert.equal(videoOf('https://weibo.com/u/1234567890').kind, 'card');
});

test('posts and other pages: Facebook posts, 小红书 notes, and cards for everything else on these platforms', () => {
  for (const u of ['https://www.facebook.com/somepage/posts/pfbid02abcDEF', 'https://m.facebook.com/permalink.php?story_fbid=123456&id=789',
    'https://www.facebook.com/photo/?fbid=123456789', 'https://www.facebook.com/groups/somegroup/posts/123456789/']) assert.equal(videoOf(u).kind, 'facebook-post', u);
  assert.match(embedUrl(videoOf('https://www.facebook.com/somepage/posts/pfbid02abcDEF')), /facebook\.com\/plugins\/post\.php\?href=/);
  assert.equal(videoOf('https://www.facebook.com/share/p/1AbcDEf/').kind, 'short');
  const xhs = videoOf('https://www.xiaohongshu.com/discovery/item/6543210fedcba9876543210f?xsec_token=ABC&xsec_source=app_share');
  assert.deepEqual([xhs.kind, xhs.url], ['card', 'https://www.xiaohongshu.com/explore/6543210fedcba9876543210f?xsec_token=ABC&xsec_source=pc_share']);
  for (const u of ['http://xhslink.com/a/AbCdEf123', 'https://xhslink.com/AbCdEf123']) assert.equal(videoOf(u).kind, 'short', u);
  for (const u of ['https://www.youtube.com/@channel', 'https://www.tiktok.com/@a/photo/7300000000000000009', 'https://t.bilibili.com/876543210',
    'https://www.bilibili.com/opus/876543210', 'https://x.com/someone', 'https://www.instagram.com/someone/', 'https://www.douyin.com/note/7300000000000000003'])
    assert.equal(videoOf(u).kind, 'card', u);
  assert.equal(videoOf('https://youtube.com/'), null);
  assert.equal(videoOf('https://example.com/page'), null);
  const share = '35 小红书分享【读经笔记】 😆 xhslink.com/a/AbCdEf123，复制本条信息';
  assert.deepEqual([...share.matchAll(LINK_RE)].map((m) => videoOf(m[0])?.kind), ['short']);
});

test('Wikipedia and 知乎: one card per article or page, whatever the link form', () => {
  for (const u of ['https://zh.wikipedia.org/wiki/%E4%BA%9A%E4%BC%AF%E6%8B%89%E7%BD%95', 'https://zh.m.wikipedia.org/wiki/亚伯拉罕', 'https://zh.wikipedia.org/zh-cn/亚伯拉罕', 'zh.wikipedia.org/wiki/亚伯拉罕'])
    assert.deepEqual([videoOf(u).kind, videoOf(u).id], ['card', 'zh:亚伯拉罕'], u);
  assert.equal(videoOf('https://en.m.wikipedia.org/w/index.php?title=Moses').url, 'https://en.wikipedia.org/wiki/Moses');
  assert.equal(videoOf('https://www.zhihu.com/question/12345/answer/67890?share_code=abc&utm_psn=1').url, 'https://www.zhihu.com/question/12345/answer/67890');
  assert.equal(videoOf('https://zhuanlan.zhihu.com/p/123456?utm_id=0').url, 'https://zhuanlan.zhihu.com/p/123456');
  const text = '推荐 https://zhuanlan.zhihu.com/p/123456 和 zh.wikipedia.org/wiki/亚伯拉罕，看看 https://en.wikipedia.org/wiki/Moses。';
  assert.deepEqual([...text.matchAll(LINK_RE)].map((m) => videoOf(m[0]).id), ['zhuanlan.zhihu.com/p/123456', 'zh:亚伯拉罕', 'en:Moses']);
});

test('Q&A and shopping sites (American and Chinese): cards, one per product, from web, mobile or app links', async () => {
  const { CARD_SITES, siteOf } = await import('../public/video.js');
  for (const u of ['https://www.quora.com/How-do-I-start-reading-the-Bible', 'https://www.reddit.com/r/Christianity/comments/abc123/title/', 'https://redd.it/abc123',
    'https://stackoverflow.com/questions/123/how', 'https://hermeneutics.stackexchange.com/questions/1/x', 'https://zhidao.baidu.com/question/123456.html',
    'https://baike.baidu.com/item/圣经', 'https://www.target.com/p/x/-/A-123', 'https://www.etsy.com/listing/123/x', 'https://www.temu.com/x-g-601.html',
    'https://m.tb.cn/h.5ABCDE?tk=xyz', 'https://u.jd.com/AbCdEf', 'https://3.cn/abc-DEF', 'https://amzn.to/3AbCdEf', 'https://a.co/d/abc1234', 'https://www.goofish.com/item?id=123'])
    assert.equal(videoOf(u)?.kind, 'card', u);
  const same = (urls, want) => { for (const u of urls) assert.equal(videoOf(u).url, want, u); };
  same(['https://www.amazon.com/Holy-Bible-ESV/dp/B000123456/ref=sr_1_1?keywords=bible&qid=1', 'https://www.amazon.com/gp/product/B000123456?th=1', 'https://smile.amazon.com/dp/B000123456', 'amazon.com/gp/aw/d/B000123456'], 'https://www.amazon.com/dp/B000123456');
  same(['https://item.jd.com/100012345678.html?spm=a', 'https://item.m.jd.com/product/100012345678.html?utm_source=x'], 'https://item.jd.com/100012345678.html');
  same(['https://item.taobao.com/item.htm?spm=a21n57&id=623456789012&ali_trackid=1', 'https://h5.m.taobao.com/awp/core/detail.htm?id=623456789012'], 'https://item.taobao.com/item.htm?id=623456789012');
  same(['https://detail.tmall.com/item.htm?id=623456789012&skuId=1'], 'https://detail.tmall.com/item.htm?id=623456789012');
  same(['https://mobile.yangkeduo.com/goods.html?goods_id=123456789&page_from=23'], 'https://mobile.yangkeduo.com/goods.html?goods_id=123456789');
  same(['https://www.walmart.com/ip/Holy-Bible/123456789?athbdg=L1'], 'https://www.walmart.com/ip/123456789');
  same(['https://www.ebay.com/itm/Holy-Bible/123456789012?hash=x'], 'https://www.ebay.com/itm/123456789012');
  assert.equal(siteOf('smile.amazon.com'), 'amazon.com');
  assert.equal(CARD_SITES[siteOf('detail.tmall.com')], '天猫');
  assert.equal(videoOf('https://www.amazon.com/'), null); // a home page isn't a card
  const share = '【淘宝】限时特惠 https://m.tb.cn/h.5ABCDE?tk=xyz CZ0001 「圣经 和合本」点击链接直接打开';
  assert.deepEqual([...share.matchAll(LINK_RE)].map((m) => m[0]), ['https://m.tb.cn/h.5ABCDE?tk=xyz']);
});
