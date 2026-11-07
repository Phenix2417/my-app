// Video links → embeddable players. The same video can be shared in many link forms depending on where it came from
// (desktop web, mobile web, the mobile app's Share button, a TV/embed link…); all of them map to one player.

// Sites whose links show inside chat (a player, a post, or a card), with their names. Links of these sites are found in
// text even without https:// (www.amazon.com/…, m.tb.cn/…), and any page on them that isn't a video shows as a card.
export const CARD_SITES = {
  // video and social
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'bilibili.com': '哔哩哔哩', 'b23.tv': '哔哩哔哩', 'x.com': 'X', 'twitter.com': 'X',
  'instagram.com': 'Instagram', 'instagr.am': 'Instagram', 'tiktok.com': 'TikTok', 'douyin.com': '抖音', 'iesdouyin.com': '抖音', 'facebook.com': 'Facebook',
  'fb.watch': 'Facebook', 'fb.com': 'Facebook', 'weibo.com': '微博', 'weibo.cn': '微博', 't.cn': '微博', 'xiaohongshu.com': '小红书', 'xhslink.com': '小红书',
  // reference and Q&A
  'wikipedia.org': 'Wikipedia', 'zhihu.com': '知乎', 'quora.com': 'Quora', 'reddit.com': 'Reddit', 'redd.it': 'Reddit', 'stackoverflow.com': 'Stack Overflow',
  'stackexchange.com': 'Stack Exchange', 'superuser.com': 'Super User', 'serverfault.com': 'Server Fault', 'askubuntu.com': 'Ask Ubuntu',
  'mathoverflow.net': 'MathOverflow', 'zhidao.baidu.com': '百度知道', 'baike.baidu.com': '百度百科', 'douban.com': '豆瓣', 'jianshu.com': '简书',
  // American shopping
  'amazon.com': 'Amazon', 'amzn.to': 'Amazon', 'a.co': 'Amazon', 'amzn.com': 'Amazon', 'ebay.com': 'eBay', 'ebay.us': 'eBay', 'walmart.com': 'Walmart',
  'target.com': 'Target', 'bestbuy.com': 'Best Buy', 'etsy.com': 'Etsy', 'costco.com': 'Costco', 'homedepot.com': 'The Home Depot', 'lowes.com': "Lowe's",
  'temu.com': 'Temu', 'shein.com': 'SHEIN', 'aliexpress.com': 'AliExpress', 'aliexpress.us': 'AliExpress', 'wayfair.com': 'Wayfair', 'macys.com': "Macy's",
  'kohls.com': "Kohl's", 'newegg.com': 'Newegg', 'chewy.com': 'Chewy', 'ikea.com': 'IKEA', 'nordstrom.com': 'Nordstrom', 'sephora.com': 'Sephora',
  'ulta.com': 'Ulta', 'apple.com': 'Apple', 'samsclub.com': "Sam's Club", 'kroger.com': 'Kroger', 'cvs.com': 'CVS', 'walgreens.com': 'Walgreens',
  // Chinese shopping
  'taobao.com': '淘宝', 'tb.cn': '淘宝', 'tmall.com': '天猫', 'jd.com': '京东', '3.cn': '京东', 'pinduoduo.com': '拼多多', 'yangkeduo.com': '拼多多',
  '1688.com': '1688', 'suning.com': '苏宁易购', 'vip.com': '唯品会', 'dangdang.com': '当当', 'goofish.com': '闲鱼', 'dewu.com': '得物', 'poizon.com': '得物',
  'kuaishou.com': '快手', 'meituan.com': '美团', 'dianping.com': '大众点评', 'xiaomi.com': '小米商城', 'mi.com': '小米商城',
};
// The site a host belongs to (www.amazon.com, smile.amazon.com → amazon.com; item.taobao.com → taobao.com).
export function siteOf(hostname) {
  const host = String(hostname || '').toLowerCase();
  let best = null;
  for (const d of Object.keys(CARD_SITES)) if ((host === d || host.endsWith(`.${d}`)) && (!best || d.length > best.length)) best = d;
  return best;
}
const BARE = Object.keys(CARD_SITES).sort((a, b) => b.length - a.length).map((d) => d.replace(/\./g, '\\.')).join('|');
// Links in text: with a scheme, or bare (youtu.be/…, www.amazon.com/…, m.tb.cn/…) as people often type or paste them.
// Wikipedia links often show their title in its own script (zh.wikipedia.org/wiki/亚伯拉罕): there the link runs on
// through Chinese characters, up to a space or Chinese punctuation. Other links end at Chinese text or punctuation.
export const LINK_RE = new RegExp(
  `(?:https?:\\/\\/)?(?:[a-z-]{2,12}\\.)(?:m\\.)?wikipedia\\.org\\/(?:wiki|zh-[a-z]{2,4})\\/[^\\s<>"'，。、！？；：（）【】「」『』《》]+`
  + `|(?:https?:\\/\\/|\\b(?=(?:[a-z0-9-]+\\.)*(?:${BARE})\\/))[^\\s<>"'\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]+`, 'gi');

// "1h2m3s", "90s", "90", "1:30" → seconds.
export function seconds(t) {
  if (!t) return 0;
  const s = String(t).trim();
  if (/^\d+$/.test(s)) return +s;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((a, x) => a * 60 + +x, 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

const YT_ID = /^[\w-]{11}$/;

// A link → { kind: 'youtube' | 'vimeo' | 'bilibili', id, start?, hash?, page?, aid? } or null.
// kind 'short' is an app's short link (b23.tv, vm.tiktok.com, v.douyin.com…), which the server follows to find the post.
function match(raw) {
  let text = String(raw || '').trim().replace(/[.,;:!?。，；：！？)\]]+$/, '');
  if (/^vnd\.youtube:/i.test(text)) { const id = text.split(':')[1]?.split(/[?&]/)[0]; return YT_ID.test(id) ? { kind: 'youtube', id, start: 0 } : null; }
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let u; try { u = new URL(text); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|music|gaming|web|mbasic|touch)\./, '');
  const q = u.searchParams, path = u.pathname;
  let m;

  // YouTube: youtu.be/ID, watch?v=ID, /shorts/ /live/ /embed/ /v/ /e/ ID, attribution_link?u=/watch?v=ID, youtube-nocookie
  if (host === 'youtu.be') {
    const id = path.split('/')[1];
    return YT_ID.test(id || '') ? { kind: 'youtube', id, start: seconds(q.get('t') || q.get('start')) } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const start = seconds(q.get('t') || q.get('start') || (u.hash.match(/t=([\w:]+)/) || [])[1]);
    if (YT_ID.test(q.get('v') || '')) return { kind: 'youtube', id: q.get('v'), start };
    if ((m = path.match(/^\/(?:shorts|live|embed|v|e)\/([\w-]{11})/))) return { kind: 'youtube', id: m[1], start };
    if (path === '/attribution_link' && q.get('u')) return match(`https://youtube.com${q.get('u')}`);
    return null;
  }

  // Vimeo: vimeo.com/ID, /ID/HASH (unlisted), /channels/x/ID, /groups/x/videos/ID, /showcase/x/video/ID, player.vimeo.com/video/ID?h=HASH
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = path.split('/').filter(Boolean);
    const i = parts.findIndex((p) => /^\d{5,12}$/.test(p));
    if (i < 0) return null;
    const next = parts[i + 1];
    return { kind: 'vimeo', id: parts[i], hash: q.get('h') || (next && /^[0-9a-f]{6,20}$/i.test(next) ? next : null), start: seconds((u.hash.match(/t=([\w:]+)/) || [])[1]) };
  }

  // Bilibili: bilibili.com/video/BV…|av…, ?p= part, ?t= start; the app's b23.tv short links need following.
  if (host === 'bilibili.com' || host === 'player.bilibili.com') {
    const start = seconds(q.get('t'));
    const page = +q.get('p') || 1;
    if ((m = path.match(/\/video\/(BV[0-9A-Za-z]{10})/))) return { kind: 'bilibili', id: m[1], page, start };
    if ((m = path.match(/\/video\/av(\d+)/i))) return { kind: 'bilibili', aid: m[1], id: `av${m[1]}`, page, start };
    if (/^BV[0-9A-Za-z]{10}$/.test(q.get('bvid') || '')) return { kind: 'bilibili', id: q.get('bvid'), page, start };
    if (/^\d+$/.test(q.get('aid') || '')) return { kind: 'bilibili', aid: q.get('aid'), id: `av${q.get('aid')}`, page, start };
    return null;
  }
  // X / Twitter posts: x.com|twitter.com/user/status/ID (also /statuses/, /i/web/status/, mobile., fx/vx mirrors).
  if (/^(x|twitter|fxtwitter|vxtwitter|fixupx|nitter\.net)\.com$|^nitter\.net$/.test(host) || host === 'x.com' || host === 'twitter.com') {
    if ((m = path.match(/\/status(?:es)?\/(\d{5,25})/))) return { kind: 'x', id: m[1] };
    return null;
  }
  // Instagram: posts, reels and IGTV (/p/, /reel/, /reels/, /tv/, also /user/p/…), instagr.am.
  if (host === 'instagram.com' || host === 'instagr.am') {
    if ((m = path.match(/\/(p|reels?|tv)\/([\w-]{5,40})/))) return { kind: 'instagram', id: m[2], type: m[1] === 'p' ? 'p' : m[1] === 'tv' ? 'tv' : 'reel' };
    return null;
  }
  // TikTok: tiktok.com/@user/video/ID, m.tiktok.com/v/ID.html, /embed/…; app short links vm./vt.tiktok.com/CODE and tiktok.com/t/CODE.
  if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    if ((m = path.match(/\/(?:video|v|embed(?:\/v2)?|player\/v1)\/(\d{10,25})/))) return { kind: 'tiktok', id: m[1] };
    if (host !== 'tiktok.com' && (m = path.match(/^\/([\w-]{4,20})/))) return { kind: 'short', id: m[1], url: `https://${host}/${m[1]}` };
    if ((m = path.match(/^\/t\/([\w-]{4,20})/))) return { kind: 'short', id: m[1], url: `https://www.tiktok.com/t/${m[1]}` };
    return null;
  }
  // 抖音: douyin.com/video/ID, iesdouyin.com/share/video/ID, ?modal_id=ID; app short links v.douyin.com/CODE.
  if (host === 'douyin.com' || host === 'iesdouyin.com' || host === 'v.douyin.com') {
    if ((m = path.match(/\/(?:share\/)?video\/(\d{10,25})/))) return { kind: 'douyin', id: m[1] };
    if (/^\d{10,25}$/.test(q.get('modal_id') || '')) return { kind: 'douyin', id: q.get('modal_id') };
    if (host === 'v.douyin.com' && (m = path.match(/^\/([\w-]{4,20})/))) return { kind: 'short', id: m[1], url: `https://v.douyin.com/${m[1]}/` };
    return null;
  }

  // Facebook videos and reels: /watch/?v=ID, /PAGE/videos/(TITLE/)ID, /video.php?v=ID, /reel/ID, /watch/live/?v=ID, story links;
  // the app's short links fb.watch/CODE and /share/v/ or /share/r/CODE need following.
  if (host === 'facebook.com' || host === 'fb.com' || host === 'fb.watch') {
    if (host === 'fb.watch' && (m = path.match(/^\/([\w-]{4,20})/))) return { kind: 'short', id: m[1], url: `https://fb.watch/${m[1]}/` };
    if ((m = path.match(/^\/share\/([vr])\/([\w-]{4,30})/))) return { kind: 'short', id: m[2], url: `https://www.facebook.com/share/${m[1]}/${m[2]}/` };
    if ((m = path.match(/^\/reels?\/(\d{6,25})/))) return { kind: 'facebook', id: m[1], reel: true };
    const v = q.get('v') || q.get('video_id');
    if (/^\d{6,25}$/.test(v || '') && /^\/(watch|video\.php|watch\/live)?\/?/.test(path)) return { kind: 'facebook', id: v };
    if ((m = path.match(/\/videos\/(?:[^/]+\/)?(\d{6,25})/))) return { kind: 'facebook', id: m[1] };
    // Posts and photos: /PAGE/posts/ID, permalink.php / story.php ?story_fbid=, /photo(.php)?fbid=, /PAGE/photos/…,
    // /groups/G/posts/ID; the app's /share/p/CODE short links.
    if ((m = path.match(/^\/share\/p\/([\w-]{4,30})/))) return { kind: 'short', id: m[1], url: `https://www.facebook.com/share/p/${m[1]}/` };
    if (/\/posts\/[\w.-]+|^\/(permalink|story)\.php$|^\/photo(\.php)?\/?$|\/photos\/|\/groups\/[\w.-]+\/(posts|permalink)\//.test(path)
      && (q.get('story_fbid') || q.get('fbid') || /\/(posts|photos|permalink)\//.test(path))) {
      return { kind: 'facebook-post', id: (q.get('story_fbid') || q.get('fbid') || path).slice(0, 80), url: `https://www.facebook.com${path}${q.get('story_fbid') ? `?story_fbid=${q.get('story_fbid')}&id=${q.get('id') || ''}` : q.get('fbid') ? `?fbid=${q.get('fbid')}` : ''}` };
    }
    return null;
  }
  // 小红书: notes at /explore/ID, /discovery/item/ID, /user/profile/U/ID (keeping xsec_token, which the page needs);
  // the app's xhslink.com short links. Shown as a card (小红书 can't be framed).
  if (host === 'xiaohongshu.com') {
    if ((m = path.match(/\/(?:explore|discovery\/item|user\/profile\/\w+)\/([0-9a-f]{24})/))) {
      const token = q.get('xsec_token');
      return { kind: 'card', id: m[1], url: `https://www.xiaohongshu.com/explore/${m[1]}${token ? `?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_share` : ''}` };
    }
    return null;
  }
  if (host === 'xhslink.com' && (m = path.match(/^\/(?:[am]\/)?([\w-]{4,20})/))) return { kind: 'short', id: m[1], url: `https://xhslink.com/${path.slice(1).split('?')[0]}` };

  // 新浪微博: weibo.com/UID/BID, weibo.com/detail/MID, m.weibo.cn/status|detail/ID, weibo.cn/status/ID, video posts
  // (weibo.com/tv/show/1034:…, video.weibo.com/show?fid=1034:…), and t.cn short links (followed by the server).
  // Weibo doesn't allow its pages in frames, so these show as a card (text, picture) made by the server.
  if (/(^|\.)weibo\.(com|cn)$/.test(host)) {
    if ((m = path.match(/^\/(?:status|detail)\/(\w{6,20})/))) return { kind: 'weibo', id: m[1] };
    if ((m = path.match(/^\/\d{5,12}\/(\w{6,20})(?:[/?#]|$)/))) return { kind: 'weibo', id: m[1] };
    const fid = q.get('fid') || (path.match(/\/tv\/show\/(1034:\d{6,25})/) || [])[1];
    if (/^1034:\d{6,25}$/.test(fid || '')) return { kind: 'weibo', id: fid, video: true };
    return null;
  }
  if (host === 't.cn' && (m = path.match(/^\/([\w]{4,12})/))) return { kind: 'short', id: m[1], url: `https://t.cn/${m[1]}` };

  if (host === 'b23.tv') {
    const code = path.split('/')[1];
    if (/^BV[0-9A-Za-z]{10}$/.test(code || '')) return { kind: 'bilibili', id: code, page: 1, start: 0 };
    return code && /^[\w-]{4,20}$/.test(code) ? { kind: 'short', id: code, url: `https://b23.tv/${code}` } : null;
  }
  return null;
}

// The player address for a video.
export function embedUrl(v) {
  if (v.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1${v.start ? `&start=${v.start}` : ''}`;
  if (v.kind === 'vimeo') return `https://player.vimeo.com/video/${v.id}?${v.hash ? `h=${v.hash}&` : ''}playsinline=1${v.start ? `#t=${v.start}s` : ''}`;
  if (v.kind === 'bilibili') {
    const ref = v.aid ? `aid=${v.aid}` : `bvid=${v.id}`;
    return `https://player.bilibili.com/player.html?${ref}&page=${v.page || 1}&autoplay=0&high_quality=1${v.start ? `&t=${v.start}` : ''}`;
  }
  if (v.kind === 'facebook-post') return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(v.url)}&show_text=true&width=500`;
  if (v.kind === 'facebook') return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.reel ? `https://www.facebook.com/reel/${v.id}` : `https://www.facebook.com/watch/?v=${v.id}`)}&show_text=false&width=560`;
  if (v.kind === 'x') return `https://platform.twitter.com/embed/Tweet.html?id=${v.id}&dnt=true`;
  if (v.kind === 'instagram') return `https://www.instagram.com/${v.type}/${v.id}/embed/captioned/`;
  if (v.kind === 'tiktok') return `https://www.tiktok.com/player/v1/${v.id}?autoplay=0&rel=0`;
  if (v.kind === 'douyin') return `https://open.douyin.com/player/video?vid=${v.id}&autoplay=0`;
  return null;
}

// Every other page on these platforms (profiles, channels, 动态, photo posts, notes…) shows as a link card.
export function videoOf(raw) {
  const found = match(raw);
  if (found) return found;
  let text = String(raw || '').trim().replace(/[.,;:!?。，；：！？)\]]+$/, '');
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let u; try { u = new URL(text); } catch { return null; }
  if (!siteOf(u.hostname) || u.pathname.length < 2) return null; // a site's home page isn't worth a card
  // Shopping links: drop tracking extras (spm, utm_, ref…) so the same product is one card; keep what names the item.
  const KEEP = /^(id|item_?id|goods_id|skuId|sku|pid|product_?id|v|p|q|k|title|fbid|story_fbid|xsec_token|tk)$/i;
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|spm|ref|_r|scm|share|from|src|tracking|trk|ali_trackid|pvid|psc|th|smid|sr|qid|crid|sprefix|dib|keywords|linkCode|tag)/i.test(k) && !KEEP.test(k)) u.searchParams.delete(k);
  // One address per product, whichever page or app it came from.
  const site = siteOf(u.hostname);
  let m;
  if (site === 'amazon.com' && (m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i))) return { kind: 'card', id: `amazon:${m[1]}`, url: `https://www.amazon.com/dp/${m[1].toUpperCase()}` };
  if (site === 'jd.com' && (m = u.pathname.match(/\/(?:product\/)?(\d{5,15})\.html/))) return { kind: 'card', id: `jd:${m[1]}`, url: `https://item.jd.com/${m[1]}.html` };
  if ((site === 'taobao.com' || site === 'tmall.com') && /^\d{6,15}$/.test(u.searchParams.get('id') || '')) {
    const host = site === 'tmall.com' ? 'detail.tmall.com' : 'item.taobao.com';
    return { kind: 'card', id: `${site}:${u.searchParams.get('id')}`, url: `https://${host}/item.htm?id=${u.searchParams.get('id')}` };
  }
  if ((site === 'yangkeduo.com' || site === 'pinduoduo.com') && /^\d{5,15}$/.test(u.searchParams.get('goods_id') || '')) return { kind: 'card', id: `pdd:${u.searchParams.get('goods_id')}`, url: `https://mobile.yangkeduo.com/goods.html?goods_id=${u.searchParams.get('goods_id')}` };
  if (site === 'walmart.com' && (m = u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d{5,15})/))) return { kind: 'card', id: `walmart:${m[1]}`, url: `https://www.walmart.com/ip/${m[1]}` };
  if (site === 'ebay.com' && (m = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/))) return { kind: 'card', id: `ebay:${m[1]}`, url: `https://www.ebay.com/itm/${m[1]}` };
  // Wikipedia: one card per article, whichever form the link takes (mobile, /wiki/, /zh-cn/ /zh-tw/ variants, ?title=).
  const wiki = u.hostname.toLowerCase().match(/^([a-z-]{2,12})\.(?:m\.)?wikipedia\.org$/);
  if (wiki) {
    const pm = u.pathname.match(/^\/(?:wiki|zh(?:-[a-z]{2,4})?)\/(.+)$/i);
    let title = pm ? pm[1] : u.searchParams.get('title') || u.searchParams.get('curid') && null;
    if (!title) return null;
    try { title = decodeURIComponent(title); } catch { /* keep as is */ }
    title = title.replace(/ /g, '_');
    const variant = (u.pathname.match(/^\/(zh-[a-z]{2,4})\//i) || [])[1];
    return { kind: 'card', id: `${wiki[1]}:${title}`, url: `https://${wiki[1]}.wikipedia.org/${variant || 'wiki'}/${encodeURIComponent(title)}${u.hash}` };
  }
  // 知乎: questions, answers, 专栏 articles, pins, videos — one card per page (share parameters dropped).
  if (/(^|\.)zhihu\.com$/.test(u.hostname.toLowerCase())) return { kind: 'card', id: u.hostname + u.pathname, url: `https://${u.hostname.replace(/^(www\.)?/, (x, w) => (/^zhuanlan\./.test(u.hostname) ? '' : 'www.'))}${u.pathname}` };
  return { kind: 'card', id: u.href, url: u.href };
}
