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
  assert.equal(videoOf('https://www.youtube.com/channel/UC123'), null);
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
  assert.equal(videoOf('https://b23.tv/aBcD123').kind, 'bilibili-short');
});

test('links are found in text, with or without https://, without trailing punctuation', () => {
  const text = '看这个：youtu.be/dQw4w9WgXcQ。还有【标题】https://b23.tv/aBcD123 和 https://vimeo.com/76979871, 好!';
  assert.deepEqual([...text.matchAll(LINK_RE)].map((m) => videoOf(m[0])?.id), ['dQw4w9WgXcQ', 'aBcD123', '76979871']);
  assert.equal(seconds('1h2m3s'), 3723);
});
