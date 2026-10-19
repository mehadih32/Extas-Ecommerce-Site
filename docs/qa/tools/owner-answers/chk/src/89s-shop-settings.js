/* =====================================================================
   89s-shop-settings.js — সওদাগর Sawdagor · Admin › Settings rows for the
   owner's answers in round 15 note 23 (23.1 offer ticks, 23.9 trial at the
   door, 23.13 same size twice). Registered into Prohori's settings list
   (ZS_SETTINGS / ZS_GROUPS in 89-admin-system.js) the way its own rows are:
   get / set / def / reset, so search, badges, "Reset to default" and the two
   tiers all work. Values live in ST.shopOpt and are read by OPT()
   (08-shop-opts.js). No shared file is edited.
   ===================================================================== */
(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof ZS_GROUPS==='undefined') return;
  var row = function(id, g, en, bn, type, where, see, extra){
    var s = {id:'opt.'+id, g:g, en:en, bn:bn, type:type, where:where, see:see||'',
      get:function(){ return OPT(id); }, set:function(v){ optSet(id, type==='sw' ? !!v : v); },
      def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }};
    if(extra) for(var k in extra) s[k] = extra[k];
    return s;
  };
  var rows = [
    /* 23.1 — offer ticks */
    row('consent.smsOn', 'consent', 'SMS offers tick — ticked at the start', 'চেকআউটে "SMS-এ অফার" টিক আগে থেকে দেওয়া থাকবে', 'sw', 'Checkout · Ad landing order form', '#/checkout'),
    row('consent.sms', 'consent', 'SMS offers tick — words (English)', 'SMS অফারের টিকের লেখা — ইংরেজি', 'text', 'Checkout · Ad landing order form', '#/checkout'),
    row('consent.smsBn', 'consent', 'SMS offers tick — words (Bengali)', 'SMS অফারের টিকের লেখা — বাংলা', 'text', 'Checkout in বাং', '#/checkout'),
    row('consent.waOn', 'consent', 'WhatsApp offers tick — ticked at the start', 'WhatsApp অফারের টিক আগে থেকে দেওয়া থাকবে — বন্ধ রাখা আছে (কাস্টমার নিজে দেবে)', 'sw', 'Checkout · Ad landing order form', '#/checkout'),
    row('consent.wa', 'consent', 'WhatsApp offers tick — words (English)', 'WhatsApp অফারের টিকের লেখা — ইংরেজি', 'text', 'Checkout · Ad landing order form', '#/checkout'),
    row('consent.waBn', 'consent', 'WhatsApp offers tick — words (Bengali)', 'WhatsApp অফারের টিকের লেখা — বাংলা', 'text', 'Checkout in বাং', '#/checkout'),
    /* 23.9 — trial at the door */
    row('trial.on', 'trial', 'Customer may try at the door in front of the rider', 'কাস্টমার দরজায় রাইডারের সামনে পরে দেখতে পারবে', 'sw', 'Product page · Checkout · Delivery and Exchange help pages', '#/p/essential-pique-polo'),
    row('trial.line', 'trial', 'Short line (English)', 'ছোট লাইন — ইংরেজি (প্রোডাক্ট পেজ আর চেকআউটে)', 'text', 'Product page, under Delivery · Exchange · Returns · Checkout, next to the delivery time', '#/p/essential-pique-polo'),
    row('trial.lineBn', 'trial', 'Short line (Bengali)', 'ছোট লাইন — বাংলা', 'text', 'Same places, when the shop is in বাং', '#/checkout'),
    row('trial.help', 'trial', 'Help page sentence (English)', 'হেল্প পেজের পুরো কথা — ইংরেজি', 'text', 'Delivery and Exchange help pages · help search', '#/page/delivery'),
    row('trial.helpBn', 'trial', 'Help page sentence (Bengali)', 'হেল্প পেজের পুরো কথা — বাংলা', 'text', 'Delivery and Exchange help pages in বাং', '#/page/delivery'),
    /* 23.13 — same size added twice */
    row('bag.duplicateAdd', 'bagopt', 'Same size added again', 'একই সাইজ আবার "ব্যাগে রাখুন" চাপলে কী হবে', 'sel', 'Product page · Add to Bag', '#/p/essential-pique-polo',
      {opts:[['block','Say "already in your bag" (as now)'], ['qty','Add one more (quantity +1, never past stock)']]}),
    row('bag.qtyToast', 'bagopt', 'Message when one more is added ({size}, {qty})', 'আরেকটা যোগ হলে যে মেসেজ দেখায় — ইংরেজি', 'text', 'Product page toast (only with "Add one more")', '#/p/essential-pique-polo'),
    row('bag.qtyToastBn', 'bagopt', 'Same message (Bengali)', 'একই মেসেজ — বাংলা', 'text', 'Product page toast in বাং', '#/p/essential-pique-polo'),
    row('bag.endedNote', 'bagopt', 'Note when a combo offer ended while in the bag (English)', 'ব্যাগে থাকা কম্বোর অফার শেষ হলে যে লেখা দেখায় — ইংরেজি', 'text', 'Bag · Checkout (the set keeps its bag price)', '#/bag'),
    row('bag.endedNoteBn', 'bagopt', 'Same note (Bengali)', 'একই লেখা — বাংলা', 'text', 'Bag · Checkout in বাং', '#/bag')
  ];
  rows.forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  var groups = [
    ['consent', 'Offer messages — customer ticks', 'অফারের মেসেজ — কাস্টমারের টিক (SMS আর WhatsApp আলাদা)', '148 · 298 · 505'],
    ['trial', 'Trial at the door', 'দরজায় ট্রায়াল — রাইডারের সামনে পরে দেখা', '23.9'],
    ['bagopt', 'Bag — same size twice, ended offers', 'ব্যাগ — একই সাইজ দুইবার, শেষ হওয়া অফার', 'P11']
  ];
  var at = -1; ZS_GROUPS.forEach(function(g, i){ if(g[0]==='install') at = i; });
  groups.forEach(function(g){
    if(ZS_GROUPS.some(function(x){ return x[0]===g[0]; })) return;
    if(at >= 0){ ZS_GROUPS.splice(at, 0, g); at++; } else ZS_GROUPS.push(g);
  });
})();
