// Video links → embeddable players. The same video can be shared in many link forms depending on where it came from
// (desktop web, mobile web, the mobile app's Share button, a TV/embed link…); all of them map to one player.

// Links in text: with a scheme, or bare (youtu.be/…, www.youtube.com/…, b23.tv/…) as people often type or paste them.
export const LINK_RE = /(?:https?:\/\/|\b(?=(?:www\.|m\.|music\.|mobile\.|vm\.|vt\.|v\.|web\.|mbasic\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|bilibili\.com|b23\.tv|x\.com|twitter\.com|instagram\.com|instagr\.am|tiktok\.com|douyin\.com|iesdouyin\.com|facebook\.com|fb\.watch|fb\.com|weibo\.com|weibo\.cn|t\.cn)\/))[^\s<>"'\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/gi; // a link ends at a space or Chinese text/punctuation

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
export function videoOf(raw) {
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
    if (path === '/attribution_link' && q.get('u')) return videoOf(`https://youtube.com${q.get('u')}`);
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
    if ((m = path.match(/\/(?:share\/)?(?:video|note)\/(\d{10,25})/))) return { kind: 'douyin', id: m[1] };
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
    return null;
  }

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
  if (v.kind === 'facebook') return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.reel ? `https://www.facebook.com/reel/${v.id}` : `https://www.facebook.com/watch/?v=${v.id}`)}&show_text=false&width=560`;
  if (v.kind === 'x') return `https://platform.twitter.com/embed/Tweet.html?id=${v.id}&dnt=true`;
  if (v.kind === 'instagram') return `https://www.instagram.com/${v.type}/${v.id}/embed/captioned/`;
  if (v.kind === 'tiktok') return `https://www.tiktok.com/player/v1/${v.id}?autoplay=0&rel=0`;
  if (v.kind === 'douyin') return `https://open.douyin.com/player/video?vid=${v.id}&autoplay=0`;
  return null;
}
