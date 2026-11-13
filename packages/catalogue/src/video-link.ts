// S28 · PR 681 — reading a video link and writing a length. Pure (no database), so the admin's browser code may use it too.
export type VideoProvider = 'YOUTUBE' | 'VIMEO' | 'FACEBOOK';

export interface ParsedVideoLink {
  provider: VideoProvider;
  /** YouTube / Vimeo id; the whole address for Facebook. */
  id: string;
  /** The address of the player (opened only when a customer taps play). */
  embedUrl: string;
  /** The address of the video's own page, for a person to open. */
  watchUrl: string;
}

/** A video link as the three providers write it; null for anything else. */
export function parseVideoLink(input: string): ParsedVideoLink | null {
  const u = String(input ?? '').trim();
  let m = u.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) {
    return {
      provider: 'YOUTUBE',
      id: m[1]!,
      embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${m[1]}`,
    };
  }
  m = u.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{5,})/i);
  if (m) return { provider: 'VIMEO', id: m[1]!, embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1&title=0&byline=0&portrait=0`, watchUrl: `https://vimeo.com/${m[1]}` };
  if (/^https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com\/(?:.+\/videos\/|watch|reel\/)|fb\.watch\/)/i.test(u)) {
    return { provider: 'FACEBOOK', id: u, embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&autoplay=true`, watchUrl: u };
  }
  return null;
}

/** Seconds as the ISO 8601 length search engines read (`PT1M30S`). */
export function isoDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${r || (!h && !m) ? `${r}S` : ''}`;
}
