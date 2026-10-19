/* ================= EXTAS demo — extra garment drawings (test/demo) =================
   Loads after 02-core.js and WRAPS the global garmentSVG(type, hex, view):
   known types go to the original drawing; the types below are drawn here in
   the same flat style (same 200×222 canvas, same fill/line/detail tones, same
   view handling: 'front', 'back', 'detail', 'flat', 'model').

   New types: tracktop (zip track jacket, stand collar), trackpant (cuffed
   track bottom with side stripe), jogger (cuffed jogger), puffer (quilted
   jacket), bomber (rib-trim jacket), sweater (crew-neck cable knit),
   sweatshirt (crew neck, raglan).  Used by the test data in 01z-combo-test.js.
   ================================================================================ */
(function(){
  if(typeof garmentSVG !== 'function') return;
  var orig = garmentSVG;
  var NEW = {tracktop:1, trackpant:1, jogger:1, puffer:1, bomber:1, sweater:1, sweatshirt:1};

  /* shared top silhouette: neck 80–120, sleeves to the cuffs, hem at 206 */
  var TOP = 'M62 28 L82 18 L118 18 L138 28 L174 52 L186 160 L168 164 L154 90 L152 206 L48 206 L46 90 L32 164 L14 160 L26 52 Z';
  /* a point t (0..1) down each sleeve, on the outer and the inner edge */
  function sl(t, right){ var ox = 26-12*t, oy = 52+108*t, ix = 46-14*t, iy = 90+74*t; return right ? [200-ox, oy, 200-ix, iy] : [ox, oy, ix, iy]; }
  function ln(x1,y1,x2,y2,c,w,extra){ return '<path d="M'+x1+' '+y1+' L'+x2+' '+y2+'" stroke="'+c+'" stroke-width="'+w+'"'+(extra||'')+' fill="none"/>'; }
  /* ribbed band: a filled strip with short vertical rib marks */
  function rib(x1,y1,x2,y2,fill,line,det){
    var h = '<path d="M'+x1+' '+y1+' L'+x2+' '+y1+' L'+x2+' '+y2+' L'+x1+' '+y2+' Z" fill="'+fill+'" stroke="'+line+'" stroke-width="1"/>';
    for(var x=x1+4; x<x2-1; x+=5) h += ln(x, y1+2, x, y2-2, det, .8);
    return h;
  }
  /* ribbed cuff that follows the slant of the sleeve end */
  function cuff(right, fill, line, det){
    var a = sl(.88, right), b = sl(1, right);
    var h = '<path d="M'+a[0]+' '+a[1]+' L'+a[2]+' '+a[3]+' L'+b[2]+' '+b[3]+' L'+b[0]+' '+b[1]+' Z" fill="'+fill+'" stroke="'+line+'" stroke-width="1"/>';
    for(var i=1;i<4;i++){ var t = i/4, x1 = a[0]+(a[2]-a[0])*t, y1 = a[1]+(a[3]-a[1])*t, x2 = b[0]+(b[2]-b[0])*t, y2 = b[1]+(b[3]-b[1])*t; h += ln(x1.toFixed(1), y1.toFixed(1), x2.toFixed(1), y2.toFixed(1), det, .8); }
    return h;
  }
  function zip(y1, y2, det, light){
    return ln(100, y1, 100, y2, det, 2.2)+ln(100, y1, 100, y2, light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.22)', .8, ' stroke-dasharray="1.5 2"')+
      '<rect x="97" y="'+(y1+4)+'" width="6" height="11" rx="1.5" fill="'+(light?'#8C8C8C':'#C9C9C9')+'"/>';
  }

  function draw(type, hex, view){
    var dark = mixHex(hex,'#000000',.28), light = isLight(hex), line = light ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.22)', det = light ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.30)';
    var trim = mixHex(hex,'#000000',.14);                                    /* rib trims, a touch darker */
    var stripe = light ? mixHex(hex,'#1E1E20',.75) : mixHex(hex,'#FFFFFF',.82); /* contrast stripe */
    var back = view==='back', g = '';

    if(type==='tracktop'){
      g += '<path d="'+TOP+'" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
      /* contrast stripes down the outer sleeve */
      var a0 = sl(.04,false), a1 = sl(.86,false), b0 = sl(.04,true), b1 = sl(.86,true);
      g += ln(a0[0]+5, a0[1]+1, a1[0]+5, a1[1], stripe, 4)+ln(b0[0]-5, b0[1]+1, b1[0]-5, b1[1], stripe, 4);
      g += cuff(false, trim, line, det)+cuff(true, trim, line, det)+rib(48, 192, 152, 206, trim, line, det);
      /* stand collar */
      g += '<path d="M80 6 L120 6 L121 22 Q100 28 79 22 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1.2"/>';
      if(!back){
        g += zip(6, 205, det, light);
        g += ln(62, 154, 72, 128, det, 2)+ln(138, 154, 128, 128, det, 2);    /* slant side pockets */
      } else {
        g += '<path d="M82 22 Q100 30 118 22" fill="none" stroke="'+det+'" stroke-width="1.2"/>';
        g += ln(52, 70, 148, 70, det, 1.1);                                   /* back yoke seam */
      }
    }
    else if(type==='sweater' || type==='sweatshirt'){
      g += '<path d="'+TOP+'" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
      if(type==='sweatshirt'){
        g += ln(84, 21, 46, 90, det, 1.3)+ln(116, 21, 154, 90, det, 1.3);    /* raglan seams */
      } else {
        /* cable knit: three twisted columns down the front (lighter on the back) */
        var cols = back ? [70, 100, 130] : [66, 100, 134];
        cols.forEach(function(cx){
          var p1 = 'M'+cx+' 44', p2 = 'M'+cx+' 44';
          for(var y=44; y<182; y+=14){ p1 += ' q6 7 0 14'; p2 += ' q-6 7 0 14'; }
          g += '<path d="'+p1+'" fill="none" stroke="'+det+'" stroke-width="1.6"/><path d="'+p2+'" fill="none" stroke="'+det+'" stroke-width="1.6"/>';
        });
        g += ln(83, 44, 83, 186, det, .7, ' opacity=".7"')+ln(117, 44, 117, 186, det, .7, ' opacity=".7"');
      }
      g += cuff(false, trim, line, det)+cuff(true, trim, line, det)+rib(48, 190, 152, 206, trim, line, det);
      /* ribbed crew neck */
      if(!back){
        g += '<path d="M80 18 Q100 40 120 18 L114 17 Q100 32 86 17 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1"/>';
        if(type==='sweatshirt') g += '<path d="M95 31 L100 42 L105 31 Z" fill="'+trim+'" stroke="'+det+'" stroke-width="1"/>'; /* V insert */
      } else g += '<path d="M80 18 Q100 28 120 18 L115 17 Q100 23 85 17 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1"/>';
    }
    else if(type==='puffer'){
      var PUF = 'M60 28 L80 16 L120 16 L140 28 L178 52 L190 162 L170 168 L156 94 L156 208 L44 208 L44 94 L30 168 L10 162 L22 52 Z';
      g += '<path d="'+PUF+'" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
      /* quilt channels across the body, each a slight curve so it reads puffy */
      for(var y=54; y<200; y+=24){ g += '<path d="M46 '+y+' Q100 '+(y+6)+' 154 '+y+'" fill="none" stroke="'+det+'" stroke-width="1.6"/>'; }
      /* channels across the sleeves */
      for(var t=.2; t<.9; t+=.2){
        var ox = 22-12*t, oy = 52+110*t, ix = 44-14*t, iy = 94+74*t;
        g += ln(ox.toFixed(1), oy.toFixed(1), ix.toFixed(1), iy.toFixed(1), det, 1.4)+ln((200-ox).toFixed(1), oy.toFixed(1), (200-ix).toFixed(1), iy.toFixed(1), det, 1.4);
      }
      g += ln(10, 162, 30, 168, det, 3)+ln(190, 162, 170, 168, det, 3);       /* elastic cuffs */
      g += ln(44, 202, 156, 202, det, 2);                                     /* hem binding */
      /* high funnel collar */
      g += '<path d="M78 2 L122 2 L124 24 Q100 32 76 24 Z" fill="'+mixHex(hex,'#000000',.10)+'" stroke="'+line+'" stroke-width="1.2"/>';
      g += '<path d="M78 12 Q100 18 122 12" fill="none" stroke="'+det+'" stroke-width="1.2"/>';
      if(!back){
        g += zip(2, 207, det, light);
        g += ln(60, 150, 70, 124, det, 2)+ln(140, 150, 130, 124, det, 2);    /* zip pockets */
        g += '<circle cx="70" cy="124" r="1.6" fill="'+det+'"/><circle cx="130" cy="124" r="1.6" fill="'+det+'"/>';
      }
    }
    else if(type==='bomber'){
      var BOM = 'M62 26 L82 16 L118 16 L138 26 L176 52 L188 158 L168 162 L154 92 L154 194 L46 194 L46 92 L32 162 L12 158 L24 52 Z';
      g += '<path d="'+BOM+'" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
      g += rib(46, 194, 154, 212, trim, line, det);                           /* rib hem band */
      g += cuff(false, trim, line, det)+cuff(true, trim, line, det);
      g += '<path d="M81 6 L119 6 L121 22 Q100 28 79 22 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1"/>'; /* rib stand collar */
      for(var q=84; q<118; q+=5) g += ln(q, 8, q, 22, det, .8);
      if(!back){
        g += zip(6, 211, det, light);
        g += ln(62, 160, 74, 132, det, 2.4)+ln(138, 160, 126, 132, det, 2.4); /* welt pockets */
        /* utility pocket on the left sleeve */
        g += '<path d="M150 66 L164 72 L161 88 L147 82 Z" fill="none" stroke="'+det+'" stroke-width="1.2"/>';
      } else g += ln(52, 66, 148, 66, det, 1.1);
    }
    else if(type==='jogger' || type==='trackpant'){
      g += '<path d="M56 10 L144 10 L150 112 L142 196 L110 196 L100 78 L90 196 L58 196 L50 112 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
      g += rib(56, 10, 144, 28, trim, line, det);                             /* elastic waistband */
      /* ribbed cuffs */
      g += '<path d="M58 196 L90 196 L89 214 L60 214 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1"/><path d="M110 196 L142 196 L140 214 L111 214 Z" fill="'+trim+'" stroke="'+line+'" stroke-width="1"/>';
      for(var r=0;r<5;r++){ g += ln(63+r*6, 198, 63+r*6, 212, det, .8)+ln(115+r*6, 198, 115+r*6, 212, det, .8); }
      g += ln(100, 28, 100, 78, det, 1.2);                                    /* centre seam */
      if(type==='trackpant'){
        g += '<path d="M61 30 L56 112 L64 194" fill="none" stroke="'+stripe+'" stroke-width="4"/><path d="M139 30 L144 112 L136 194" fill="none" stroke="'+stripe+'" stroke-width="4"/>';
      }
      if(!back){
        g += '<path d="M96 24 Q94 38 91 48 M104 24 Q106 38 109 48" fill="none" stroke="'+(light?'#FFFFFF':mixHex(hex,'#FFFFFF',.7))+'" stroke-width="1.8" stroke-linecap="round"/>'; /* drawcord */
        g += '<path d="M62 30 Q66 48 74 58 M138 30 Q134 48 126 58" fill="none" stroke="'+det+'" stroke-width="1.3"/>';   /* side pockets */
      } else {
        g += '<rect x="112" y="44" width="22" height="22" rx="2" fill="none" stroke="'+det+'" stroke-width="1.1"/>';         /* back pocket */
      }
    }
    var tr = view==='detail' ? ' transform="translate(-100 -10) scale(2)"' : (view==='flat' ? ' transform="rotate(-4 100 110)"' : '');
    return '<svg class="garment" viewBox="0 0 200 222" aria-hidden="true"><g'+tr+'>'+g+'</g></svg>';
  }

  garmentSVG = function(type, hex, view){
    if(NEW[type]){ try { return draw(type, hex || '#9A9A9A', view); } catch(e){ return orig('tee', hex, view); } }
    return orig(type, hex, view);
  };
  garmentSVG.extraTypes = Object.keys(NEW);
})();
