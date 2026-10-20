/* ---------- 07-phone.js — the ONE Bangladeshi phone normaliser (owner fix H14 / K10, 20 Oct) ----------
   Rule: never block a real number because of how it was typed.
     1. Bengali (০-৯) or mixed digits become 0-9.
     2. Everything that is not a digit is removed (spaces, dashes, +, brackets, dots).
     3. A leading "00" followed by "880" loses the "00"      (00880 17… → 880 17…).
     4. A number starting "880" loses the "88"                (880 17… → 017…).
     5. A 12-digit number starting "00" loses one "0"         (0017… typed by mistake → 017…).
     6. A 10-digit number starting 1[3-9] gets a leading "0"  (1712345678 → 01712345678).
     7. Then it must match ^01[3-9]\d{8}$.
   phoneNormalizeBD(raw) → { ok, digits, nice, empty, msg }
     digits: the cleaned number (show it back to the customer)
     nice:   01712-345678 when ok
     e164:   +8801712345678 when ok (the form a server / SMS gateway stores)
     msg:    one plain line, only when the number is impossible
   Every screen that reads a phone number should call this helper rather than its own copy. */
var PHONE_BD_RE = /^01[3-9]\d{8}$/;
function phoneDigitsBD(raw){
  return String(raw == null ? '' : raw).replace(/[০-৯]/g, function(c){ return String(c.charCodeAt(0) - 0x09E6); });
}
function phoneNormalizeBD(raw){
  var d = phoneDigitsBD(raw).replace(/\D/g, '');
  if(d.indexOf('00880') === 0) d = d.slice(2);
  if(d.indexOf('880') === 0) d = d.slice(2);
  if(d.indexOf('00') === 0 && d.length === 12) d = d.slice(1);
  if(d.length === 10 && /^1[3-9]/.test(d)) d = '0' + d;
  if(!d) return { ok:false, empty:true, digits:'', nice:'', msg:'' };
  if(PHONE_BD_RE.test(d)) return { ok:true, empty:false, digits:d, nice:d.slice(0,5) + '-' + d.slice(5), e164:'+88' + d, msg:'' };
  var msg = (d.indexOf('01') === 0 && d.length >= 3 && !/^01[3-9]/.test(d))
    ? 'Mobile numbers start with 013 to 019. Enter an 11-digit mobile number, like 01712345678.'
    : 'Enter an 11-digit mobile number, like 01712345678.';
  return { ok:false, empty:false, digits:d, nice:'', msg:msg };
}
