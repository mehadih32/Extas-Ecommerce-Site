// H5 (CN-008/009) — the shop's name as a shaped wordmark (demo 97a-owner-a.js logoStyled). Style 0 is the wordmark as
// it was; 1–10 are the owner's ten styles (`brand.logoStyle`), drawn only on the desktop header and the desktop footer
// — the phone never changes. The look is CSS (shop.css .lgs-n); the parts here are only what CSS cannot split.
// V12.2 (Note 54 #15): the ten are refined marks now — 3 serif italic (first letter capital), 4 ring monogram,
// 6 fine rules either side, 8 lower case with a full stop, 9 a fine line under the middle letter.
// ~~5 heavy and light (two parts) · 8 round badge · 9 coloured middle letter~~
export function LogoText({ text, styleNo }: { text: string; styleNo: number }) {
  if (!(styleNo > 0)) return <>{text}</>;
  const n = Math.max(1, Math.min(10, Math.trunc(styleNo)));
  const chars = Array.from(text);
  const mid = Math.floor((chars.length - 1) / 2);
  let xi = chars.findIndex((ch) => /x/i.test(ch));
  if (xi < 0) xi = mid;
  let inner: React.ReactNode = text;
  let split = false;
  if (n === 3) {
    inner = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    split = true;
  } else if (n === 4) {
    inner = (
      <>
        <span className="lgs-ring" aria-hidden="true">
          {chars[0] ?? ''}
        </span>
        <span className="lgs-word">{text}</span>
      </>
    );
    split = true;
  } else if (n === 6) {
    inner = (
      <>
        <i className="lgs-rule" aria-hidden="true" />
        <span>{text}</span>
        <i className="lgs-rule" aria-hidden="true" />
      </>
    );
    split = true;
  } else if (n === 8) {
    inner = (
      <>
        {text}
        <em aria-hidden="true">.</em>
      </>
    );
    split = true;
  } else if (n === 9) {
    inner = (
      <>
        {chars.slice(0, xi).join('')}
        <u>{chars[xi] ?? ''}</u>
        {chars.slice(xi + 1).join('')}
      </>
    );
    split = true;
  }
  // The whole word stays readable to a screen reader even when it is split into parts.
  return (
    <span className={`lgs lgs-${n}`} {...(split ? { role: 'img', 'aria-label': text } : {})}>
      {inner}
    </span>
  );
}
