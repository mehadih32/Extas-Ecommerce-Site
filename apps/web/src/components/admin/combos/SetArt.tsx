'use client';
// The picture on a combo card: the set photo made from the piece photos (PR 575) when there is one, otherwise the
// pieces drawn as colour panels on the house background (demo ca_setPhoto without photos) — never an empty box.
export interface ArtPiece {
  hex: string | null;
  name: string;
}

export function SetArt({ photoUrl, pieces, alt, variant = 'card' }: { photoUrl?: string | null; pieces: ArtPiece[]; alt: string; variant?: 'card' | 'thumb' }) {
  if (photoUrl) {
    return (
      <div className={`cb-art cb-art-${variant}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a stored rendition of our own media */}
        <img src={photoUrl} alt={alt} loading="lazy" decoding="async" />
      </div>
    );
  }
  const n = Math.max(1, Math.min(pieces.length, 6));
  return (
    <div className={`cb-art cb-art-${variant} cb-art-drawn n${n}`} role="img" aria-label={alt}>
      {pieces.slice(0, 6).map((p, i) => (
        <span key={i} className="cb-art-pc" style={{ background: p.hex ?? undefined }} />
      ))}
    </div>
  );
}
