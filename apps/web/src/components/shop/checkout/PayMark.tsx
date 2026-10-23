// PR 120 — a payment brand mark drawn in CSS and inline SVG, exactly as the demo draws it (51-checkout.js co_pmk): no
// image files, no network. The brand colours sit in checkout.css (.pmk-*); the names come from the shop dictionary.
const MC = (
  <svg viewBox="0 0 40 24" width="30" height="18" aria-hidden="true">
    <circle cx="15" cy="12" r="9" fill="#EB001B" />
    <circle cx="25" cy="12" r="9" fill="#F79E1B" />
    <path d="M20 4.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15Z" fill="#FF5F00" />
  </svg>
);

export function PayMark({ id, name, short }: { id: string; name: string; short: string }) {
  let inner: React.ReactNode;
  if (id === 'mastercard') inner = MC;
  else if (id === 'bank')
    inner = (
      <>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M3 9.5 12 4l9 5.5v1.5H3Z" fill="currentColor" />
          <path d="M5 12.5h2.4v5H5Zm5.8 0h2.4v5h-2.4Zm5.8 0H19v5h-2.4ZM3 18.5h18V20H3Z" fill="currentColor" />
        </svg>
        <b>{short}</b>
      </>
    );
  else if (id === 'cod')
    inner = (
      <>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6 9.5v.01M18 14.5v.01" strokeLinecap="round" strokeWidth="2.4" />
        </svg>
        <b>{short}</b>
      </>
    );
  else if (id === 'ssl') {
    const [a, ...b] = short.split(' ');
    inner = (
      <>
        <b>{a}</b>
        {b.length ? <i>{b.join(' ')}</i> : null}
      </>
    );
  } else inner = <b>{short}</b>;
  return (
    <span className={`pmk pmk-${id}`} title={name} role="img" aria-label={name}>
      {inner}
    </span>
  );
}
