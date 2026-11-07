// Video links → embeddable players. The same video can be shared in many link forms depending on where it came from
// (desktop web, mobile web, the mobile app's Share button, a TV/embed link…); all of them map to one player.

// Links in text: with a scheme, or bare (youtu.be/…, www.youtube.com/…, b23.tv/…) as people often type or paste them.
export const LINK_RE = /(?:https?:\/\/|\b(?=(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|bilibili\.com|b23\.tv)\/))[^\s<>"'\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/gi; // a link ends at a space or Chinese text/punctuation

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
// kind 'bilibili-short' means a b23.tv short link, which has to be followed (the server does it) to find the video.
export function videoOf(raw) {
  let text = String(raw || '').trim().replace(/[.,;:!?。，；：！？)\]]+$/, '');
  if (/^vnd\.youtube:/i.test(text)) { const id = text.split(':')[1]?.split(/[?&]/)[0]; return YT_ID.test(id) ? { kind: 'youtube', id, start: 0 } : null; }
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let u; try { u = new URL(text); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|music|gaming)\./, '');
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
  if (host === 'b23.tv') {
    const code = path.split('/')[1];
    if (/^BV[0-9A-Za-z]{10}$/.test(code || '')) return { kind: 'bilibili', id: code, page: 1, start: 0 };
    return code && /^[\w-]{4,20}$/.test(code) ? { kind: 'bilibili-short', id: code, url: `https://b23.tv/${code}` } : null;
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
  return null;
}
