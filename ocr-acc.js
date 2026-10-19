// ===== TỰ NHẬN DIỆN MÃ ACC TỪ ẢNH (OCR) — bản 2: "học vùng" + đọc số chuyên biệt =====
// Mã acc = tướng/trang phục (vd 126/468). Số này xuất hiện ở 2 nơi trong ảnh mẫu "Thông tin kiện tướng":
//   Vùng A: ô tròn góc phải-dưới của ảnh nền:   "126  468 / Tướng  Tr.phục"
//   Vùng B: khung bên trái, dưới tên người chơi: "TƯỚNG 126" và "SKIN 468"
// Cách làm (nhanh -> chậm):
//   1) ĐỌC THẲNG 2 VÙNG ĐÃ HỌC (toạ độ theo % kích thước ảnh, nên ảnh to/nhỏ đều dùng được): cắt đúng chỗ,
//      nhị phân hoá (chữ sáng -> đen trên nền trắng), phóng to, chỉ đọc chữ số (Tesseract 'eng' + whitelist 0-9),
//      thử nhiều ngưỡng sáng + lệch vài pixel rồi BỎ PHIẾU. ~1-3 giây.
//   2) Đối chiếu 2 vùng: khớp nhau => chắc chắn. Lệch nhau => báo "nhiều kết quả" để bạn chọn.
//   3) Nếu 2 vùng không có (ảnh khác bố cục/đã bị cắt): TỰ TÌM bằng chữ nhãn "Tướng/Tr.phục/SKIN" trên từng mảng ảnh,
//      định vị số nằm cạnh nhãn rồi cắt riêng số đó đọc lại bằng chế độ chỉ-chữ-số để ra kết quả chính xác.
//
// AccOCR.detect(blob) trả về (giữ nguyên định dạng cũ, thêm via/note):
//   {status:'ok',        code:'126/468', heroes:126, skins:468, via:'A+B', note:'...'}
//   {status:'ambiguous', candidates:['126/468','120/468']}
//   {status:'none',      hint:'...'}
(function(){
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CFG = {
    tesseractUrl: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    digitLang: 'eng',            // đọc chữ số
    labelLang: 'vie',            // đọc chữ nhãn (chỉ dùng ở bước tự tìm)
    workerOpts: {},              // (dùng khi test) ví dụ {langPath:'...', gzip:true}
    heroRange: [1, 400],         // số tướng hợp lệ
    skinRange: [0, 5000],        // số trang phục hợp lệ
    maxCombos: 6,
    targetH: 100,                // cỡ phóng mặc định
    scales: [100, 60],           // các cỡ phóng dùng khi đọc 1 số (bỏ phiếu)
    minVotes: 2, minShare: 0.6,  // một số được chấp nhận khi >=2 phiếu và >=60% số lần đọc
    learnKey: 'accocr.learned.v1', learnMax: 12, arTol: 0.04,   // vùng đã học lưu trong trình duyệt (localStorage)
    learnMaxMs: 45000,           // học (quét toàn ảnh) tối đa ngần này ms
    maxSearchMs: 15000,          // bước tự tìm chạy tối đa ngần này ms rồi dừng
    debug: false,

    // ---- VÙNG ĐÃ HỌC (tỉ lệ x0,y0,x1,y1 theo ảnh gốc; đo từ ảnh mẫu 2250x2560) ----
    zones: [
      { id:'A', kind:'row',  name:'ô tròn góc phải',      box:[0.6733, 0.3887, 0.7711, 0.4102], thr:[160, 185, 'otsu'],
        layout:'row', hnum:[0.6822, 0.3906, 0.7164, 0.4102], snum:[0.7253, 0.3906, 0.7609, 0.4102] },   // nhãn nằm DƯỚI số
      { id:'B', kind:'pair', name:'khung trái TƯỚNG/SKIN',
        hero:[0.0178, 0.4930, 0.0511, 0.5125], skin:[0.0178, 0.5188, 0.0511, 0.5359], thr:[200, 225, 'otsu'],
        layout:'col' },   // nhãn nằm TRÊN số
    ],
    // lệch nhẹ (tỉ lệ theo ảnh) để chịu được ảnh cắt hơi khác vài pixel
    jitter: [[0,0],[0.003,0.002],[-0.003,-0.002],[0.003,-0.002],[-0.003,0.002]],

    // ---- Các mảng ảnh quét khi phải tự tìm (ưu tiên chỗ hay có số nhất) ----
    tiles: [
      [0.40, 0.25, 1.00, 0.50],
      [0.00, 0.42, 0.45, 0.65],
      [0.00, 0.00, 0.55, 0.50],
      [0.45, 0.00, 1.00, 0.55],
      [0.00, 0.45, 0.55, 1.00],
      [0.45, 0.45, 1.00, 1.00],
    ],
  };
  const log = (...a)=>{ if(CFG.debug) console.log('[AccOCR]', ...a); };

  // ---------- Tải thư viện + worker (mỗi loại 1 lần) ----------
  let libPromise = null, queue = Promise.resolve();
  const workers = {}, lastPsm = {};
  function loadLib(){
    if(root.Tesseract) return Promise.resolve();
    if(libPromise) return libPromise;
    libPromise = new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = CFG.tesseractUrl; s.async = true;
      s.onload = res; s.onerror = ()=>{ libPromise = null; rej(new Error('Không tải được thư viện nhận diện (Tesseract). Kiểm tra mạng.')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }
  function getWorker(kind){
    if(workers[kind]) return workers[kind];
    workers[kind] = loadLib().then(async ()=>{
      const w = await root.Tesseract.createWorker(kind === 'digit' ? CFG.digitLang : CFG.labelLang, 1, CFG.workerOpts || {});
      if(kind === 'digit') await w.setParameters({ tessedit_char_whitelist:'0123456789 ', preserve_interword_spaces:'1' });
      else await w.setParameters({ preserve_interword_spaces:'1' });
      return w;
    }).catch(err=>{ workers[kind] = null; throw err; });
    return workers[kind];
  }
  function warmup(){ getWorker('digit').catch(()=>{}); }   // gọi sớm cho lần đầu đỡ chờ
  const toInput = c => (typeof c.toBuffer === 'function') ? c.toBuffer('image/png') : c;
  async function setPsm(kind, w, psm){
    if(lastPsm[kind] === psm) return;
    await w.setParameters({ tessedit_pageseg_mode: String(psm) }); lastPsm[kind] = psm;
  }

  // ---------- Xử lý ảnh ----------
  function otsu(hist, n){
    let sum = 0; for(let i=0;i<256;i++) sum += i*hist[i];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for(let t=0;t<256;t++){
      wB += hist[t]; if(!wB) continue;
      const wF = n - wB; if(!wF) break;
      sB += t*hist[t];
      const mB = sB/wB, mF = (sum - sB)/wF, v = wB*wF*(mB-mF)*(mB-mF);
      if(v > best){ best = v; thr = t; }
    }
    return thr;
  }
  // Cắt box (pixel), phóng to, nhị phân hoá: chữ SÁNG -> đen, nền -> trắng (polarity 'dark' thì ngược lại)
  function binCrop(src, box, thr, polarity, th){
    let x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
    let x1 = Math.min(src.width, Math.ceil(box[2])), y1 = Math.min(src.height, Math.ceil(box[3]));
    const w = x1 - x0, h = y1 - y0; if(w < 6 || h < 6) return null;
    const k = Math.max(1, Math.min(8, (th || CFG.targetH) / h));
    const cw = Math.round(w*k), ch = Math.round(h*k), pad = 20;
    const t = document.createElement('canvas'); t.width = cw; t.height = ch;
    const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; try{ tc.imageSmoothingQuality = 'high'; }catch(e){}
    tc.drawImage(src, x0, y0, w, h, 0, 0, cw, ch);
    const d = tc.getImageData(0, 0, cw, ch).data, n = cw*ch;
    const lum = new Uint8Array(n), hist = new Array(256).fill(0);
    for(let i=0;i<n;i++){ const v = (0.299*d[4*i] + 0.587*d[4*i+1] + 0.114*d[4*i+2]) | 0; lum[i] = v; hist[v]++; }
    const T = thr === 'otsu' ? otsu(hist, n) : thr;
    const o = document.createElement('canvas'); o.width = cw + 2*pad; o.height = ch + 2*pad;
    const oc = o.getContext('2d'); oc.fillStyle = '#fff'; oc.fillRect(0, 0, o.width, o.height);
    const out = oc.createImageData(cw, ch), od = out.data, dark = polarity === 'dark';
    for(let i=0;i<n;i++){
      const textPix = dark ? lum[i] <= T : lum[i] > T;
      const v = textPix ? 0 : 255;
      od[4*i] = od[4*i+1] = od[4*i+2] = v; od[4*i+3] = 255;
    }
    oc.putImageData(out, pad, pad);
    o._m = { x0, y0, k, pad };
    return o;
  }
  // Ảnh xám tăng tương phản (cho đọc chữ nhãn ở bước tự tìm)
  function grayCrop(src, box, k){
    const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
    const x1 = Math.min(src.width, Math.ceil(box[2])), y1 = Math.min(src.height, Math.ceil(box[3]));
    const w = x1 - x0, h = y1 - y0; if(w < 6 || h < 6) return null;
    const cw = Math.round(w*k), ch = Math.round(h*k);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; try{ cx.imageSmoothingQuality = 'high'; }catch(e){}
    cx.drawImage(src, x0, y0, w, h, 0, 0, cw, ch);
    const id = cx.getImageData(0, 0, cw, ch), d = id.data;
    for(let i=0;i<d.length;i+=4){
      let v = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      v = (v - 128) * 1.3 + 128; v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i+1] = d[i+2] = v;
    }
    cx.putImageData(id, 0, 0);
    return { canvas:c, k, x0, y0 };
  }
  function pxBox(canvas, fb, dx, dy){
    const W = canvas.width, H = canvas.height;
    return [(fb[0]+dx)*W, (fb[1]+dy)*H, (fb[2]+dx)*W, (fb[3]+dy)*H];
  }
  function inRange(n, r){ return n >= r[0] && n <= r[1]; }

  // ---------- Bỏ phiếu ----------
  function Votes(){ this.m = new Map(); this.n = 0; }
  Votes.prototype.add = function(v){ this.m.set(v, (this.m.get(v)||0) + 1); this.n++; };
  Votes.prototype.best = function(range){
    let b = null, c = 0;
    this.m.forEach((k, v)=>{ if(inRange(v, range) && k > c){ b = v; c = k; } });
    return (b !== null && c >= CFG.minVotes && c / this.n >= CFG.minShare) ? b : null;
  };
  Votes.prototype.solid = function(){      // đã quá chắc: >=3 phiếu và không có số khác
    if(this.m.size !== 1) return false;
    return [...this.m.values()][0] >= 3;
  };

  async function ocrDigits(c, psm){
    const w = await getWorker('digit');
    await setPsm('digit', w, psm);
    const { data } = await w.recognize(toInput(c));
    return (data.text || '').trim();
  }
  const tokens = txt => (String(txt).match(/\d+/g) || []).map(s => s.length > 4 ? NaN : parseInt(s, 10)).filter(n => !isNaN(n));

  // ---------- Bước 1: đọc 2 vùng đã học ----------
  async function readRowZone(canvas, z, polarities){   // vùng có 2 số cùng hàng: "126  468"
    const H = new Votes(), S = new Votes();
    outer: for(const [dx, dy] of CFG.jitter){
      for(const pol of polarities) for(const thr of z.thr){
        const c = binCrop(canvas, pxBox(canvas, z.box, dx, dy), thr, pol); if(!c) continue;
        const t = tokens(await ocrDigits(c, 7));
        if(t.length === 2){ H.add(t[0]); S.add(t[1]); }
        if(H.solid() && S.solid()) break outer;
      }
    }
    return { h: H.best(CFG.heroRange), s: S.best(CFG.skinRange), reads: H.n };
  }
  async function readNumberBox(canvas, fb, range, thrs, polarities, jitter){   // 1 số trong 1 khung
    const V = new Votes();
    for(const [dx, dy] of jitter){
      for(const pol of polarities) for(const thr of thrs) for(const th of CFG.scales){
        const c = binCrop(canvas, pxBox(canvas, fb, dx, dy), thr, pol, th); if(!c) continue;
        for(const psm of [7, 8]){
          const t = tokens(await ocrDigits(c, psm));
          if(t.length === 1) V.add(t[0]);
        }
        if(V.solid()) return { v: V.best(range), reads: V.n };
      }
    }
    return { v: V.best(range), reads: V.n };
  }
  async function readPairZone(canvas, z, polarities){   // 2 số xếp dọc, mỗi số 1 khung
    const a = await readNumberBox(canvas, z.hero, CFG.heroRange, z.thr, polarities, CFG.jitter);
    const b = await readNumberBox(canvas, z.skin, CFG.skinRange, z.thr, polarities, CFG.jitter);
    return { h: a.v, s: b.v, reads: a.reads + b.reads };
  }
  async function readZones(canvas){
    const out = {};
    for(const z of CFG.zones){
      out[z.id] = z.kind === 'row' ? await readRowZone(canvas, z, ['bright']) : await readPairZone(canvas, z, ['bright']);
      log('zone', z.id, out[z.id]);
    }
    return out;
  }

  // ---------- Xác minh bằng chữ nhãn ("Tướng" / "Tr.phục" / "SKIN") ----------
  function stripAccents(s){ return String(s||'').toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function lev(a, b){
    const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
    let prev = Array.from({length:n+1}, (_,j)=>j);
    for(let i=1;i<=m;i++){
      const cur = [i];
      for(let j=1;j<=n;j++) cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1]?0:1));
      prev = cur;
    }
    return prev[n];
  }
  // so khớp mờ: OCR hay ra "lướng", "TUÓNG", "Ir.phục", "SRN"...
  function isHeroLabel(txt){
    return stripAccents(txt).split(/[^a-z]+/).some(t => t.length >= 4 && (t.includes('tuong') || t.includes('uong') || lev(t, 'tuong') <= 2 || t === 'hero' || t === 'heroes'));
  }
  function isSkinLabel(txt){
    return stripAccents(txt).split(/[^a-z]+/).some(t => t.length >= 3 && (t.includes('phuc') || t.includes('skin') || lev(t, 'skin') <= 1 || (t.length <= 5 && t[0] === 's' && lev(t, 'skin') <= 2)));
  }
  function collectWords(data){
    if(data.words && data.words.length) return data.words;
    const out = [];
    (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(w=>out.push(w)))));
    return out;
  }
  const LABEL_VARIANTS = [['bright',170], ['bright',200], ['gray',3]];
  async function labelHas(canvas, box, kind){      // box: pixel [x0,y0,x1,y1]
    const pred = kind === 'hero' ? isHeroLabel : isSkinLabel;
    const w = await getWorker('label'); await setPsm('label', w, 7);
    for(const [mode, p] of LABEL_VARIANTS){
      const c = mode === 'gray' ? (grayCrop(canvas, box, p) || {}).canvas : binCrop(canvas, box, p, 'bright');
      if(!c) continue;
      const { data } = await w.recognize(toInput(c));
      if(pred(data.text || '')) return true;
    }
    return false;
  }
  // nhãn nằm dưới số ('row', ô tròn) hoặc trên số ('col', khung trái)
  function labelBox(n, layout){
    return layout === 'row'
      ? [n.x0 - 0.35*n.w, n.y1 + 0.3*n.h, n.x1 + 0.35*n.w, n.y1 + 2.0*n.h]
      : [n.x0 - 0.5*n.w,  n.y0 - 2.0*n.h, n.x1 + 0.5*n.w,  n.y0 - 0.05*n.h];
  }
  const asBox = b => ({ x0:b[0], y0:b[1], x1:b[2], y1:b[3], w:b[2]-b[0], h:b[3]-b[1] });
  async function verifyLabels(canvas, hNum, sNum, layout){
    const hero = await labelHas(canvas, labelBox(hNum, layout), 'hero');
    const skin = await labelHas(canvas, labelBox(sNum, layout), 'skin');
    return { hero, skin, score: (hero?1:0) + (skin?2:0) };
  }
  async function verifyZone(canvas, z){            // vùng đã học có đúng nhãn ở đúng chỗ không?
    let hb, sb;
    if(z.hnum){ hb = asBox(pxBox(canvas, z.hnum, 0, 0)); sb = asBox(pxBox(canvas, z.snum, 0, 0)); }
    else { hb = asBox(pxBox(canvas, z.hero, 0, 0)); sb = asBox(pxBox(canvas, z.skin, 0, 0)); }
    return verifyLabels(canvas, hb, sb, z.layout);
  }

  // ---------- Bước 3: tự tìm (tìm SỐ trước, kiểm NHÃN sau) ----------
  async function digitWords(canvas, t, thr, pol){
    const W = canvas.width, H = canvas.height;
    const th = Math.max(CFG.targetH, (t[3]-t[1]) * H * Math.max(1, 2000 / W));   // ảnh nhỏ thì phóng lên cỡ ảnh ~2000px rộng
    const c = binCrop(canvas, [t[0]*W, t[1]*H, t[2]*W, t[3]*H], thr, pol || 'bright', th); if(!c) return [];
    const w = await getWorker('digit'); await setPsm('digit', w, 11);
    const { data } = await w.recognize(toInput(c));
    const m = c._m, out = [];
    collectWords(data).forEach(wd=>{
      if(!wd || !wd.text || !wd.bbox) return;
      const txt = String(wd.text).replace(/\s/g, ''); if(!/^\d{1,4}$/.test(txt)) return;
      const b = wd.bbox, x0 = m.x0 + (b.x0 - m.pad)/m.k, y0 = m.y0 + (b.y0 - m.pad)/m.k, x1 = m.x0 + (b.x1 - m.pad)/m.k, y1 = m.y0 + (b.y1 - m.pad)/m.k;
      out.push({ value: parseInt(txt, 10), box:{ x0, y0, x1, y1, cx:(x0+x1)/2, cy:(y0+y1)/2, w:x1-x0, h:y1-y0 } });
    });
    return out;
  }
  // 2 số "tướng" & "trang phục": cùng hàng (tướng bên trái) hoặc cùng cột (tướng ở trên), chiều cao chữ số gần bằng nhau
  function findPairsFrom(hs, ss){
    const pairs = [];
    hs.forEach(a => ss.forEach(b => {
      if(a === b) return;
      const A = a.box, B = b.box, u = Math.max(A.h, B.h);
      if(u < 14 || Math.min(A.h, B.h) / u < 0.6) return;
      const gapX = B.x0 - A.x1, gapY = B.y0 - A.y1;
      if(Math.abs(A.cy - B.cy) < 0.5*u && gapX > 0 && gapX < 4*u) pairs.push({ h:a, s:b, layout:'row', d:gapX });
      else if(Math.abs(A.cx - B.cx) < 0.9*Math.max(A.w, B.w) && gapY > 0.1*u && gapY < 3*u) pairs.push({ h:a, s:b, layout:'col', d:gapY });
    }));
    return pairs.sort((p, q) => p.d/Math.max(p.h.box.h, p.s.box.h) - q.d/Math.max(q.h.box.h, q.s.box.h)).slice(0, 8);
  }
  function findPairs(words){
    return findPairsFrom(words.filter(x => inRange(x.value, CFG.heroRange)), words.filter(x => inRange(x.value, CFG.skinRange)));
  }
  // Kéo dài khung của 1 số cho TRỌN số (OCR đôi khi chỉ bắt được 1-2 chữ số): đi sang trái/phải theo cột có pixel sáng,
  // dừng khi gặp khoảng trống rộng hơn ~0.45 chiều cao chữ số.
  function extendRun(canvas, box, thr){
    const u = box.h, x0 = Math.max(0, Math.floor(box.x0 - 3*u)), x1 = Math.min(canvas.width, Math.ceil(box.x1 + 3*u));
    const y0 = Math.max(0, Math.floor(box.y0 + 0.15*u)), y1 = Math.min(canvas.height, Math.ceil(box.y1 - 0.15*u));
    const w = x1 - x0, h = y1 - y0; if(w < 6 || h < 4) return box;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tc = t.getContext('2d'); tc.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    const d = tc.getImageData(0, 0, w, h).data, col = new Uint16Array(w);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i = 4*(y*w+x); if(0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2] > thr) col[x]++; }
    const on = x => col[x] >= 2, maxGap = Math.max(3, Math.round(0.45*u));
    let L = Math.round((box.x0 + box.x1)/2 - x0), R = L;
    L = Math.max(0, Math.min(w-1, L)); R = L;
    // bắt đầu từ giữa khung gốc rồi mở rộng
    let gap = 0; for(let x=L; x>=0; x--){ if(on(x)){ L = x; gap = 0; } else if(++gap > maxGap) break; }
    gap = 0; for(let x=R; x<w; x++){ if(on(x)){ R = x; gap = 0; } else if(++gap > maxGap) break; }
    const nx0 = x0 + L, nx1 = x0 + R + 1;
    // không thu hẹp nhỏ hơn khung gốc
    const X0 = Math.min(nx0, box.x0), X1 = Math.max(nx1, box.x1);
    return { x0:X0, y0:box.y0, x1:X1, y1:box.y1, cx:(X0+X1)/2, cy:box.cy, w:X1-X0, h:box.h };
  }
  // Đọc lại chính xác 1 số đã định vị: cắt sát số, chỉ đọc chữ số, nhiều ngưỡng, bỏ phiếu
  async function refineNumber(canvas, box, range, fallback){
    const padX = box.w * 0.25, padY = box.h * 0.2;
    const fb = [(box.x0-padX)/canvas.width, (box.y0-padY)/canvas.height, (box.x1+padX)/canvas.width, (box.y1+padY)/canvas.height];
    const r = await readNumberBox(canvas, fb, range, [160, 185, 215, 'otsu'], ['bright', 'dark'], [[0,0],[0.002,0.001],[-0.002,-0.001]]);
    return r.v !== null ? r.v : fallback;
  }
  // Các lượt quét "không bỏ sót": chữ sáng ở vài ngưỡng, rồi chữ tối trên nền sáng
  const PASSES = [
    { thr:185, pol:'bright', rd:[160, 185, 215, 'otsu'] },
    { thr:160, pol:'bright', rd:[160, 185, 215, 'otsu'] },
    { thr:215, pol:'bright', rd:[160, 185, 215, 'otsu'] },
    { thr:110, pol:'dark',   rd:[90, 110, 140, 'otsu'] },
  ];
  const J3 = [[0,0],[0.002,0.001],[-0.002,-0.001]];
  const fracBox = (canvas, b, px, py) => [(b.x0 - px)/canvas.width, (b.y0 - py)/canvas.height, (b.x1 + px)/canvas.width, (b.y1 + py)/canvas.height];
  async function readExt(canvas, b, range, pass){
    return readNumberBox(canvas, fracBox(canvas, b, b.h*0.2, b.h*0.15), range, pass.rd, [pass.pol], J3);
  }
  async function locateByDigits(canvas){
    const seen = new Set(), t0 = Date.now(), weak = [];
    for(const pass of PASSES){
      for(const t of CFG.tiles){
        if(Date.now() - t0 > CFG.maxSearchMs){ log('hết thời gian tìm'); return weak.length ? { weak } : null; }
        const words = await digitWords(canvas, t, pass.thr, pass.pol);
        const pairs = findPairs(words).filter(p => { const k = [p.layout, Math.round(p.h.box.cx/10), Math.round(p.h.box.cy/10)].join(); if(seen.has(k)) return false; seen.add(k); return true; });
        log('quét', pass.pol+pass.thr, t, 'chữ số', words.length, 'cặp', pairs.map(p => p.h.value+'/'+p.s.value+':'+p.layout));
        for(const p of pairs){
          const hb = extendRun(canvas, p.h.box, pass.thr), sb = extendRun(canvas, p.s.box, pass.thr);
          const v = await verifyLabels(canvas, hb, sb, p.layout);
          log('  verify', p.h.value+'/'+p.s.value, p.layout, v);
          if(!v.skin) continue;                          // phải thấy nhãn "Tr.phục"/"SKIN" (đặc trưng)
          const H = await readExt(canvas, hb, CFG.heroRange, pass), S = await readExt(canvas, sb, CFG.skinRange, pass);
          log('  refine', H.v, S.v);
          if(H.v == null || S.v == null) continue;       // không đọc chắc được cả 2 số -> bỏ
          const res = { h:H.v, s:S.v, layout:p.layout, labels:v, hb, sb };
          if(v.hero) return res;                         // thấy cả 2 nhãn -> chắc chắn
          weak.push(res);                                // chỉ thấy nhãn trang phục -> chỉ gợi ý
        }
      }
      if(weak.length) break;                             // đã có gợi ý -> không quét thêm lượt khác
    }
    return weak.length ? { weak } : null;
  }

  // ---------- HỌC từ mã bạn nhập ----------
  // Vùng đã học lưu ở localStorage: [{id, ar, layout, kind, box|hero+skin, hnum, snum, hits, labelOk, t}]
  function getLearned(){
    try{ const a = JSON.parse(root.localStorage.getItem(CFG.learnKey) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; }
  }
  function putLearned(a){
    a.sort((x, y) => (y.hits - x.hits) || (y.t - x.t));
    try{ root.localStorage.setItem(CFG.learnKey, JSON.stringify(a.slice(0, CFG.learnMax))); }catch(e){}
  }
  function clearLearned(){ try{ root.localStorage.removeItem(CFG.learnKey); }catch(e){} }
  function exportLearned(){ return JSON.stringify(getLearned()); }
  function importLearned(json){
    let a; try{ a = JSON.parse(json); }catch(e){ return 0; } if(!Array.isArray(a)) return 0;
    const cur = getLearned(); let n = 0;
    a.forEach(z => { if(z && z.id && z.layout && !cur.some(c => c.id === z.id)){ cur.push(z); n++; } }); putLearned(cur); return n;
  }
  function toZone(L){      // vùng đã học -> zone dùng để đọc: luôn đọc TỪNG SỐ riêng (chính xác hơn đọc cả hàng)
    return { id:L.id, learned:true, hits:L.hits, layout:L.layout, labelOk:L.labelOk, kind:'pair', hero:L.hero, skin:L.skin, hnum:L.hnum, snum:L.snum, thr:[185, 160, 215, 'otsu'] };
  }
  function activeZones(canvas){
    const ar = canvas.width / canvas.height;
    const L = getLearned().filter(z => Math.abs(ar - z.ar) / z.ar < CFG.arTol).sort((a, b) => b.hits - a.hits).slice(0, 3).map(toZone);
    return L.concat(CFG.zones);
  }
  const roundF = a => a.map(v => Math.round(v * 10000) / 10000);
  // Từ 2 khung số đã biết -> lưu thành vùng học (gộp nếu trùng vị trí cũ)
  function saveLearned(canvas, hb, sb, layout, labelOk, hits){
    const W = canvas.width, H = canvas.height, u = Math.max(hb.h, sb.h);
    const f = (b, px, py) => roundF([(b.x0 - px)/W, (b.y0 - py)/H, (b.x1 + px)/W, (b.y1 + py)/H]);
    const z = { id:'L' + Date.now().toString(36) + Math.floor(Math.random()*1296).toString(36), ar: Math.round(W/H*10000)/10000, layout, hits:hits || 1, labelOk:!!labelOk, t:Date.now() };
    z.hero = f(hb, 0.35*u, 0.35*u); z.skin = f(sb, 0.35*u, 0.35*u);
    if(layout === 'row'){ z.hnum = f(hb, 0.1*u, 0.1*u); z.snum = f(sb, 0.1*u, 0.1*u); }
    const all = getLearned();
    const dup = all.find(o => o.layout === z.layout && Math.abs(o.ar - z.ar) / z.ar < CFG.arTol &&
      o.hero && Math.abs(o.hero[0] - key[0]) < 0.012 && Math.abs(o.hero[1] - key[1]) < 0.012);
    if(dup){ dup.hits++; dup.t = Date.now(); dup.labelOk = dup.labelOk || z.labelOk; putLearned(all); return dup; }
    all.push(z); putLearned(all); return z;
  }
  function reinforce(ids, delta){
    const all = getLearned(); let ch = false;
    ids.forEach(id => { const z = all.find(o => o.id === id); if(z){ z.hits += delta; z.t = Date.now(); ch = true; } });
    if(ch) putLearned(all.filter(z => z.hits > 0));
  }
  // đoán vị trí số còn thiếu khi OCR chỉ bắt được 1 trong 2 số
  async function probeNeighbor(canvas, a, want, range, side, pass){
    const u = a.h;
    for(const g of [0.8, 1.2, 1.7, 0.4, 2.2]){
      let b;
      if(side === 'right') b = { x0:a.x1 + g*u - 0.2*u, x1:a.x1 + g*u + a.w*1.5, y0:a.y0 - 0.15*u, y1:a.y1 + 0.15*u };
      else if(side === 'left') b = { x0:a.x0 - g*u - a.w*1.5, x1:a.x0 - g*u + 0.2*u, y0:a.y0 - 0.15*u, y1:a.y1 + 0.15*u };
      else if(side === 'below') b = { x0:a.x0 - 0.3*a.w, x1:a.x1 + 0.3*a.w, y0:a.y1 + g*u - 0.2*u, y1:a.y1 + g*u + 1.2*u };
      else b = { x0:a.x0 - 0.3*a.w, x1:a.x1 + 0.3*a.w, y0:a.y0 - g*u - 1.2*u, y1:a.y0 - g*u + 0.2*u };
      const r = await readNumberBox(canvas, [b.x0/canvas.width, b.y0/canvas.height, b.x1/canvas.width, b.y1/canvas.height], range, pass.rd, [pass.pol], [[0,0]]);
      if(r.v === want){ const q = Object.assign({}, b, { w:b.x1-b.x0, h:b.y1-b.y0, cx:(b.x0+b.x1)/2, cy:(b.y0+b.y1)/2 }); q.h = u; q.y0 = a.y0; q.y1 = a.y1; if(side==='below'||side==='above'){ q.y0 = b.y0 + 0.2*u; q.y1 = q.y0 + u; } return extendRun(canvas, q, pass.thr); }
    }
    return null;
  }
  const GRID = [[0,0,0.55,0.4],[0.45,0,1,0.4],[0,0.3,0.55,0.7],[0.45,0.3,1,0.7],[0,0.6,0.55,1],[0.45,0.6,1,1]];   // phủ KÍN toàn ảnh
  // Học: quét mọi chữ số trong ảnh, tìm đúng 2 số bạn đã nhập, nhớ vị trí + bố cục
  async function learn(canvas, h, s){
    const t0 = Date.now();
    for(const pass of PASSES){
      const Hs = [], Ss = [];
      for(const t of GRID){
        if(Date.now() - t0 > CFG.learnMaxMs) return { learned:false, reason:'quá thời gian quét' };
        const words = await digitWords(canvas, t, pass.thr, pass.pol);
        words.forEach(w => { if(w.value === h) Hs.push(w); if(w.value === s) Ss.push(w); });
        const pairs = findPairsFrom(Hs, Ss);
        log('học', pass.pol+pass.thr, t, 'H', Hs.length, 'S', Ss.length, 'cặp', pairs.length);
        for(const p of pairs){
          const hb = extendRun(canvas, p.h.box, pass.thr), sb = extendRun(canvas, p.s.box, pass.thr);
          const rh = await readExt(canvas, hb, CFG.heroRange, pass), rs = await readExt(canvas, sb, CFG.skinRange, pass);
          if(rh.v !== h || rs.v !== s) continue;              // đọc lại phải ra đúng mã bạn nhập
          const v = await verifyLabels(canvas, hb, sb, p.layout);
          const z = saveLearned(canvas, hb, sb, p.layout, v.score >= 1, 2);   // bạn tự nhập mã = xác nhận chắc chắn
          return { learned:true, zone:z, layout:p.layout, labels:v };
        }
        if(pairs.length) continue;
      }
      // chưa ghép được cặp: nếu thấy 1 trong 2 số thì đoán số còn lại ở cạnh nó
      const tries = [];
      Hs.slice(0, 3).forEach(a => { tries.push([a, 'hero', 's', 'right', 'row'], [a, 'hero', 's', 'below', 'col']); });
      Ss.slice(0, 3).forEach(a => { tries.push([a, 'skin', 'h', 'left', 'row'], [a, 'skin', 'h', 'above', 'col']); });
      for(const [a, who, , side, layout] of tries){
        const a2 = extendRun(canvas, a.box, pass.thr);
        const want = who === 'hero' ? s : h, range = who === 'hero' ? CFG.skinRange : CFG.heroRange;
        const nb = await probeNeighbor(canvas, a2, want, range, side, pass);
        if(!nb) continue;
        const hb = who === 'hero' ? a2 : nb, sb = who === 'hero' ? nb : a2;
        const rh = await readExt(canvas, hb, CFG.heroRange, pass), rs = await readExt(canvas, sb, CFG.skinRange, pass);
        if(rh.v !== h || rs.v !== s) continue;
        const v = await verifyLabels(canvas, hb, sb, layout);
        return { learned:true, zone:saveLearned(canvas, hb, sb, layout, v.score >= 1, 2), layout, labels:v, probed:true };
      }
    }
    return { learned:false, reason:'không tìm thấy 2 số '+h+' và '+s+' cạnh nhau trong ảnh' };
  }
  const parseCode = code => { const m = /^\s*(\d{1,4})\D+(\d{1,4})\s*$/.exec(String(code||'')); return m ? [parseInt(m[1],10), parseInt(m[2],10)] : null; };
  // Gọi khi bạn LƯU acc: so mã bạn nhập với kết quả OCR. Đúng -> củng cố vùng; sai/không tìm thấy -> học vị trí mới.
  async function learnFromCanvas(canvas, code, prev){
    const hs = parseCode(code); if(!hs) return { learned:false, reason:'mã không đúng dạng tướng/trang phục' };
    const res = prev || await detectCanvas(canvas);
    const typed = hs[0] + '/' + hs[1];
    if(res.status === 'ok' && res.code === typed){ reinforce((res.zoneIds || []).filter(i => /^L/.test(i)), 1); return { learned:false, reason:'OCR đã nhận đúng', reinforced:true }; }
    if(res.status === 'ok') reinforce((res.zoneIds || []).filter(i => /^L/.test(i)), -1);       // vùng học cho kết quả sai -> giảm tin cậy
    return learn(canvas, hs[0], hs[1]);
  }
  const lastResults = new WeakMap();
  function learnFromSave(blob, code){
    const job = queue.then(async () => learnFromCanvas(await blobToCanvas(blob), code, lastResults.get(blob)));
    queue = job.catch(() => {});
    return job;
  }

  // ---------- Quyết định cuối ----------
  const zonesObj = items => { const o = {}; items.forEach(x => { o[x.z.id] = x.r; }); return o; };
  function okRes(h, s, ids, note, items){ return { status:'ok', code:h+'/'+s, heroes:h, skins:s, via:ids.map(i => /^L/.test(i) ? 'học' : i).join('+'), zoneIds:ids, note, found:{ zones:zonesObj(items) } }; }
  function ambRes(cands, items){ return { status:'ambiguous', candidates:[...new Set(cands)].slice(0, CFG.maxCombos), found:{ zones:zonesObj(items) } }; }
  const isFull = r => r && r.h != null && r.s != null;
  const readZone = (canvas, z) => z.kind === 'row' ? readRowZone(canvas, z, ['bright']) : readPairZone(canvas, z, ['bright']);

  async function detectCanvas(canvas){
    const zones = activeZones(canvas);                 // vùng đã học (ưu tiên) + 2 vùng mặc định
    const items = [];
    for(const z of zones){                             // 1) đọc từng vùng
      const r = await readZone(canvas, z); const me = { z, r }; items.push(me);
      log('vùng', z.id, r);
      if(!isFull(r)) continue;
      if(z.learned){                                   // vùng đã học: tin ngay nếu thấy nhãn đúng chỗ hoặc bạn đã xác nhận >=2 lần
        r.verify = await verifyZone(canvas, z);
        if(r.verify.score >= 1 || z.hits >= 2) return okRes(r.h, r.s, [z.id], r.verify.score >= 1 ? 'đọc từ vùng đã học (nhãn khớp)' : 'đọc từ vùng đã học (bạn xác nhận '+z.hits+' lần)', items);
      }
      const same = items.filter(x => x !== me && isFull(x.r) && x.r.h === r.h && x.r.s === r.s);
      const diff = items.some(x => isFull(x.r) && (x.r.h !== r.h || x.r.s !== r.s));
      if(same.length && !diff) return okRes(r.h, r.s, [...same.map(x => x.z.id), z.id], 'khớp ở '+(same.length+1)+' nơi trong ảnh', items);   // 2 nơi cùng ra 1 cặp: chắc chắn
    }
    // 2) một nơi đủ cặp: xác minh bằng chữ nhãn, hoặc nơi khác (đọc được 1 phần) không mâu thuẫn
    const verified = [];
    for(const me of items){
      const r = me.r; if(!isFull(r)) continue;
      const others = items.filter(x => x !== me);
      const support = others.some(x => (x.r.h != null && x.r.h === r.h) || (x.r.s != null && x.r.s === r.s));
      const conflict = others.some(x => isFull(x.r) && (x.r.h !== r.h || x.r.s !== r.s));
      if(!r.verify) r.verify = await verifyZone(canvas, me.z);
      if(r.verify.score >= 1 || (support && !conflict)) verified.push({ id:me.z.id, h:r.h, s:r.s, byLabel:r.verify.score >= 1 });
    }
    const keys = [...new Set(verified.map(v => v.h+'/'+v.s))];
    if(keys.length === 1){ const v = verified[0]; return okRes(v.h, v.s, verified.map(x => x.id), v.byLabel ? 'đã đối chiếu chữ nhãn trong ảnh' : 'khớp một phần với nơi còn lại', items); }
    if(keys.length > 1) return ambRes(keys, items);
    // 3) chưa xác nhận được -> tự đi tìm trên toàn ảnh (nhiều lượt quét), thấy thì TỰ HỌC vị trí cho lần sau
    let F = null;
    try{ F = await locateByDigits(canvas); }catch(e){ log('locate lỗi', e); }
    if(F && F.weak) return ambRes(F.weak.map(x => x.h+'/'+x.s), items);
    if(F){
      try{ saveLearned(canvas, F.hb, F.sb, F.layout, true); }catch(e){}
      return okRes(F.h, F.s, ['tìm-tự-động'], 'tự tìm thấy cạnh nhãn Tướng/Trang phục (đã ghi nhớ vị trí)', items);
    }
    // 4) không xác nhận được: đừng tự điền sai — vùng có đọc ra thì chỉ gợi ý để bạn bấm xác nhận
    const sug = items.filter(x => isFull(x.r)).map(x => x.r.h+'/'+x.r.s);
    if(sug.length) return ambRes(sug, items);
    const h = items.map(x => x.r.h).filter(v => v != null), sk = items.map(x => x.r.s).filter(v => v != null);
    let hint = 'Không tìm thấy số Tướng / Trang phục trong ảnh — hãy tự nhập, lần lưu sau mình sẽ học vị trí.';
    if(h.length && !sk.length) hint = 'Chỉ thấy số Tướng ('+[...new Set(h)].join(', ')+'), không thấy số Trang phục.';
    if(sk.length && !h.length) hint = 'Chỉ thấy số Trang phục ('+[...new Set(sk)].join(', ')+'), không thấy số Tướng.';
    return { status:'none', hint, found:{ zones:zonesObj(items) } };
  }

  // ---------- Hàm chính: xếp hàng để không chạy song song ----------
  function blobToCanvas(blob){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = ()=>{
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        const k = Math.max(w, h) > 3200 ? 3200 / Math.max(w, h) : 1;   // ảnh quá lớn thì thu nhỏ (vùng tính theo %, không ảnh hưởng)
        w = Math.round(w*k); h = Math.round(h*k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c);
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  }
  function detect(blob){
    const job = queue.then(async ()=>{ const r = await detectCanvas(await blobToCanvas(blob)); try{ lastResults.set(blob, r); }catch(e){} return r; });
    queue = job.catch(()=>{});
    return job;
  }

  root.AccOCR = { detect, detectCanvas, warmup, config: CFG, learnFromSave, learnFromCanvas, learn, getLearned, clearLearned, exportLearned, importLearned };
})();
