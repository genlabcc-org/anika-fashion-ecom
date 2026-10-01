/**
 * Parse a YouTube link (Shorts, watch, youtu.be, embed, live).
 * Returns { platform: 'youtube', code } or null.
 */
const ID_RE = /^[\w-]{11}$/;

export function parseVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m)\./, '');
  let code = null;

  if (host === 'youtu.be') {
    code = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    code = m ? m[2] : url.searchParams.get('v');
  }

  return code && ID_RE.test(code) ? { platform: 'youtube', code } : null;
}