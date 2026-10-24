// ===== TÙY CHỈNH TRANG (chỉ Admin tổng chỉnh) =====
// Admin tổng chỉnh nền, màu, kiểu phối màu có sẵn, phông chữ, viền/bo góc/bóng, màu riêng từng thành phần
// và chữ ở màn hình tải trang. Bấm "Lưu" thì lưu lên Firestore (tài liệu settings_site) và MỌI NGƯỜI mở web đều thấy.
// Trong lúc chỉnh, cả trang đổi màu ngay để xem thử (chưa lưu thì chỉ mình bạn thấy, tải lại là mất).
//
// Cách hoạt động: toàn bộ giao diện đã dùng các biến CSS (--bg, --ink, --line, --c-card-line...). File này chỉ sinh ra
// 1 thẻ <style id="themeStyle"> ghi đè các biến đó, nên không đụng tới code của các trang khác.
// Bản đã lưu cũng được nhớ trong localStorage ('acc_theme_v1') và áp dụng NGAY từ index.html trước khi vẽ trang (không nháy màu cũ).
// Việc LƯU + nén ảnh nằm riêng ở theme-save.js (ThemeSave). Màn hình tải / đăng nhập dùng đúng màu, nền của chủ đề (biến --page-bg).
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
  const BG_MODES = {solid:'Màu đặc', gradient:'Chuyển màu', dots:'Chấm bi', grid:'Lưới ô vuông', image:'Ảnh từ link (https://…)', upload:'Ảnh từ máy (cố định khi cuộn)'};

  const LOAD_DEF = { greetUser:'Chào {name}!', greetGuest:'Chào khách!', note:'Vui lòng đợi chút — tải trang có thể mất vài phút.' };

  // ---------- Các phong cách có sẵn ----------
  // Mỗi phong cách có 2 bản màu: c = bản Sáng, d = bản Tối. Cùng một gam màu, chỉ đổi độ đậm nhạt nên nhìn đều tông.
  const PRESETS = [
    {id:'default', name:'Mặc định', desc:'Xanh băng lạnh · theo nút sáng/tối'},
    {id:'slate', name:'Xám than', c:{bg:'#eceef1',card:'#ffffff',ink:'#14181f',sub:'#667085',line:'#dde1e8',lineSoft:'#e6e9ee',accent:'#1c222b',accentInk:'#ffffff',edit:'#475569',ok:'#2f7d5b',danger:'#b4443c',mark:'#dfe3ea'}, d:{bg:'#0b0d10',card:'#13171c',ink:'#e8ebf0',sub:'#8b94a3',line:'#222831',lineSoft:'#1a1f26',accent:'#e8ebf0',accentInk:'#0b0d10',edit:'#94a3b8',ok:'#52c08c',danger:'#f08278',mark:'#2a313c'}, bg:{mode:'gradient',color2:'#e2e6ed',color2d:'#10141a',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'inter',body:'inter',mono:'plexmono'}},
    {id:'ocean', name:'Biển sương', c:{bg:'#e8f0f6',card:'#fbfdff',ink:'#0c2233',sub:'#5b7488',line:'#d3e0ea',lineSoft:'#e0eaf1',accent:'#0f3550',accentInk:'#ffffff',edit:'#1d7fb5',ok:'#1f8a6b',danger:'#c24a45',mark:'#cfe6f5'}, d:{bg:'#07121b',card:'#0d1c29',ink:'#e3eef7',sub:'#7f9bb1',line:'#17303f',lineSoft:'#112533',accent:'#e3eef7',accentInk:'#07121b',edit:'#4fb0e6',ok:'#4fcf9f',danger:'#f27f78',mark:'#123b57'}, bg:{mode:'gradient',color2:'#dae8f2',color2d:'#0a1b28',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'lexend',body:'inter',mono:'plexmono'}},
    {id:'forest', name:'Rêu sương', c:{bg:'#eaf0ec',card:'#fcfefc',ink:'#14241c',sub:'#5f7467',line:'#d6e2da',lineSoft:'#e2ebe5',accent:'#1d3a2c',accentInk:'#ffffff',edit:'#2f8266',ok:'#2c8a5c',danger:'#bb4a3f',mark:'#d3e8dc'}, d:{bg:'#08110d',card:'#0e1b15',ink:'#e3f0e8',sub:'#82a190',line:'#1a3025',lineSoft:'#13241b',accent:'#e3f0e8',accentInk:'#08110d',edit:'#55c096',ok:'#55cf8f',danger:'#f0807a',mark:'#1a4331'}, bg:{mode:'gradient',color2:'#dde9e1',color2d:'#0b1c14',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'nunito',body:'inter',mono:'plexmono'}},
    {id:'twilight', name:'Tím khói', c:{bg:'#eeedf5',card:'#fcfcff',ink:'#1a1830',sub:'#6b6a86',line:'#dedcec',lineSoft:'#e8e7f2',accent:'#2a2650',accentInk:'#ffffff',edit:'#5b57b8',ok:'#2f8a74',danger:'#bb4a5a',mark:'#dddcf3'}, d:{bg:'#0b0a16',card:'#131226',ink:'#ebeaf8',sub:'#9291b3',line:'#25234a',lineSoft:'#1b1a37',accent:'#ebeaf8',accentInk:'#0b0a16',edit:'#9a96f0',ok:'#55cfa8',danger:'#f4808f',mark:'#2c2a5c'}, bg:{mode:'gradient',color2:'#e2e0f0',color2d:'#110f29',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'montserrat',body:'inter',mono:'plexmono'}},
    {id:'sand', name:'Cát kem', c:{bg:'#f1ede6',card:'#fffdf9',ink:'#231d14',sub:'#7a6f60',line:'#e4ddd0',lineSoft:'#ece6da',accent:'#2b2318',accentInk:'#ffffff',edit:'#a07a3c',ok:'#4d7c3a',danger:'#b5473a',mark:'#efe2c5'}, d:{bg:'#100d09',card:'#19150f',ink:'#f1e9d9',sub:'#a09580',line:'#2c2519',lineSoft:'#221c13',accent:'#f1e9d9',accentInk:'#100d09',edit:'#d4a95c',ok:'#8dc275',danger:'#ee8173',mark:'#4a3a1c'}, bg:{mode:'gradient',color2:'#e8e1d3',color2d:'#18130c',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'playfair',body:'inter',mono:'plexmono'}},
    {id:'rose', name:'Hồng khói', c:{bg:'#f3ecee',card:'#fffdfd',ink:'#2a1a20',sub:'#82666f',line:'#e8dadf',lineSoft:'#f0e4e8',accent:'#3a1f2a',accentInk:'#ffffff',edit:'#b0566f',ok:'#3f8a68',danger:'#b8443e',mark:'#f2d9e0'}, d:{bg:'#120a0d',card:'#1c1116',ink:'#f5e8ed',sub:'#ab8c97',line:'#331c26',lineSoft:'#27151d',accent:'#f5e8ed',accentInk:'#120a0d',edit:'#e58aa5',ok:'#5fcf9f',danger:'#f4857d',mark:'#4f2434'}, bg:{mode:'gradient',color2:'#ebdce1',color2d:'#1b0f15',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'bevn',body:'inter',mono:'plexmono'}},
    {id:'mono', name:'Trắng đen', c:{bg:'#f4f4f5',card:'#ffffff',ink:'#0a0a0b',sub:'#6b6b73',line:'#e2e2e5',lineSoft:'#ebebed',accent:'#0a0a0b',accentInk:'#ffffff',edit:'#3f3f46',ok:'#2f7d5b',danger:'#b4443c',mark:'#e4e4e7'}, d:{bg:'#09090a',card:'#121214',ink:'#f4f4f5',sub:'#8e8e96',line:'#232326',lineSoft:'#1a1a1d',accent:'#f4f4f5',accentInk:'#09090a',edit:'#a1a1aa',ok:'#52c08c',danger:'#f08278',mark:'#2c2c30'}, bg:{mode:'gradient',color2:'#ececee',color2d:'#0f0f11',angle:165}, shape:{bw:1,radius:14,shadow:'soft'}, font:{head:'inter',body:'inter',mono:'plexmono'}},
  ];

  // ---------- Dữ liệu giao diện ----------
  function blank(){ return { preset:'default', logo:'', c:{}, cd:{}, comp:{}, compd:{}, bg:{mode:'solid', color2:'', color2d:'', angle:160, image:'', file:'', dim:30}, shape:{}, font:{}, load:Object.assign({}, LOAD_DEF) }; }
  const validUrl = u => typeof u === 'string' && /^https?:\/\/[^\s"'()\\]+$/i.test(u);
  // Ảnh tải từ máy được nén thành data:image (jpeg/png/webp) — chỉ nhận đúng định dạng này và giới hạn dung lượng.
  const validFile = u => typeof u === 'string' && u.length <= 700000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u);
  // Logo: ảnh vuông nhỏ (đã nén ở theme-save.js), hiện trong khung tròn.
  const validLogo = u => typeof u === 'string' && u.length <= 200000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u);
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  // Luôn lọc lại dữ liệu đọc từ Firestore: chỉ nhận màu #rrggbb, số trong khoảng, phông trong danh sách, link https / ảnh data:image hợp lệ — không cho chèn CSS lạ.
  function normalize(raw){
    const t = blank(); if(!raw || typeof raw !== 'object') return t;
    if(typeof raw.preset === 'string') t.preset = raw.preset.slice(0, 20);
    MAIN.forEach(m=>{
      if(raw.c && isHex(raw.c[m[0]])) t.c[m[0]] = raw.c[m[0]].toLowerCase();
      if(raw.cd && isHex(raw.cd[m[0]])) t.cd[m[0]] = raw.cd[m[0]].toLowerCase();
    });
    COMPS.forEach(m=>{
      if(raw.comp && isHex(raw.comp[m[0]])) t.comp[m[0]] = raw.comp[m[0]].toLowerCase();
      if(raw.compd && isHex(raw.compd[m[0]])) t.compd[m[0]] = raw.compd[m[0]].toLowerCase();
    });
    const b = raw.bg || {};
    if(BG_MODES[b.mode]) t.bg.mode = b.mode;
    if(isHex(b.color2)) t.bg.color2 = b.color2.toLowerCase();
    if(isHex(b.color2d)) t.bg.color2d = b.color2d.toLowerCase();
    if(b.angle != null) t.bg.angle = clamp(b.angle, 0, 360);
    if(b.dim != null) t.bg.dim = clamp(b.dim, 0, 90);
    if(validUrl(b.image)) t.bg.image = b.image;
    if(validFile(b.file)) t.bg.file = b.file;
    const sh = raw.shape || {};
    if(sh.bw != null) t.shape.bw = clamp(sh.bw, 0, 8);
    if(sh.radius != null) t.shape.radius = clamp(sh.radius, 0, 32);
    if(SHADOWS[sh.shadow]) t.shape.shadow = sh.shadow;
    FONT_ROLES.forEach(r=>{ if(raw.font && FONT_BY[raw.font[r[0]]]) t.font[r[0]] = raw.font[r[0]]; });
    const l = raw.load || {};
    ['greetUser','greetGuest','note'].forEach(k=>{ if(typeof l[k] === 'string') t.load[k] = l[k].slice(0, 200); });
    if(validLogo(raw.logo)) t.logo = raw.logo;
    return t;
  }
  function presetToTheme(p, keepLoad, keepLogo){
    const t = blank();
    if(p.c) Object.assign(t.c, p.c);
    if(p.d) Object.assign(t.cd, p.d);
    if(p.comp) Object.assign(t.comp, p.comp);
    if(p.compd) Object.assign(t.compd, p.compd);
    if(p.bg) Object.assign(t.bg, p.bg);
    if(p.shape) Object.assign(t.shape, p.shape);
    if(p.font) Object.assign(t.font, p.font);
    t.preset = p.id;
    if(keepLoad) t.load = clone(keepLoad);
    if(keepLogo) t.logo = keepLogo;
    return normalize(t);
  }

  // ---------- Sinh CSS ----------
  function fontUrl(f){ return 'https://fonts.googleapis.com/css2?family='+f.gf+'&display=swap'; }
  function modeVars(c, comp, bg2){
    const v = [];
    MAIN.forEach(m=>{ if(c[m[0]]) v.push(m[2]+':'+c[m[0]]); });
    COMPS.forEach(m=>{ if(comp[m[0]]) v.push(m[2]+':'+comp[m[0]]); });
    if(isHex(bg2)) v.push('--bg2:'+bg2);
    return v;
  }
  function buildCss(t){
    const shared = [], fonts = [];
    const sh = t.shape;
    if(sh.bw != null) shared.push('--bw:'+sh.bw+'px');
    if(sh.radius != null){ shared.push('--r-m:'+sh.radius+'px', '--r-s:'+Math.round(sh.radius*.65)+'px', '--r-l:'+Math.round(sh.radius*1.5)+'px'); }
    if(sh.shadow){ shared.push('--shadow-1:'+SHADOWS[sh.shadow][0], '--shadow-2:'+SHADOWS[sh.shadow][1]); }
    FONT_ROLES.forEach(r=>{
      const f = FONT_BY[t.font[r[0]]]; if(!f) return;
      shared.push(r[2]+':'+f.stack);
      if(f.gf){ const u = fontUrl(f); if(fonts.indexOf(u) < 0) fonts.push(u); }
    });
    const L = modeVars(t.c, t.comp, t.bg.color2), D = modeVars(t.cd, t.compd, t.bg.color2d);
    let css = '';
    if(shared.length) css += 'html:root[data-theme-custom]{'+shared.join(';')+'}';
    // Bản Sáng áp khi KHÔNG ở chế độ tối; bản Tối áp khi bấm nút tối. Chủ đề cũ chưa có bản Tối thì chế độ tối dùng màu tối mặc định.
    if(L.length) css += 'html:root[data-theme-custom]:not([data-theme="dark"]){'+L.join(';')+'}';
    if(D.length) css += 'html:root[data-theme-custom][data-theme="dark"]{'+D.join(';')+'}';
    const b = t.bg; let body = '', pageBg = 'var(--bg)';
    // --page-bg: cùng một nền cho trang, màn hình tải và màn hình đăng nhập (đăng nhập/tải không còn nền riêng cố định).
    if(b.mode === 'gradient') pageBg = 'linear-gradient('+clamp(b.angle,0,360)+'deg,var(--bg),var(--bg2,var(--card)))';
    else if(b.mode === 'dots') pageBg = 'radial-gradient(color-mix(in srgb,var(--ink) 22%,transparent) 1.3px,transparent 1.6px) 0 0/20px 20px,var(--bg)';
    else if(b.mode === 'grid') pageBg = 'linear-gradient(color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px) 0 0/28px 28px,var(--bg)';
    if(b.mode === 'gradient') body = 'background:linear-gradient('+clamp(b.angle,0,360)+'deg,var(--bg),var(--bg2,var(--card))) fixed;';
    else if(b.mode === 'dots') body = 'background-color:var(--bg);background-image:radial-gradient(color-mix(in srgb,var(--ink) 22%,transparent) 1.3px,transparent 1.6px);background-size:20px 20px;';
    else if(b.mode === 'grid') body = 'background-color:var(--bg);background-image:linear-gradient(color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--ink) 10%,transparent) 1px,transparent 1px);background-size:28px 28px;';
    const pic = b.mode === 'upload' ? (validFile(b.file) ? b.file : '') : (b.mode === 'image' && validUrl(b.image) ? b.image : '');
    if(pic){
      // Ảnh nền cố định: vẽ bằng lớp phủ position:fixed nên đứng yên khi cuộn, kể cả trên điện thoại (iOS không hỗ trợ background-attachment:fixed).
      const dim = clamp(b.dim, 0, 90), veil = 'color-mix(in srgb,var(--bg) '+dim+'%,transparent)';
      body = 'background:var(--bg);';
      pageBg = 'linear-gradient('+veil+','+veil+'),url("'+pic+'") center/cover no-repeat,var(--bg)';
      css += 'html[data-theme-custom] body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient('+veil+','+veil+'),url("'+pic+'") center/cover no-repeat;}';
    }
    if(body) css += 'html[data-theme-custom] body{'+body+'}';
    // Logo: khung tròn, ảnh phủ đầy, không chữ, không nền. Ở màn hình tải chỉ hiện khi đã có logo.
    if(validLogo(t.logo)) css += 'html[data-theme-custom] .brand-logo{background-image:url("'+t.logo+'")}html[data-theme-custom] #loaderLogo{display:block}';
    if(css) css = 'html[data-theme-custom]{--page-bg:'+pageBg+'}' + css;
    return { css, fonts };
  }
  function setFavicon(u){
    let l = document.querySelector('link[data-logo-icon]');
    if(!validLogo(u)){ if(l) l.remove(); return; }
    if(!l){ l = document.createElement('link'); l.rel = 'icon'; l.setAttribute('data-logo-icon','1'); document.head.appendChild(l); }
    if(l.getAttribute('href') !== u) l.setAttribute('href', u);
  }
  function applyDom(t){
    const r = buildCss(t);
    setFavicon(t.logo);
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
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ css:r.css, fonts:r.fonts, load:t.load, logo:validLogo(t.logo) ? t.logo : '' })); }catch(e){}
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
      if(window.ThemeSave) ThemeSave.baseline(saved);
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
    // Đang ở chế độ tối thì ghi vào bản màu Tối (cd / compd / color2d), ngược lại ghi vào bản Sáng.
    const dk = isDark();
    const g = dk ? (group==='c' ? 'cd' : group==='comp' ? 'compd' : group) : group;
    const k = (dk && group==='bg') ? key+'d' : key;
    const own = draft[g][k];
    const val = own || dflt || toHex(cssVal(cssVar)) || toHex(cssVal(baseVar||'--bg')) || '#000000';
    return `<div class="th-field"><span>${label}</span><div class="th-row">
      <input type="color" data-g="${g}" data-k="${k}" value="${val}">
      <span class="th-hex">${val}</span>
      ${own ? `<button type="button" class="th-reset" data-rg="${g}" data-rk="${k}" title="Bỏ màu đã chỉnh, dùng màu mặc định">↺ Tự động</button>` : '<span class="th-auto">tự động</span>'}
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
    const chip = 'background:rgba(255,255,255,.9);color:#222;padding:1px 7px;border-radius:6px;align-self:flex-start';
    if(!p.c) return `<button type="button" class="th-preset${on}" data-preset="${p.id}" style="background:linear-gradient(90deg,#ebf2f5 50%,#060e13 50%);color:#888;border:1px solid #8aa"><b style="${chip}">${p.name}</b><span style="${chip};font-size:11px">${p.desc}</span></button>`;
    const d = p.d || p.c, r = (p.shape && p.shape.radius != null) ? p.shape.radius : 14;
    return `<button type="button" class="th-preset${on}" data-preset="${p.id}" style="background:linear-gradient(100deg,${p.c.bg} 50%,${d.bg} 50%);border:1px solid rgba(128,138,150,.4);border-radius:${r}px">
      <b style="${chip}">${p.name}</b><span class="th-dots"><i style="background:${p.c.accent}"></i><i style="background:${p.c.edit}"></i><i style="background:${d.card}"></i><i style="background:${d.edit}"></i></span></button>`;
  }
  function range(path, label, min, max, step, unit, val){
    return `<div class="th-field"><span>${label}: <b data-rv="${path}">${val}${unit}</b></span><input type="range" data-range="${path}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  }

  // ---------- Xem thử trực tiếp (2 phiên bản: tải trang + đăng nhập, và trong trang) ----------
  // Các khung xem thử dùng đúng class + biến CSS của trang thật nên đổi màu tới đâu, khung đổi ngay tới đó (không cần vẽ lại).
  let pvOpen = window.innerHeight >= 720, pvTab = 'load';
  const PV_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23808890' fill-opacity='.28'/%3E%3Ccircle cx='50' cy='40' r='16' fill='%23808890' fill-opacity='.5'/%3E%3Crect x='24' y='62' width='52' height='38' rx='18' fill='%23808890' fill-opacity='.5'/%3E%3C/svg%3E";
  const PV_TABS = [['load','Tải trang & đăng nhập'], ['app','Trong trang'], ['both','Cả hai']];
  const logoEl = cls => '<span class="brand-logo '+(cls||'')+'" role="img" aria-label="Logo"></span>';
  function pvLoader(){
    const nm = myName || 'bạn';
    return `<div class="pv-screen pv-loader"><span class="pv-tag">Tải trang</span>${draft.logo ? logoEl('xl') : ''}
      <div class="spin">${Array.from({length:12}, (_,i)=>'<i style="--n:'+i+'"></i>').join('')}</div>
      <div class="pv-ltxt" data-pvgreet>${escapeHtml((draft.load.greetUser||'').replace(/\{name\}/g, nm))}</div>
      <div class="pv-lsub" data-pvnote>${escapeHtml(draft.load.note||'')}</div></div>`;
  }
  function pvLogin(){
    return `<div class="pv-screen pv-auth"><span class="pv-tag">Đăng nhập</span><div class="box">
      <div class="auth-hero">${logoEl('lg')}<h2>XIN CHÀO!</h2><p>Nhập tên của bạn để vào xem kho acc ngay, không cần chờ duyệt.</p></div>
      <div class="auth-form"><h1>Đăng nhập</h1><p class="authsub">Quản trị viên nhập thêm mật khẩu để mở khoá toàn quyền</p>
        <label class="field"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg><input placeholder="Tên đăng nhập của bạn" readonly tabindex="-1"></label>
        <label class="field"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input placeholder="Mật khẩu (nếu là quản trị viên)" type="password" readonly tabindex="-1"></label>
        <button type="button" tabindex="-1">Vào trang</button></div></div></div>`;
  }
  function pvCard(code, price, desc){
    return `<div class="card"><img src="${PV_IMG}" alt=""><div class="info"><span class="code">${code}</span><div class="price">${price}</div><div class="desc">${desc}</div></div>
      <div class="actions"><button type="button" class="edit" tabindex="-1">Sửa</button><button type="button" class="del" tabindex="-1">Xóa</button></div></div>`;
  }
  function pvApp(){
    return `<div class="pv-screen pv-app"><span class="pv-tag">Trong trang</span>
      <header>${logoEl()}<h2>Quản lý ACC</h2><span class="who">${escapeHtml(myName || 'bạn')}</span><button type="button" class="ghost-btn" tabindex="-1">Thoát</button></header>
      <nav><button type="button" class="active" tabindex="-1">Trang chủ</button><button type="button" tabindex="-1">Acc đã thêm</button><button type="button" tabindex="-1">Lịch sử</button></nav>
      <div class="pv-main"><div class="searchbar"><input placeholder="Tìm theo mã x/x (vd 12/205) hoặc mô tả..." readonly tabindex="-1"></div>
        <div class="grid" style="margin-top:12px">${pvCard('12/205','50.000đ','Mô tả mẫu cho acc thứ nhất')}${pvCard('88/431','120.000đ','Mô tả mẫu cho acc thứ hai')}</div></div>
      <div class="toast"><div class="toast-title">Đã lưu</div><div class="toast-msg">Thông báo mẫu</div></div>
      <button type="button" class="fab" tabindex="-1">+</button></div>`;
  }
  function pvBody(){
    return (pvTab === 'app' ? '' : pvLoader() + pvLogin()) + (pvTab === 'load' ? '' : pvApp());
  }
  function pvDock(){
    return `<div class="th-pv${pvOpen ? '' : ' min'}" id="thPv">
      <div class="th-pv-h"><b>👁 Xem thử trực tiếp</b>
        <div class="th-pv-tabs">${PV_TABS.map(t=>`<button type="button" data-pvtab="${t[0]}"${pvTab===t[0] ? ' class="on"' : ''}>${t[1]}</button>`).join('')}</div>
        <button type="button" class="th-pv-toggle" id="thPvToggle">${pvOpen ? 'Thu gọn ▾' : 'Mở ra ▴'}</button></div>
      <div class="th-pv-body" id="thPvBody">${pvBody()}</div></div>`;
  }
  function pvOffset(){   // khung xem thử nằm ngay trên thanh Lưu (thanh Lưu cao bao nhiêu thì đẩy lên bấy nhiêu)
    const a = $('.th-actions'), p = $('#thPv');
    if(a && p) p.style.setProperty('--thab', (a.offsetHeight + 8) + 'px');
  }
  window.addEventListener('resize', ()=>{ if(tabVisible()) pvOffset(); });

  function render(){
    const box = $('#tab-theme'); if(!box) return;
    if(myRole !== 'superadmin'){ box.innerHTML = '<div class="empty">Chỉ Admin tổng mới chỉnh được giao diện trang.</div>'; return; }
    const b = draft.bg, sh = draft.shape;
    const bw = sh.bw != null ? sh.bw : (parseFloat(cssVal('--bw')) || 2);
    const rad = sh.radius != null ? sh.radius : (parseFloat(cssVal('--r-m')) || 12);
    const shadowKey = sh.shadow || '';
    const gradDefault = toHex(cssVal('--card')) || '#ffffff';
    box.innerHTML = `<div class="th-wrap">
      <p class="th-note">Đang chỉnh bản màu <b>${isDark()?'🌙 Tối':'☀️ Sáng'}</b> — bấm nút sáng/tối trên thanh đầu để chỉnh bản còn lại. Mỗi phong cách có sẵn đều có đủ 2 bản.</p>
      <p class="th-note">Chỉ <b>Admin tổng</b> thấy trang này. Chỉnh tới đâu cả trang đổi ngay tới đó để bạn xem thử. Bấm <b>Lưu &amp; áp dụng</b> để mọi người mở web đều thấy giao diện mới; chưa lưu thì tải lại trang là về như cũ.</p>

      <div class="th-sec"><h4>Phong cách có sẵn</h4>
        <p class="th-sub">Bấm một phong cách để áp dụng nguyên bộ (màu, nền, viền, phông chữ). Sau đó vẫn chỉnh tiếp từng chi tiết ở các mục bên dưới.</p>
        <div class="th-presets">${PRESETS.map(presetBtn).join('')}</div></div>

      <div class="th-sec"><h4>Logo trang</h4>
        <p class="th-sub">Khung tròn, không chữ, không nền. Chọn ảnh ngay từ máy (tự cắt vuông ở giữa và nén nhẹ). Logo hiện ở màn hình tải, màn hình đăng nhập, thanh tiêu đề và làm biểu tượng tab trình duyệt. Chưa chọn ảnh thì chỉ có khung tròn trống.</p>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="brand-logo xl" role="img" aria-label="Logo hiện tại"></span>
          <label class="ghost-btn th-file">${draft.logo ? 'Đổi logo từ máy…' : 'Chọn logo từ máy…'}<input type="file" accept="image/*" data-logofile hidden></label>
          ${draft.logo ? '<button type="button" class="th-reset" data-logoclear>✕ Bỏ logo</button>' : ''}
        </div></div>

      <div class="th-sec"><h4>Nền trang</h4>
        <div class="th-grid">
          <div class="th-field"><span>Kiểu nền</span><select data-bgmode>${Object.keys(BG_MODES).map(k=>`<option value="${k}"${b.mode===k?' selected':''}>${BG_MODES[k]}</option>`).join('')}</select></div>
          ${colorField('c','bg','Màu nền chính','--bg')}
          ${b.mode==='gradient' ? colorField('bg','color2','Màu nền thứ hai (chuyển màu)','--card','--card', gradDefault) : ''}
          ${b.mode==='gradient' ? range('bg.angle','Hướng chuyển màu',0,360,5,'°',b.angle) : ''}
          ${b.mode==='image' ? `<div class="th-field" style="grid-column:1/-1"><span>Link ảnh nền (bắt đầu bằng https://)</span><input type="url" data-bgimage placeholder="https://…/anh-nen.jpg" value="${escapeHtml(b.image||'')}"></div>` : ''}
          ${b.mode==='upload' ? `<div class="th-field" style="grid-column:1/-1"><span>Ảnh nền từ máy của bạn (ảnh đứng yên khi cuộn trang)</span>
            <div class="th-row"><label class="ghost-btn th-file">Chọn ảnh từ máy…<input type="file" accept="image/*" data-bgfile hidden></label>
            ${b.file ? '<button type="button" class="th-reset" data-bgfileclear>✕ Bỏ ảnh</button>' : ''}
            <span class="th-hex">Tự nén còn nhẹ để lưu lên mạng</span></div>
            ${b.file ? `<img class="th-thumb" alt="Ảnh nền đã chọn" src="${b.file}">` : ''}</div>` : ''}
          ${(b.mode==='upload' || b.mode==='image') ? range('bg.dim','Độ phủ màu nền lên ảnh (cao hơn = chữ dễ đọc hơn)',0,90,5,'%',b.dim) : ''}
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

      ${pvDock()}

      <div class="th-actions">
        <button type="button" class="primary" id="thSave">💾 Lưu &amp; áp dụng cho mọi người</button>
        <button type="button" id="thRevert">↩ Hoàn tác về bản đã lưu</button>
        <button type="button" id="thDefault">Đặt lại mặc định</button>
        <span class="th-state${dirty?' dirty':''}" id="thState">${dirty?'● Có thay đổi chưa lưu':'Đã lưu'}</span>
      </div>
    </div>`;
    bind(box);
    pvOffset();
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
      const lb = box.querySelector('[data-rv="'+inp.dataset.range+'"]'); if(lb) lb.textContent = inp.value + (inp.dataset.range==='bg.angle' ? '°' : inp.dataset.range==='bg.dim' ? '%' : 'px');
    }));
    const bgm = box.querySelector('[data-bgmode]');
    if(bgm) bgm.onchange = ()=>{ draft.bg.mode = bgm.value; draft.preset = 'custom'; setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y); };
    const bgi = box.querySelector('[data-bgimage]');
    if(bgi) bgi.addEventListener('input', ()=>{ draft.bg.image = validUrl(bgi.value.trim()) ? bgi.value.trim() : ''; draft.preset = 'custom'; setDirty(true); liveApply(); });
    const bgf = box.querySelector('[data-bgfile]');
    if(bgf) bgf.onchange = async ()=>{
      const f = bgf.files && bgf.files[0]; if(!f) return;
      try{
        draft.bg.file = await ThemeSave.compress(f, { max:1920, quality:.8, limit:520000 }); draft.bg.mode = 'upload'; draft.preset = 'custom';
        setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y);
      }catch(e){ showToast({ title:'Không dùng được ảnh này', message:'Hãy thử ảnh JPG hoặc PNG khác.', variant:'error' }); }
    };
    const bgc = box.querySelector('[data-bgfileclear]');
    if(bgc) bgc.onclick = ()=>{ draft.bg.file = ''; draft.preset = 'custom'; setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y); };
    const shd = box.querySelector('[data-shadow]');
    if(shd) shd.onchange = ()=>{ if(shd.value) draft.shape.shadow = shd.value; else delete draft.shape.shadow; draft.preset = 'custom'; setDirty(true); applyDom(draft); };
    box.querySelectorAll('[data-font]').forEach(sel=> sel.onchange = ()=>{
      if(sel.value) draft.font[sel.dataset.font] = sel.value; else delete draft.font[sel.dataset.font];
      draft.preset = 'custom'; setDirty(true); applyDom(draft);
    });
    box.querySelectorAll('[data-load]').forEach(inp=> inp.addEventListener('input', ()=>{
      draft.load[inp.dataset.load] = inp.value; setDirty(true);
      const g = $('[data-pvgreet]', box), n = $('[data-pvnote]', box);
      if(g) g.textContent = (draft.load.greetUser || '').replace(/\{name\}/g, myName || 'bạn');
      if(n) n.textContent = draft.load.note || '';
    }));
    const lgf = box.querySelector('[data-logofile]');
    if(lgf) lgf.onchange = async ()=>{
      const f = lgf.files && lgf.files[0]; if(!f) return;
      try{
        draft.logo = await ThemeSave.compress(f, { max:256, square:true, type:'image/webp', quality:.92, minQ:.6, limit:90000 });
        setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y);
      }catch(e){ showToast({ title:'Không dùng được ảnh này', message:'Hãy thử ảnh JPG hoặc PNG khác.', variant:'error' }); }
    };
    const lgc = box.querySelector('[data-logoclear]');
    if(lgc) lgc.onclick = ()=>{ draft.logo = ''; setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y); };
    box.querySelectorAll('[data-pvtab]').forEach(b=> b.onclick = ()=>{
      pvTab = b.dataset.pvtab; pvOpen = true;
      const dock = $('#thPv', box); dock.classList.remove('min');
      box.querySelectorAll('[data-pvtab]').forEach(x=> x.classList.toggle('on', x === b));
      $('#thPvToggle', box).textContent = 'Thu gọn ▾';
      $('#thPvBody', box).innerHTML = pvBody();
    });
    $('#thPvToggle', box).onclick = ()=>{
      pvOpen = !pvOpen; $('#thPv', box).classList.toggle('min', !pvOpen);
      $('#thPvToggle', box).textContent = pvOpen ? 'Thu gọn ▾' : 'Mở ra ▴';
    };
    box.querySelectorAll('[data-preset]').forEach(btn=> btn.onclick = ()=>{
      const p = PRESETS.find(x=>x.id===btn.dataset.preset); if(!p) return;
      draft = p.c ? presetToTheme(p, draft.load, draft.logo) : Object.assign(blank(), { load: clone(draft.load), logo: draft.logo });
      setDirty(true); applyDom(draft); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
    $('#thSave', box).onclick = save;
    $('#thRevert', box).onclick = ()=>{ draft = clone(saved); applyDom(draft); setDirty(false); render(); showToast({ title:'Đã hoàn tác', message:'Quay về giao diện đã lưu.' }); };
    $('#thDefault', box).onclick = async ()=>{
      if(!await openConfirmModal({ title:'Đặt lại mặc định', message:'Đưa toàn bộ màu, nền, viền, phông chữ, logo và chữ màn hình tải về mặc định? (Chỉ xem thử — bấm Lưu thì mới áp dụng cho mọi người.)', confirmLabel:'Đặt lại', danger:false })) return;
      draft = blank(); setDirty(true); applyDom(draft); render();
    };
    $('#thPreviewLoad', box).onclick = previewLoader;
  }

  // Lưu nhanh: áp dụng + nhớ trên máy ngay, ghi Firestore ở nền (chi tiết ở theme-save.js).
  function setState(kind){
    const s = $('#thState'); if(!s) return;
    if(kind === 'err') dirty = true;                     // chưa lên mạng: giữ bản đang chỉnh, đừng để bản cũ từ máy chủ đè lên
    s.classList.toggle('dirty', kind === 'err');
    s.textContent = kind === 'sync' ? '⏳ Đang đồng bộ…' : kind === 'err' ? '⚠ Chưa lên mạng — bấm Lưu để thử lại' : '✓ Đã lưu';
  }
  function save(){
    if(myRole !== 'superadmin') return;
    const t = normalize(draft);
    ThemeSave.save(t, {
      db, col: COL.accounts, doc: SITE_DOC, who: myName,
      local(){ saved = t; draft = clone(t); persistLocal(t, applyDom(t)); dirty = false; },
      state: setState
    });
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

  // Bấm nút sáng/tối khi đang ở trang "Tùy chỉnh trang" thì vẽ lại để ô màu hiện đúng bản Sáng / Tối.
  new MutationObserver(()=>{ if(tabVisible()) { const y = window.scrollY; render(); window.scrollTo(0, y); } })
    .observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

  window.SiteTheme = { render, normalize, buildCss, save };
  startListener();
})();
