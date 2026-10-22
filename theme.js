// ===== TÙY CHỈNH TRANG (chỉ Admin tổng chỉnh) =====
// Admin tổng chỉnh nền, màu, kiểu phối màu có sẵn, phông chữ, viền/bo góc/bóng, màu riêng từng thành phần
// và chữ ở màn hình tải trang. Bấm "Lưu" thì lưu lên Firestore (tài liệu settings_site) và MỌI NGƯỜI mở web đều thấy.
// Trong lúc chỉnh, cả trang đổi màu ngay để xem thử (chưa lưu thì chỉ mình bạn thấy, tải lại là mất).
//
// Cách hoạt động: toàn bộ giao diện đã dùng các biến CSS (--bg, --ink, --line, --c-card-line...). File này chỉ sinh ra
// 1 thẻ <style id="themeStyle"> ghi đè các biến đó, nên không đụng tới code của các trang khác.
// Bản đã lưu cũng được nhớ trong localStorage ('acc_theme_v1') và áp dụng NGAY từ index.html trước khi vẽ trang (không nháy màu cũ).
(function(){
  'use strict';
  const LS_KEY = 'acc_theme_v1';
  const $ = (s, r)=> (r||document).querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const clamp = (n, a, b)=> Math.max(a, Math.min(b, Number(n)||0));

  // ---------- Danh sách màu ----------
  const MAIN = [   // [khoá, nhãn, biến CSS]
    ['bg','Nền trang','--bg'], ['card','Nền ô / thẻ / cửa sổ','--card'],
    ['ink','Chữ chính','--ink'], ['sub','Chữ phụ (mờ)','--sub'],
    ['line','Viền chính','--line'], ['lineSoft','Viền nhạt','--line-soft'],
    ['accent','Màu nút chính','--accent'], ['accentInk','Chữ trên nút chính','--accent-ink'],
    ['edit','Màu nhấn (nút Sửa, liên kết, ô đang chọn)','--edit'], ['ok','Màu giá / thành công','--ok'],
    ['danger','Màu cảnh báo / nút Xóa','--danger'], ['mark','Màu tô sáng chữ khi tìm','--mark']
  ];
  const COMPS = [  // [khoá, nhãn, biến CSS, biến gốc để lấy màu mặc định]
    ['headerBg','Thanh tiêu đề — nền','--c-header-bg','--bg'], ['headerLine','Thanh tiêu đề — đường viền','--c-header-line','--line'],
    ['navLine','Nút menu — viền','--c-nav-line','--line-soft'], ['navActiveBg','Nút menu đang chọn — nền','--c-nav-active-bg','--accent'],
    ['navActiveInk','Nút menu đang chọn — chữ','--c-nav-active-ink','--accent-ink'],
    ['cardBg','Thẻ acc — nền','--c-card-bg','--card'], ['cardLine','Thẻ acc — viền','--c-card-line','--line'],
    ['codeLine','Nhãn mã số — viền','--c-code-line','--line'], ['priceInk','Giá tiền — màu chữ','--c-price','--ok'],
    ['inputBg','Ô nhập chữ — nền','--c-input-bg','--card'], ['inputLine','Ô nhập chữ — viền','--c-input-line','--line-soft'],
    ['inputFocus','Ô nhập chữ — viền khi chọn','--c-input-focus','--edit'],
    ['modalBg','Cửa sổ nổi / khung đăng nhập — nền','--c-modal-bg','--card'], ['modalLine','Cửa sổ nổi / khung đăng nhập — viền','--c-modal-line','--line'],
    ['btnBg','Nút chính (Lưu, Vào trang…) — nền','--c-btn-bg','--accent'], ['btnInk','Nút chính — chữ','--c-btn-ink','--accent-ink'],
    ['btnLine','Nút chính — viền','--c-btn-line','--line'],
    ['fabBg','Nút “+” thêm acc — nền','--c-fab-bg','--accent'], ['fabInk','Nút “+” thêm acc — dấu +','--c-fab-ink','--accent-ink'],
    ['toastLine','Thông báo nổi — viền','--c-toast-line','--line']
  ];
  const MAIN_VAR = {}; MAIN.forEach(m=> MAIN_VAR[m[0]] = m[2]);
  const COMP_VAR = {}; COMPS.forEach(m=> COMP_VAR[m[0]] = m[2]);

  // ---------- Phông chữ (đều hỗ trợ tiếng Việt) ----------
  const FONTS = [
    {id:'sys', label:'Phông của hệ thống', stack:"-apple-system,Segoe UI,Roboto,Arial,sans-serif"},
    {id:'space', label:'Space Grotesk', stack:"'Space Grotesk',sans-serif", gf:'Space+Grotesk:wght@500;600;700'},
    {id:'inter', label:'Inter', stack:"'Inter',sans-serif", gf:'Inter:wght@400;500;600;700'},
    {id:'bevn', label:'Be Vietnam Pro', stack:"'Be Vietnam Pro',sans-serif", gf:'Be+Vietnam+Pro:wght@400;500;600;700'},
    {id:'roboto', label:'Roboto', stack:"'Roboto',sans-serif", gf:'Roboto:wght@400;500;700'},
    {id:'opensans', label:'Open Sans', stack:"'Open Sans',sans-serif", gf:'Open+Sans:wght@400;500;600;700'},
    {id:'montserrat', label:'Montserrat', stack:"'Montserrat',sans-serif", gf:'Montserrat:wght@400;500;600;700'},
    {id:'nunito', label:'Nunito (tròn, mềm)', stack:"'Nunito',sans-serif", gf:'Nunito:wght@400;500;600;700'},
    {id:'quicksand', label:'Quicksand (tròn, nhẹ)', stack:"'Quicksand',sans-serif", gf:'Quicksand:wght@400;500;600;700'},
    {id:'lexend', label:'Lexend (dễ đọc)', stack:"'Lexend',sans-serif", gf:'Lexend:wght@400;500;600;700'},
    {id:'baloo', label:'Baloo 2 (vui nhộn)', stack:"'Baloo 2',sans-serif", gf:'Baloo+2:wght@400;500;600;700'},
    {id:'oswald', label:'Oswald (cao, hẹp)', stack:"'Oswald',sans-serif", gf:'Oswald:wght@400;500;600;700'},
    {id:'barlow', label:'Barlow', stack:"'Barlow',sans-serif", gf:'Barlow:wght@400;500;600;700'},
    {id:'playfair', label:'Playfair Display (có chân, sang)', stack:"'Playfair Display',serif", gf:'Playfair+Display:wght@400;500;600;700'},
    {id:'lora', label:'Lora (có chân)', stack:"'Lora',serif", gf:'Lora:wght@400;500;600;700'},
    {id:'merri', label:'Merriweather (có chân)', stack:"'Merriweather',serif", gf:'Merriweather:wght@400;700'},
    {id:'notoserif', label:'Noto Serif (có chân)', stack:"'Noto Serif',serif", gf:'Noto+Serif:wght@400;500;600;700'},
    {id:'plexmono', mono:true, label:'IBM Plex Mono', stack:"'IBM Plex Mono',monospace", gf:'IBM+Plex+Mono:wght@500;600'},
    {id:'jbmono', mono:true, label:'JetBrains Mono', stack:"'JetBrains Mono',monospace", gf:'JetBrains+Mono:wght@400;500;600;700'},
    {id:'robmono', mono:true, label:'Roboto Mono', stack:"'Roboto Mono',monospace", gf:'Roboto+Mono:wght@400;500;600;700'},
    {id:'spacemono', mono:true, label:'Space Mono', stack:"'Space Mono',monospace", gf:'Space+Mono:wght@400;700'},
    {id:'srccode', mono:true, label:'Source Code Pro', stack:"'Source Code Pro',monospace", gf:'Source+Code+Pro:wght@400;500;600;700'}
  ];
  const FONT_BY = {}; FONTS.forEach(f=> FONT_BY[f.id] = f);
  const FONT_ROLES = [['head','Chữ tiêu đề / nút / menu','--ff'], ['body','Chữ nội dung','--ff-body'], ['mono','Chữ mã số, giá, ngày giờ','--ff-mono']];

  const SHADOWS = {
    none:   ['0 0 0 0 transparent', '0 0 0 0 transparent'],
    soft:   ['0 1px 2px rgba(22,22,26,.06)', '0 10px 28px rgba(22,22,26,.12)'],
    strong: ['0 2px 6px rgba(0,0,0,.25)', '0 16px 40px rgba(0,0,0,.42)'],
    hard:   ['3px 3px 0 var(--line)', '6px 6px 0 var(--line)']
  };
  const SHADOW_LABEL = {none:'Không bóng', soft:'Bóng nhẹ', strong:'Bóng đậm', hard:'Bóng cứng (kiểu neo-brutalism)'};
  const BG_MODES = {solid:'Màu đặc', gradient:'Chuyển màu', dots:'Chấm bi', grid:'Lưới ô vuông', image:'Ảnh từ link (https://…)'};

  const LOAD_DEF = { greetUser:'Chào {name}!', greetGuest:'Chào khách!', note:'Vui lòng đợi chút — tải trang có thể mất vài phút.' };

  // ---------- Các phong cách có sẵn ----------
  const PRESETS = [
    {id:'default', name:'Mặc định', desc:'Theo sáng/tối của máy'},
    {id:'light', name:'Sáng tối giản', c:{bg:'#f2f1ec',card:'#ffffff',ink:'#16161a',sub:'#68686e',line:'#16161a',lineSoft:'#dcdad2',accent:'#16161a',accentInk:'#ffffff',danger:'#b3261e',ok:'#177a4c',edit:'#1d4fd8',mark:'#ffe066'}, shape:{bw:2,radius:12,shadow:'soft'}},
    {id:'dark', name:'Tối', c:{bg:'#101012',card:'#1a1a1d',ink:'#f1f0eb',sub:'#9c9ca2',line:'#f1f0eb',lineSoft:'#2b2b2f',accent:'#f1f0eb',accentInk:'#101012',danger:'#ff7a70',ok:'#4fd894',edit:'#7fa8ff',mark:'#ffe066'}, shape:{bw:2,radius:12,shadow:'strong'}},
    {id:'brutal', name:'Neo-brutalism', c:{bg:'#fff1a8',card:'#ffffff',ink:'#111111',sub:'#4a4a4a',line:'#111111',lineSoft:'#b9a64a',accent:'#ff5a36',accentInk:'#111111',danger:'#d90429',ok:'#0a8f3c',edit:'#2457ff',mark:'#8ef0ff'}, shape:{bw:3,radius:6,shadow:'hard'}, font:{head:'space',body:'bevn',mono:'spacemono'}},
    {id:'ocean', name:'Đại dương', c:{bg:'#e6f3fb',card:'#ffffff',ink:'#0b2540',sub:'#4a6a85',line:'#0b5ea8',lineSoft:'#bcd9ee',accent:'#0b6fc4',accentInk:'#ffffff',danger:'#c62840',ok:'#0e8a6e',edit:'#0b6fc4',mark:'#ffe08a'}, bg:{mode:'gradient',color2:'#c9e6f7',angle:180}, shape:{bw:2,radius:14,shadow:'soft'}, font:{head:'montserrat',body:'opensans',mono:'plexmono'}},
    {id:'forest', name:'Rừng matcha', c:{bg:'#edf3e4',card:'#fbfdf7',ink:'#1f2d1c',sub:'#5b6e55',line:'#2f5d2a',lineSoft:'#cfdcc3',accent:'#2f6b2a',accentInk:'#f4fbe9',danger:'#b3392b',ok:'#2f8a3a',edit:'#3a7d44',mark:'#f6e27a'}, shape:{bw:2,radius:16,shadow:'soft'}, font:{head:'nunito',body:'nunito',mono:'plexmono'}},
    {id:'sunset', name:'Hoàng hôn', c:{bg:'#fff0e6',card:'#fffaf6',ink:'#3a1c2b',sub:'#86556b',line:'#c2410c',lineSoft:'#f3c9b3',accent:'#e8590c',accentInk:'#ffffff',danger:'#c92a2a',ok:'#2b8a3e',edit:'#d6336c',mark:'#ffe066'}, bg:{mode:'gradient',color2:'#ffd0de',angle:160}, shape:{bw:2,radius:18,shadow:'soft'}, font:{head:'baloo',body:'nunito',mono:'jbmono'}},
    {id:'neon', name:'Neon tím', c:{bg:'#0d0221',card:'#170a33',ink:'#f0e8ff',sub:'#a994d6',line:'#9d4edd',lineSoft:'#2f1a5c',accent:'#c77dff',accentInk:'#12002b',danger:'#ff4d6d',ok:'#5eead4',edit:'#7df9ff',mark:'#ffd166'}, bg:{mode:'gradient',color2:'#1d0a45',angle:160}, shape:{bw:2,radius:10,shadow:'strong'}, font:{head:'lexend',body:'lexend',mono:'jbmono'}},
    {id:'sepia', name:'Giấy cổ', c:{bg:'#f4ecd8',card:'#fbf6e8',ink:'#3b2f1e',sub:'#7a6a50',line:'#5c4a2e',lineSoft:'#dccfae',accent:'#6b4f2a',accentInk:'#fbf3df',danger:'#a4262c',ok:'#4d7c3a',edit:'#8a5a1f',mark:'#f3d77a'}, shape:{bw:2,radius:4,shadow:'none'}, font:{head:'playfair',body:'lora',mono:'plexmono'}},
    {id:'pink', name:'Hồng pastel', c:{bg:'#fff0f6',card:'#ffffff',ink:'#4a1d3a',sub:'#94607f',line:'#d6336c',lineSoft:'#f8c9dd',accent:'#e64980',accentInk:'#ffffff',danger:'#c2255c',ok:'#2f9e6a',edit:'#7048e8',mark:'#ffec99'}, bg:{mode:'dots'}, shape:{bw:2,radius:20,shadow:'soft'}, font:{head:'quicksand',body:'quicksand',mono:'robmono'}},
    {id:'terminal', name:'Terminal xanh', c:{bg:'#050a05',card:'#0a140a',ink:'#33ff66',sub:'#1fa63f',line:'#33ff66',lineSoft:'#0f3d1a',accent:'#33ff66',accentInk:'#021a08',danger:'#ff5555',ok:'#7dff9b',edit:'#66ffd9',mark:'#b8ff5c'}, bg:{mode:'grid'}, shape:{bw:1,radius:0,shadow:'none'}, font:{head:'jbmono',body:'jbmono',mono:'jbmono'}},
    {id:'luxury', name:'Đen vàng sang', c:{bg:'#0e0e0e',card:'#181818',ink:'#f5e9c8',sub:'#b49a5a',line:'#c9a227',lineSoft:'#2c2614',accent:'#c9a227',accentInk:'#121212',danger:'#e0584a',ok:'#7fbf7b',edit:'#e6c35c',mark:'#f5d76e'}, shape:{bw:2,radius:8,shadow:'strong'}, font:{head:'playfair',body:'bevn',mono:'plexmono'}},
    {id:'paper', name:'Báo giấy đen trắng', c:{bg:'#ffffff',card:'#ffffff',ink:'#000000',sub:'#555555',line:'#000000',lineSoft:'#dddddd',accent:'#000000',accentInk:'#ffffff',danger:'#d00000',ok:'#006600',edit:'#0000cc',mark:'#ffff00'}, shape:{bw:2,radius:0,shadow:'none'}, font:{head:'oswald',body:'roboto',mono:'robmono'}}
  ];

  // ---------- Dữ liệu giao diện ----------
  function blank(){ return { preset:'default', c:{}, comp:{}, bg:{mode:'solid', color2:'', angle:160, image:''}, shape:{}, font:{}, load:Object.assign({}, LOAD_DEF) }; }
  const validUrl = u => typeof u === 'string' && /^https?:\/\/[^\s"'()\\]+$/i.test(u);
  // Luôn lọc lại dữ liệu đọc từ Firestore: chỉ nhận màu #rrggbb, số trong khoảng, phông trong danh sách, link https — không cho chèn CSS lạ.
  function normalize(raw){
    const t = blank(); if(!raw || typeof raw !== 'object') return t;
    if(typeof raw.preset === 'string') t.preset = raw.preset.slice(0, 20);
    MAIN.forEach(m=>{ if(raw.c && isHex(raw.c[m[0]])) t.c[m[0]] = raw.c[m[0]].toLowerCase(); });
    COMPS.forEach(m=>{ if(raw.comp && isHex(raw.comp[m[0]])) t.comp[m[0]] = raw.comp[m[0]].toLowerCase(); });
    const b = raw.bg || {};
    if(BG_MODES[b.mode]) t.bg.mode = b.mode;
    if(isHex(b.color2)) t.bg.color2 = b.color2.toLowerCase();
    if(b.angle != null) t.bg.angle = clamp(b.angle, 0, 360);
    if(validUrl(b.image)) t.bg.image = b.image;
    const sh = raw.shape || {};
    if(sh.bw != null) t.shape.bw = clamp(sh.bw, 0, 8);
    if(sh.radius != null) t.shape.radius = clamp(sh.radius, 0, 32);
    if(SHADOWS[sh.shadow]) t.shape.shadow = sh.shadow;
    FONT_ROLES.forEach(r=>{ if(raw.font && FONT_BY[raw.font[r[0]]]) t.font[r[0]] = raw.font[r[0]]; });
    const l = raw.load || {};
    ['greetUser','greetGuest','note'].forEach(k=>{ if(typeof l[k] === 'string') t.load[k] = l[k].slice(0, 200); });
    return t;
  }
  function presetToTheme(p, keepLoad){
    const t = blank();
    if(p.c) Object.assign(t.c, p.c);
    if(p.comp) Object.assign(t.comp, p.comp);
    if(p.bg) Object.assign(t.bg, p.bg);
    if(p.shape) Object.assign(t.shape, p.shape);
    if(p.font) Object.assign(t.font, p.font);
    t.preset = p.id;
    if(keepLoad) t.load = clone(keepLoad);
    return normalize(t);
  }

  // ---------- Sinh CSS ----------
  function fontUrl(f){ return 'https://fonts.googleapis.com/css2?family='+f.gf+'&display=swap'; }
  function buildCss(t){
    const v = [], fonts = [];
    MAIN.forEach(m=>{ if(t.c[m[0]]) v.push(m[2]+':'+t.c[m[0]]); });
    COMPS.forEach(m=>{ if(t.comp[m[0]]) v.push(m[2]+':'+t.comp[m[0]]); });
    const sh = t.shape;
    if(sh.bw != null) v.push('--bw:'+sh.bw+'px');
    if(sh.radius != null){ v.push('--r-m:'+sh.radius+'px', '--r-s:'+Math.round(sh.radius*.65)+'px', '--r-l:'+Math.round(sh.radius*1.5)+'px'); }
    if(sh.shadow){ v.push('--shadow-1:'+SHADOWS[sh.shadow][0], '--shadow-2:'+SHADOWS[sh.shadow][1]); }
    FONT_ROLES.forEach(r=>{
      const f = FONT_BY[t.font[r[0]]]; if(!f) return;
      v.push(r[2]+':'+f.stack);
      if(f.gf){ const u = fontUrl(f); if(fonts.indexOf(u) < 0) fonts.push(u); }
    });
    let css = v.length ? 'html:root[data-theme-custom]{'+v.join(';')+'}' : '';
    const b = t.bg; let body = '';
    if(b.mode === 'gradient') body = 'background:linear-gradient('+clamp(b.angle,0,360)+'deg,var(--bg),'+(isHex(b.color2) ? b.color2 : 'var(--card)')+') fixed;';
    else if(b.mode === 'dots') body = 'background-color:var(--bg);background-image:radial-gradient(color-mix(in srgb,var(--ink) 22%,transparent) 1.3px,transparent 1.6px);background-size:20px 20px;';
    else if(b.mode === 'grid') body = 'background-color:var(--bg);background-image:linear-gradient(color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px);background-size:28px 28px;';
    else if(b.mode === 'image' && validUrl(b.image)) body = 'background:var(--bg) url("'+b.image+'") center/cover no-repeat fixed;';
    if(body) css += 'html[data-theme-custom] body{'+body+'}';
    return { css, fonts };
  }
  function applyDom(t){
    const r = buildCss(t);
    let st = document.getElementById('themeStyle');
    if(!st){ st = document.createElement('style'); st.id = 'themeStyle'; document.head.appendChild(st); }
    st.textContent = r.css;
    if(r.css) document.documentElement.setAttribute('data-theme-custom', '1'); else document.documentElement.removeAttribute('data-theme-custom');
    r.fonts.forEach(u=>{
      if(document.querySelector('link[data-gf][href="'+u+'"]')) return;
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.setAttribute('data-gf','1'); document.head.appendChild(l);
    });
    return r;
  }
  function persistLocal(t, r){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ css:r.css, fonts:r.fonts, load:t.load })); }catch(e){}
    if(window.Loader && Loader.refreshTexts) Loader.refreshTexts();
  }

  // ---------- Trạng thái ----------
  let saved = blank(), draft = blank(), dirty = false;
  const tabVisible = ()=>{ const el = $('#tab-theme'); return !!el && !el.classList.contains('hide'); };

  function startListener(){
    if(typeof db === 'undefined' || typeof COL === 'undefined') return;
    db.collection(COL.accounts).doc(SITE_DOC).onSnapshot(snap=>{
      if(!snap.exists && snap.metadata && snap.metadata.fromCache) return;   // bộ nhớ đệm chưa có: đừng ghi đè giao diện đã nhớ bằng mặc định
      saved = normalize(snap.exists ? (snap.data()||{}).theme : null);
      if(dirty) return;                                                    // Admin đang chỉnh dở: không đè lên bản xem thử
      draft = clone(saved);
      persistLocal(saved, applyDom(saved));
      if(tabVisible()) render();
    }, ()=>{});
  }

  // ---------- Giao diện trang chỉnh ----------
  const cssVal = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function toHex(s){
    s = (s||'').trim(); let m;
    if(/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s))) return ('#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]).toLowerCase();
    if((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s))) return '#'+[m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,'0')).join('');
    return null;
  }
  function colorField(group, key, label, cssVar, baseVar, dflt){
    const own = draft[group][key];
    const val = own || dflt || toHex(cssVal(cssVar)) || toHex(cssVal(baseVar||'--bg')) || '#000000';
    return `<div class="th-field"><span>${label}</span><div class="th-row">
      <input type="color" data-g="${group}" data-k="${key}" value="${val}">
      <span class="th-hex">${val}</span>
      ${own ? `<button type="button" class="th-reset" data-rg="${group}" data-rk="${key}" title="Bỏ màu đã chỉnh, dùng màu mặc định">↺ Tự động</button>` : '<span class="th-auto">tự động</span>'}
    </div></div>`;
  }
  function fontSelect(role, label){
    const cur = draft.font[role] || '';
    const opt = f => `<option value="${f.id}"${cur===f.id?' selected':''}>${f.label}</option>`;
    return `<div class="th-field"><span>${label}</span>
      <select data-font="${role}"><option value="">Mặc định của trang</option>
        <optgroup label="Chữ thường">${FONTS.filter(f=>!f.mono).map(opt).join('')}</optgroup>
        <optgroup label="Chữ đơn cách (mono)">${FONTS.filter(f=>f.mono).map(opt).join('')}</optgroup>
      </select></div>`;
  }
  function presetBtn(p){
    const on = draft.preset === p.id ? ' on' : '';
    if(!p.c) return `<button type="button" class="th-preset${on}" data-preset="${p.id}" style="background:linear-gradient(90deg,#f2f1ec 50%,#101012 50%);color:#888;border:2px solid #888"><b style="background:rgba(255,255,255,.85);color:#222;padding:1px 6px;border-radius:6px;align-self:flex-start">${p.name}</b><span style="background:rgba(255,255,255,.85);color:#222;padding:1px 6px;border-radius:6px;font-size:11px;align-self:flex-start">${p.desc}</span></button>`;
    const bw = (p.shape && p.shape.bw != null) ? p.shape.bw : 2, r = (p.shape && p.shape.radius != null) ? p.shape.radius : 12;
    return `<button type="button" class="th-preset${on}" data-preset="${p.id}" style="background:${p.c.bg};color:${p.c.ink};border:${bw}px solid ${p.c.line};border-radius:${r}px">
      <b>${p.name}</b><span class="th-dots"><i style="background:${p.c.accent}"></i><i style="background:${p.c.card}"></i><i style="background:${p.c.ok}"></i><i style="background:${p.c.danger}"></i><i style="background:${p.c.edit}"></i></span></button>`;
  }
  function range(path, label, min, max, step, unit, val){
    return `<div class="th-field"><span>${label}: <b data-rv="${path}">${val}${unit}</b></span><input type="range" data-range="${path}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  }

  function render(){
    const box = $('#tab-theme'); if(!box) return;
    if(myRole !== 'superadmin'){ box.innerHTML = '<div class="empty">Chỉ Admin tổng mới chỉnh được giao diện trang.</div>'; return; }
    const b = draft.bg, sh = draft.shape;
    const bw = sh.bw != null ? sh.bw : (parseFloat(cssVal('--bw')) || 2);
    const rad = sh.radius != null ? sh.radius : (parseFloat(cssVal('--r-m')) || 12);
    const shadowKey = sh.shadow || '';
    const gradDefault = toHex(cssVal('--card')) || '#ffffff';
    box.innerHTML = `<div class="th-wrap">
      <p class="th-note">Chỉ <b>Admin tổng</b> thấy trang này. Chỉnh tới đâu cả trang đổi ngay tới đó để bạn xem thử. Bấm <b>Lưu &amp; áp dụng</b> để mọi người mở web đều thấy giao diện mới; chưa lưu thì tải lại trang là về như cũ.</p>

      <div class="th-sec"><h4>Phong cách có sẵn</h4>
        <p class="th-sub">Bấm một phong cách để áp dụng nguyên bộ (màu, nền, viền, phông chữ). Sau đó vẫn chỉnh tiếp từng chi tiết ở các mục bên dưới.</p>
        <div class="th-presets">${PRESETS.map(presetBtn).join('')}</div></div>

      <div class="th-sec"><h4>Nền trang</h4>
        <div class="th-grid">
          <div class="th-field"><span>Kiểu nền</span><select data-bgmode>${Object.keys(BG_MODES).map(k=>`<option value="${k}"${b.mode===k?' selected':''}>${BG_MODES[k]}</option>`).join('')}</select></div>
          ${colorField('c','bg','Màu nền chính','--bg')}
          ${b.mode==='gradient' ? colorField('bg','color2','Màu nền thứ hai (chuyển màu)','--card','--card', gradDefault) : ''}
          ${b.mode==='gradient' ? range('bg.angle','Hướng chuyển màu',0,360,5,'°',b.angle) : ''}
          ${b.mode==='image' ? `<div class="th-field" style="grid-column:1/-1"><span>Link ảnh nền (bắt đầu bằng https://)</span><input type="url" data-bgimage placeholder="https://…/anh-nen.jpg" value="${escapeHtml(b.image||'')}"></div>` : ''}
        </div></div>

      <div class="th-sec"><h4>Màu chính</h4>
        <p class="th-sub">Các màu dùng chung cho cả trang. Màu “tự động” là màu mặc định; chỉnh xong có nút ↺ để quay về.</p>
        <div class="th-grid">${MAIN.filter(m=>m[0]!=='bg').map(m=>colorField('c', m[0], m[1], m[2])).join('')}</div></div>

      <div class="th-sec"><h4>Viền, bo góc, bóng</h4>
        <div class="th-grid">
          ${range('shape.bw','Độ dày viền',0,6,1,'px',bw)}
          ${range('shape.radius','Độ bo tròn góc',0,32,1,'px',rad)}
          <div class="th-field"><span>Đổ bóng</span><select data-shadow><option value="">Mặc định</option>${Object.keys(SHADOWS).map(k=>`<option value="${k}"${shadowKey===k?' selected':''}>${SHADOW_LABEL[k]}</option>`).join('')}</select></div>
        </div></div>

      <div class="th-sec"><h4>Phông chữ</h4>
        <p class="th-sub">Chọn từ các phông hỗ trợ tiếng Việt (tải từ Google Fonts khi dùng).</p>
        <div class="th-grid">${FONT_ROLES.map(r=>fontSelect(r[0], r[1])).join('')}</div>
        <div class="th-fontprev"><div class="h">Quản lý ACC — Tiêu đề mẫu</div><div>Chữ nội dung mẫu: Thử gõ tiếng Việt có dấu ắ ằ ẳ ẵ ặ, ơ ư, đ.</div><div class="m">12/205 · 50.000đ · 22/10/2026 14:30</div></div></div>

      <div class="th-sec"><h4>Màu riêng từng thành phần</h4>
        <p class="th-sub">Muốn một ô/viền/nút nào đó khác với màu chung thì chỉnh ở đây. Để “tự động” thì nó theo Màu chính ở trên.</p>
        <div class="th-grid">${COMPS.map(m=>colorField('comp', m[0], m[1], m[2], m[3])).join('')}</div></div>

      <div class="th-sec"><h4>Màn hình tải trang</h4>
        <p class="th-sub">Chữ hiện cùng vòng xoay lúc mở trang. Thiết bị đã có tài khoản thì chào tên, chưa có thì chào khách. Dùng <b>{name}</b> để chèn tên tài khoản. Để trống dòng nhắc nếu không muốn hiện.</p>
        <div class="th-grid">
          <div class="th-field"><span>Lời chào khi thiết bị đã có tài khoản</span><input type="text" data-load="greetUser" maxlength="200" value="${escapeHtml(draft.load.greetUser)}"></div>
          <div class="th-field"><span>Lời chào khách</span><input type="text" data-load="greetGuest" maxlength="200" value="${escapeHtml(draft.load.greetGuest)}"></div>
          <div class="th-field" style="grid-column:1/-1"><span>Dòng nhắc bên dưới</span><input type="text" data-load="note" maxlength="200" value="${escapeHtml(draft.load.note)}"></div>
        </div>
        <div style="margin-top:10px"><button type="button" class="ghost-btn" id="thPreviewLoad">▶ Xem thử màn hình tải</button></div></div>

      <div class="th-actions">
        <button type="button" class="primary" id="thSave">💾 Lưu &amp; áp dụng cho mọi người</button>
        <button type="button" id="thRevert">↩ Hoàn tác về bản đã lưu</button>
        <button type="button" id="thDefault">Đặt lại mặc định</button>
        <span class="th-state${dirty?' dirty':''}" id="thState">${dirty?'● Có thay đổi chưa lưu':'Đã lưu'}</span>
      </div>
    </div>`;
    bind(box);
  }

  function setDirty(on){
    dirty = on; const s = $('#thState'); if(!s) return;
    s.classList.toggle('dirty', on); s.textContent = on ? '● Có thay đổi chưa lưu' : 'Đã lưu';
  }
  let raf = 0;
  function liveApply(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(()=>{ applyDom(draft); }); }
  function setPath(path, val){
    const [g, k] = path.split('.'); draft[g][k] = val; draft.preset = 'custom'; setDirty(true); liveApply();
  }

  function bind(box){
    // Màu: kéo bảng màu thì đổi ngay; thả ra thì vẽ lại để hiện nút ↺
    box.querySelectorAll('input[type=color]').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        draft[inp.dataset.g][inp.dataset.k] = inp.value.toLowerCase();
        draft.preset = 'custom'; setDirty(true); liveApply();
        const hx = inp.parentElement.querySelector('.th-hex'); if(hx) hx.textContent = inp.value;
      });
      inp.addEventListener('change', ()=>{ const y = window.scrollY; render(); window.scrollTo(0, y); });
    });
    box.querySelectorAll('[data-rg]').forEach(b=> b.onclick = ()=>{
      delete draft[b.dataset.rg][b.dataset.rk]; draft.preset = 'custom'; setDirty(true);
      applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
    box.querySelectorAll('[data-range]').forEach(inp=> inp.addEventListener('input', ()=>{
      setPath(inp.dataset.range, Number(inp.value));
      const lb = box.querySelector('[data-rv="'+inp.dataset.range+'"]'); if(lb) lb.textContent = inp.value + (inp.dataset.range==='bg.angle' ? '°' : 'px');
    }));
    const bgm = box.querySelector('[data-bgmode]');
    if(bgm) bgm.onchange = ()=>{ draft.bg.mode = bgm.value; draft.preset = 'custom'; setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y); };
    const bgi = box.querySelector('[data-bgimage]');
    if(bgi) bgi.addEventListener('input', ()=>{ draft.bg.image = validUrl(bgi.value.trim()) ? bgi.value.trim() : ''; draft.preset = 'custom'; setDirty(true); liveApply(); });
    const shd = box.querySelector('[data-shadow]');
    if(shd) shd.onchange = ()=>{ if(shd.value) draft.shape.shadow = shd.value; else delete draft.shape.shadow; draft.preset = 'custom'; setDirty(true); applyDom(draft); };
    box.querySelectorAll('[data-font]').forEach(sel=> sel.onchange = ()=>{
      if(sel.value) draft.font[sel.dataset.font] = sel.value; else delete draft.font[sel.dataset.font];
      draft.preset = 'custom'; setDirty(true); applyDom(draft);
    });
    box.querySelectorAll('[data-load]').forEach(inp=> inp.addEventListener('input', ()=>{ draft.load[inp.dataset.load] = inp.value; setDirty(true); }));
    box.querySelectorAll('[data-preset]').forEach(btn=> btn.onclick = ()=>{
      const p = PRESETS.find(x=>x.id===btn.dataset.preset); if(!p) return;
      draft = p.c ? presetToTheme(p, draft.load) : Object.assign(blank(), { load: clone(draft.load) });
      setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
    $('#thSave', box).onclick = save;
    $('#thRevert', box).onclick = ()=>{ draft = clone(saved); applyDom(draft); setDirty(false); render(); showToast({ title:'Đã hoàn tác', message:'Quay về giao diện đã lưu.' }); };
    $('#thDefault', box).onclick = async ()=>{
      if(!await openConfirmModal({ title:'Đặt lại mặc định', message:'Đưa toàn bộ màu, nền, viền, phông chữ và chữ màn hình tải về mặc định? (Chỉ xem thử — bấm Lưu thì mới áp dụng cho mọi người.)', confirmLabel:'Đặt lại', danger:false })) return;
      draft = blank(); setDirty(true); applyDom(draft); render();
    };
    $('#thPreviewLoad', box).onclick = previewLoader;
  }

  async function save(){
    if(myRole !== 'superadmin') return;
    const t = normalize(draft);
    try{
      await db.collection(COL.accounts).doc(SITE_DOC).set({ theme:t, settings:true, savedBy:myName, savedAt:Date.now() });
      saved = t; draft = clone(t); persistLocal(t, applyDom(t));
      setDirty(false);
      showToast({ title:'Đã lưu giao diện', message:'Mọi người mở web sẽ thấy giao diện này (máy đang mở sẽ tự cập nhật).' });
    }catch(e){
      console.error('Lưu giao diện lỗi:', e);
      showToast({ title:'Không lưu được giao diện', message:'Lỗi kết nối hoặc quyền ghi Firestore. Hãy thử lại.', variant:'error' });
    }
  }

  function previewLoader(){
    const el = $('#loader'), tx = $('#loaderTxt'), sb = $('#loaderSub'); if(!el || el.classList.contains('on')) return;
    const name = myName || 'bạn';
    tx.textContent = (draft.load.greetUser || '').replace(/\{name\}/g, name);
    sb.textContent = draft.load.note || '';
    el.classList.add('on','page');
    let tm = null;
    const close = ()=>{ clearTimeout(tm); el.classList.remove('on','page'); el.removeEventListener('click', close); };
    el.addEventListener('click', close);
    tm = setTimeout(close, 4500);
  }

  window.SiteTheme = { render, normalize, buildCss };
  startListener();
})();
