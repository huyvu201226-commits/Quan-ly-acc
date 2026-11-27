// ===== NHẬP KHO ACC TỪ FILE WORD (word-import.js) =====
// Chức năng độc lập, gắn thêm vào web mà không đụng tới cách thêm acc cũ:
//   1) Chọn / kéo thả file .docx (vd "acc 17 11"): mỗi trang gồm 1 ảnh, bên dưới lần lượt là
//        "Mã acc: ..."  -> Mã số       "Giá: ..."  -> Giá       "Tên: ..."  -> Ghi chú (mô tả)
//      Tự lấy ảnh + chữ, điền sẵn toàn bộ, hiện ra danh sách ngay (không cần nhập tay từng ảnh).
//   2) Nút "🔍 Phân tích nhanh": soát lỗi (thiếu mã/giá/ghi chú, mã sai dạng, trùng mã, trùng ảnh, giá lạ, ảnh hỏng...).
//   3) Nút "Lưu tất cả": mới thật sự lưu vào trang. Có lỗi nặng thì KHÔNG lưu, chỉ ra chỗ cần sửa.
// Không dùng thư viện ngoài: tự đọc file .docx (zip) bằng DecompressionStream có sẵn của trình duyệt
// (trình duyệt quá cũ thì tự tải JSZip dự phòng). Lưu qua đúng hàng đợi SaveQueue + saveNewAcc của trang.
// API:  openWordImportModal()  ·  WordImport.parseDocx(arrayBuffer, onProgress)  ·  WordImport.parsePrice(text)
(function(){
  const root = (typeof window !== 'undefined') ? window : globalThis;

  // ================= 1. Đọc file .docx =================
  const td = new TextDecoder('utf-8');
  function u16(d, o){ return d[o] | (d[o+1] << 8); }
  function u32(d, o){ return (d[o] | (d[o+1] << 8) | (d[o+2] << 16) | (d[o+3] << 24)) >>> 0; }

  async function inflateRaw(bytes){
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  function loadScript(src){
    return new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = ()=>rej(new Error('Không tải được thư viện dự phòng')); document.head.appendChild(s); });
  }
  // Trả về { names:Set, read(name) -> Promise<Uint8Array|null> }
  async function openZip(buf){
    const data = new Uint8Array(buf);
    if(typeof DecompressionStream === 'undefined'){
      if(!root.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const z = await root.JSZip.loadAsync(data);
      return { names: new Set(Object.keys(z.files)), read: async n => z.files[n] ? new Uint8Array(await z.files[n].async('uint8array')) : null };
    }
    // tìm bản ghi cuối (End of Central Directory)
    let eocd = -1;
    for(let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65536); i--){ if(u32(data, i) === 0x06054b50){ eocd = i; break; } }
    if(eocd < 0) throw new Error('Đây không phải file Word (.docx) hợp lệ.');
    const total = u16(data, eocd + 10);
    let p = u32(data, eocd + 16);
    const entries = new Map();
    for(let k = 0; k < total; k++){
      if(u32(data, p) !== 0x02014b50) break;
      const method = u16(data, p + 10), csize = u32(data, p + 20), nlen = u16(data, p + 28), elen = u16(data, p + 30), clen = u16(data, p + 32), off = u32(data, p + 42);
      const name = td.decode(data.subarray(p + 46, p + 46 + nlen));
      entries.set(name, { method, csize, off });
      p += 46 + nlen + elen + clen;
    }
    return {
      names: new Set(entries.keys()),
      read: async name => {
        const e = entries.get(name); if(!e) return null;
        const o = e.off;
        if(u32(data, o) !== 0x04034b50) throw new Error('File Word bị hỏng.');
        const start = o + 30 + u16(data, o + 26) + u16(data, o + 28);
        const raw = data.subarray(start, start + e.csize);
        if(e.method === 0) return raw;
        if(e.method === 8) return inflateRaw(raw);
        throw new Error('File Word dùng kiểu nén không hỗ trợ.');
      }
    };
  }

  function decodeEntities(s){
    return s.replace(/&#x([0-9a-f]+);/gi, (_, h)=>String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d)=>String.fromCodePoint(parseInt(d, 10)))
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function stripAccents(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
  const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|tiff?|emf|wmf)$/i;
  const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', bmp:'image/bmp', webp:'image/webp', tif:'image/tiff', tiff:'image/tiff', emf:'image/emf', wmf:'image/wmf' };

  function fieldOfLabel(label){
    const l = stripAccents(label).toLowerCase().replace(/\s+/g, ' ').trim();
    if(/^(ma|ma acc|ma so|ma tk|code|id)$/.test(l)) return 'code';
    if(/^(gia|gia ban|price)$/.test(l)) return 'price';
    if(/^(ten|name|ghi chu|mo ta|note|chu thich)$/.test(l)) return 'desc';
    return null;
  }
  function normCode(s){ return String(s||'').replace(/\s+/g, ' ').trim().replace(/\s*\/\s*/g, '/').replace(/[.,;]+$/, ''); }
  function compactCode(s){ return String(s||'').toLowerCase().replace(/\s+/g, ''); }
  function hashBytes(b){ let h = 2166136261; for(let i = 0; i < b.length; i++){ h ^= b[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '-' + b.length; }

  // Đọc toàn bộ file Word -> danh sách mục { n, code, price, desc, bytes, ext, hash, extras, err }
  async function parseDocx(buf, onProgress){
    const zip = await openZip(buf);
    const docBytes = await zip.read('word/document.xml');
    if(!docBytes) throw new Error('Không thấy nội dung trong file (không phải file Word .docx?).');
    const relBytes = await zip.read('word/_rels/document.xml.rels');
    const rels = {};
    if(relBytes){
      const rx = td.decode(relBytes);
      (rx.match(/<Relationship\b[^>]*>/g) || []).forEach(t=>{
        const id = (t.match(/\bId="([^"]+)"/) || [])[1], tg = (t.match(/\bTarget="([^"]+)"/) || [])[1];
        if(id && tg && IMG_EXT.test(tg) && !/TargetMode="External"/i.test(t)) rels[id] = tg;
      });
    }
    // bỏ phần dự phòng (mc:Fallback) kẻo 1 ảnh bị đếm 2 lần
    const xml = td.decode(docBytes).replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
    const tokRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\b[^>]*\/>|<w:cr\s*\/>|<w:tab\s*\/>|<(?:a:blip|v:imagedata)\b[^>]*?\b(?:r:embed|r:id)="([^"]+)"[^>]*>/g;

    // --- 1) gom thành dòng sự kiện theo đúng thứ tự trong file ---
    const events = [];
    (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).forEach(p=>{
      let line = '';
      const flush = ()=>{ const t = decodeEntities(line).replace(/\s+/g, ' ').trim(); if(t) events.push({ line: t }); line = ''; };
      let m; tokRe.lastIndex = 0;
      while((m = tokRe.exec(p))){
        if(m[2] !== undefined){ if(rels[m[2]]){ flush(); events.push({ img: rels[m[2]] }); } }
        else if(m[1] !== undefined) line += m[1];
        else if(/^<w:tab/.test(m[0])) line += ' ';
        else flush();
      }
      flush();
    });

    // --- 2) mỗi ảnh = 1 mục; các dòng chữ ngay sau ảnh thuộc về ảnh đó ---
    const items = [];
    let last = null, lastField = null;
    events.forEach(ev=>{
      if(ev.img){
        last = { n: items.length + 1, target: ev.img, code: '', price: '', desc: '', extras: [], labeled: 0 };
        items.push(last); lastField = null; return;
      }
      if(!last) return;                                  // chữ trước ảnh đầu tiên (tiêu đề...) -> bỏ qua
      const text = ev.line, ci = text.search(/[:：]/);
      const f = ci > 0 ? fieldOfLabel(text.slice(0, ci)) : null;
      if(f){
        const v = text.slice(ci + 1).trim();
        last[f] = last[f] ? last[f] + ' ' + v : v; last.labeled++; lastField = f;
      } else if(last.labeled === 0){                      // dòng không có nhãn: gán theo thứ tự mã -> giá -> ghi chú
        const slot = !last.code ? 'code' : !last.price ? 'price' : 'desc';
        last[slot] = last[slot] ? last[slot] + ' ' + text : text; lastField = slot;
      } else if(lastField === 'desc'){ last.desc += ' ' + text; }
      else last.extras.push(text);
    });

    // --- 3) lấy dữ liệu ảnh ---
    const cache = new Map();
    for(let i = 0; i < items.length; i++){
      const it = items[i];
      it.code = normCode(it.code); it.price = it.price.replace(/\s+/g, ' ').trim(); it.desc = it.desc.replace(/\s+/g, ' ').trim();
      let path = it.target.replace(/^\/+/, '');
      path = path.indexOf('word/') === 0 ? path : 'word/' + path;
      const parts = []; path.split('/').forEach(s=>{ if(s === '..') parts.pop(); else if(s !== '.') parts.push(s); }); path = parts.join('/');
      it.ext = (path.split('.').pop() || 'jpg').toLowerCase();
      try{
        if(!cache.has(path)) cache.set(path, await zip.read(path));
        it.bytes = cache.get(path);
        if(!it.bytes) it.err = 'Không tìm thấy ảnh trong file Word.'; else it.hash = hashBytes(it.bytes);
      }catch(e){ it.err = 'Không đọc được ảnh: ' + (e && e.message || e); }
      if(onProgress) onProgress(i + 1, items.length);
    }
    return { items };
  }

  // ================= 2. Hiểu giá viết tắt (100k, 1m3, 1m650, 2350k, 550...) =================
  // Chỉ để HIỂN THỊ gợi ý và soát lỗi; trang vẫn lưu đúng nguyên văn giá trong file Word.
  function parsePrice(raw){
    const s = String(raw || '').toLowerCase().trim();
    const m = s.match(/^(\d+(?:[.,]\d+)*)\s*(triệu|trieu|tr|m|nghìn|nghin|ngàn|ngan|k|vnđ|vnd|đ|d)?(?![a-zà-ỹ])\s*(\d+)?/);
    if(!m) return null;
    let n;
    if(/^\d{1,3}([.,]\d{3})+$/.test(m[1])) n = parseInt(m[1].replace(/[.,]/g, ''), 10);
    else n = parseFloat(m[1].replace(',', '.'));
    const u = m[2] || '';
    const mult = /^(triệu|trieu|tr|m)$/.test(u) ? 1e6 : /^(nghìn|nghin|ngàn|ngan|k)$/.test(u) ? 1e3 : 1;
    let value = n * mult;
    if(m[3] && mult > 1) value += Number('0.' + m[3]) * mult;
    let assumed = false;
    if(!u && n > 0 && n < 10000){ value = n * 1000; assumed = true; }   // "1150", "550" không ghi đơn vị -> hiểu là nghìn đồng
    return { value: Math.round(value), assumed };
  }
  const fmtVnd = v => v.toLocaleString('vi-VN') + 'đ';

  const api = { parseDocx, parsePrice, normCode, compactCode };
  root.WordImport = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(typeof document === 'undefined') return;     // chạy ngoài trình duyệt (kiểm thử) thì dừng ở đây

  // ================= 3. Giao diện =================
  const esc = s => (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CODE_OK = /^\d+(?:\/\d+)+$/;   // số/số/số/... : từ 2 số trở lên, cách nhau bằng dấu /
  const withTO = (p, ms)=> Promise.race([p, new Promise(r=>setTimeout(()=>r(null), ms))]);
  const checkedOnServer = new Set();

  function injectCss(){
    if(document.getElementById('wiCss')) return;
    const st = document.createElement('style'); st.id = 'wiCss';
    st.textContent = `
    .wi-modal{max-width:820px}
    .wi-drop{display:block;width:100%;padding:34px 14px;border:2px dashed var(--line);border-radius:12px;background:transparent;color:var(--ink);font-size:14px;line-height:1.6;text-align:center;cursor:pointer}
    .wi-drop.drag,.wi-drop:hover{border-color:var(--edit);color:var(--edit)}
    .wi-help{font-size:12px;color:var(--sub);line-height:1.55;margin:10px 0 0}
    .wi-bar{height:8px;border-radius:99px;background:var(--line-soft);overflow:hidden;margin:14px 0 6px}
    .wi-bar i{display:block;height:100%;width:0;background:var(--edit);transition:width .15s}
    .wi-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 10px}
    .wi-top .wi-sum{flex:1 1 220px;font-size:13px;color:var(--sub);line-height:1.5}
    .wi-btn{font-family:var(--ff-body);padding:9px 13px;border:var(--bw,1px) solid var(--line);border-radius:var(--r-m,10px);background:transparent;color:var(--ink);font-weight:600;font-size:13px;cursor:pointer}
    .wi-btn:hover{border-color:var(--edit);color:var(--edit)}
    .wi-btn.main{background:var(--c-btn-bg,var(--accent));color:var(--c-btn-ink,var(--accent-ink));border-color:var(--c-btn-line,var(--accent))}
    .wi-btn.main:hover{opacity:.9;color:var(--c-btn-ink,var(--accent-ink))}
    .wi-btn:disabled{opacity:.5;cursor:default}
    .wi-report{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:0 0 12px;font-size:13px;background:var(--card)}
    .wi-report h4{margin:0 0 6px;font-size:13px}
    .wi-report .wi-cnt{display:flex;gap:12px;flex-wrap:wrap;font-weight:700;margin-bottom:6px}
    .wi-report ul{list-style:none;margin:0;padding:0;max-height:170px;overflow:auto}
    .wi-report li{padding:4px 2px;border-top:1px solid var(--line-soft);cursor:pointer;line-height:1.45}
    .wi-report li:hover{background:var(--line-soft)}
    .wi-e{color:var(--danger)} .wi-w{color:#c27c00} .wi-g{color:var(--ok)}
    :root[data-theme="dark"] .wi-w{color:#ffb84d}
    .wi-list{display:flex;flex-direction:column;gap:10px}
    .wi-row{display:grid;grid-template-columns:30px 92px 1fr auto;gap:10px;align-items:start;padding:10px;border:var(--bw,1px) solid var(--line);border-radius:12px;background:var(--card)}
    .wi-row.err{border-color:var(--danger)} .wi-row.warn{border-color:#d98c00} .wi-row.ok{border-color:var(--ok)}
    .wi-row.flash{animation:wiFlash 1.2s ease}
    @keyframes wiFlash{0%,60%{box-shadow:0 0 0 3px var(--edit)}100%{box-shadow:none}}
    .wi-row.gone{display:none}
    .wi-n{font-size:12px;font-weight:700;color:var(--sub);padding-top:6px}
    .wi-img{width:92px;height:122px;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:var(--line-soft);cursor:zoom-in}
    .wi-fields{display:flex;flex-direction:column;gap:6px;min-width:0}
    .wi-fields input{width:100%;padding:8px 10px!important;font-size:13px!important}
    .wi-fields input.bad{border-color:var(--danger)!important}
    .wi-hint{font-size:11.5px;color:var(--sub)}
    .wi-dupbox{min-width:0}
    .wi-dupbox .dupbox{margin:6px 0 0}
    .wi-dupbox .duprow.wi-same img{cursor:default}
    .wi-msgs{font-size:12px;line-height:1.45}
    .wi-msgs div{margin-top:2px}
    .wi-side{display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:170px}
    .wi-badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
    .wi-side select{width:auto!important;max-width:170px;padding:6px 8px!important;font-size:12px!important}
    .wi-del{border:none;background:none;color:var(--sub);font-size:12px;text-decoration:underline;cursor:pointer;padding:2px}
    .wi-del:hover{color:var(--danger)}
    @media (max-width:640px){
      .wi-row{grid-template-columns:70px 1fr;}
      .wi-n{display:none}
      .wi-img{width:70px;height:94px}
      .wi-side{grid-column:1/-1;flex-direction:row;flex-wrap:wrap;align-items:center;max-width:none}
    }`;
    document.head.appendChild(st);
  }

  function mimeOf(ext){ return MIME[ext] || 'image/jpeg'; }
  function viewImage(url){
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.style.zIndex = 70;
    ov.innerHTML = '<img src="' + url + '" alt="" style="max-width:100%;max-height:92vh;border-radius:10px;cursor:zoom-out">';
    ov.onclick = ()=>ov.remove(); document.body.appendChild(ov);
  }
  function toast(o){ if(typeof showToast === 'function') showToast(o); }

  root.openWordImportModal = function openWordImportModal(){
    if(typeof isViewer === 'function' && isViewer()) return;
    if(document.querySelector('.overlay[data-kind="wordimport"]')) return;
    injectCss();
    let items = [];          // mỗi mục: {n, code, price, desc, blob, url, hash, extras, err, removed, dupAction, msgs, level, cmp}
    let fileName = '', analyzed = false, busy = false, serverChk = Promise.resolve(), dupT = null, chgT = null;

    const ov = document.createElement('div'); ov.className = 'overlay'; ov.dataset.kind = 'wordimport';
    ov.innerHTML = `<div class="modal wi-modal">
      <button class="close-x" type="button">✕</button>
      <h3>Nhập kho acc từ file Word</h3>
      <div id="wiStepPick">
        <input type="file" id="wiFile" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hide">
        <button type="button" id="wiDrop" class="wi-drop">📄 Chọn file Word (.docx) · hoặc kéo thả file vào đây<br><span style="font-size:12px;color:var(--sub)">Mỗi trang: 1 ảnh, bên dưới lần lượt là Mã acc · Giá · Tên (ghi chú)</span></button>
        <div id="wiProg" class="hide"><div class="wi-bar"><i id="wiProgBar"></i></div><div id="wiProgTxt" class="wi-help"></div></div>
        <div id="wiPickErr" class="fielderr" style="margin-top:10px"></div>
        <p class="wi-help">Web tự lấy ảnh, mã, giá, tên rồi hiện ra ngay để bạn xem. Chưa có gì được lưu cho tới khi bạn bấm <b>Lưu tất cả</b>. Bấm <b>Phân tích nhanh</b> để kiểm tra lỗi trước khi lưu.</p>
      </div>
      <div id="wiStepList" class="hide">
        <div class="wi-top"><div class="wi-sum" id="wiSum"></div>
          <button type="button" class="wi-btn" id="wiOther">Chọn file khác</button>
          <button type="button" class="wi-btn main" id="wiAnalyze">🔍 Phân tích nhanh</button></div>
        <div id="wiReport" class="wi-report hide"></div>
        <div id="wiRows" class="wi-list"></div>
        <div class="rowbtn"><button type="button" id="wiCancel">Hủy</button><button type="button" id="wiSave" class="primary">Lưu tất cả</button></div>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s);
    const close = ()=>{ items.forEach(it=>{ try{ URL.revokeObjectURL(it.url); }catch(e){} }); ov.remove(); };
    $('.close-x').onclick = close;
    $('#wiCancel').onclick = close;

    // ---------- chọn file ----------
    const fileIn = $('#wiFile'), drop = $('#wiDrop');
    drop.onclick = ()=> fileIn.click();
    fileIn.onchange = ()=>{ if(fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ''; };
    ov.addEventListener('dragover', e=>{ if(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0){ e.preventDefault(); drop.classList.add('drag'); } });
    ov.addEventListener('dragleave', e=>{ if(!e.relatedTarget || !ov.contains(e.relatedTarget)) drop.classList.remove('drag'); });
    ov.addEventListener('drop', e=>{
      if(!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); drop.classList.remove('drag');
      const f = Array.from(e.dataTransfer.files).find(x=>/\.docx$/i.test(x.name));
      if(f) loadFile(f); else $('#wiPickErr').textContent = 'Chỉ nhận file Word đuôi .docx (nếu là .doc cũ, hãy mở bằng Word rồi Lưu thành .docx).';
    });
    $('#wiOther').onclick = ()=>{
      items.forEach(it=>{ try{ URL.revokeObjectURL(it.url); }catch(e){} });
      items = []; analyzed = false; $('#wiStepList').classList.add('hide'); $('#wiStepPick').classList.remove('hide'); $('#wiProg').classList.add('hide'); fileIn.click();
    };

    async function loadFile(file){
      $('#wiPickErr').textContent = '';
      if(!/\.docx$/i.test(file.name)){ $('#wiPickErr').textContent = 'Chỉ nhận file Word đuôi .docx (nếu là .doc cũ, hãy mở bằng Word rồi Lưu thành .docx).'; return; }
      const prog = $('#wiProg'), bar = $('#wiProgBar'), txt = $('#wiProgTxt');
      prog.classList.remove('hide'); bar.style.width = '4%'; txt.textContent = 'Đang mở file Word…';
      try{
        const buf = await file.arrayBuffer();
        const res = await parseDocx(buf, (d, t)=>{ bar.style.width = Math.max(4, Math.round(d / t * 100)) + '%'; txt.textContent = 'Đang lấy ảnh và chữ… ' + d + '/' + t; });
        if(!res.items.length){ prog.classList.add('hide'); $('#wiPickErr').textContent = 'Không thấy ảnh nào trong file Word này.'; return; }
        fileName = file.name;
        items = res.items.map(it=>{
          const o = { n: it.n, code: it.code, price: it.price, desc: it.desc, extras: it.extras, hash: it.hash, err: it.err || '', removed: false, dupAction: 'skip', msgs: [], level: '', cmp: null };
          if(it.bytes){ o.blob = new Blob([it.bytes], { type: mimeOf(it.ext) }); o.url = URL.createObjectURL(o.blob); o.ext = it.ext; }
          return o;
        });
        analyzed = false;
        startCompress();
        $('#wiStepPick').classList.add('hide'); $('#wiStepList').classList.remove('hide');
        renderRows(); updateSummary(); $('#wiReport').classList.add('hide');
        refreshDups(); serverChk = serverDupCheck();      // trùng mã -> hiện ngay thông tin acc trùng (Sửa / Xóa được), không cần bấm Phân tích
        toast({ title: 'Đã đọc xong file Word', message: 'Lấy được ' + items.length + ' ảnh kèm mã, giá, ghi chú. Bấm “Phân tích nhanh” để kiểm tra lỗi, rồi “Lưu tất cả”.' });
      }catch(e){
        console.error(e); prog.classList.add('hide');
        $('#wiPickErr').textContent = 'Không đọc được file: ' + (e && e.message || e);
      }
    }

    // Nén sẵn ảnh trong luồng riêng (Web Worker của SaveQueue) -> bấm Lưu là có ngay, đồng thời dùng để kiểm tra ảnh hỏng.
    function startCompress(){
      items.forEach(it=>{
        if(!it.blob || typeof compressCached !== 'function') return;
        it.cmp = compressCached(it.blob);
        it.cmp.then(v=>{ it.cmpLen = (v || '').length; }).catch(e=>{ it.cmpErr = (e && e.message) || 'không giải mã được'; });
      });
    }

    // ---------- danh sách ----------
    function rowHtml(it, i){
      return `<div class="wi-row" data-i="${i}">
        <div class="wi-n">#${it.n}</div>
        ${it.url ? `<img class="wi-img" src="${it.url}" alt="Ảnh ${it.n}" loading="lazy" decoding="async">` : '<div class="wi-img" style="display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--danger)">Không có ảnh</div>'}
        <div class="wi-fields">
          <input class="wi-code" placeholder="Mã acc (vd 12/205)" value="${esc(it.code)}" autocomplete="off">
          <input class="wi-price" placeholder="Giá" value="${esc(it.price)}" autocomplete="off">
          <input class="wi-desc" placeholder="Ghi chú (tên)" value="${esc(it.desc)}" autocomplete="off">
          <div class="wi-hint"></div>
          <div class="wi-msgs"></div>
          <div class="wi-dupbox"></div>
        </div>
        <div class="wi-side"><span class="wi-badge hide"></span><span class="wi-dupwrap"></span><button type="button" class="wi-del">Bỏ ảnh này</button></div>
      </div>`;
    }
    const rowEl = i => $('#wiRows').querySelector('.wi-row[data-i="' + i + '"]');
    function renderRows(){
      $('#wiRows').innerHTML = items.map(rowHtml).join('');
      items.forEach((it, i)=>{
        const r = rowEl(i);
        const code = r.querySelector('.wi-code'), price = r.querySelector('.wi-price'), desc = r.querySelector('.wi-desc');
        const onEdit = ()=>{
          it.code = normCode(code.value); it.price = price.value.replace(/\s+/g, ' ').trim(); it.desc = desc.value.replace(/\s+/g, ' ').trim();
          paintHint(i); if(analyzed) scheduleQuick(); else { paintEmpty(i); scheduleDup(); } updateSummary();
        };
        [code, price, desc].forEach(inp=>{ inp.oninput = onEdit; });
        code.onblur = ()=>{ code.value = it.code; };      // gõ "58 / 81" -> tự gọn thành "58/81"
        r.querySelector('.wi-img').onclick = ()=>{ if(it.url) viewImage(it.url); };
        r.querySelector('.wi-del').onclick = ()=>{ it.removed = true; r.classList.add('gone'); if(analyzed) scheduleQuick(); else refreshDups(); updateSummary(); };
        paintHint(i); paintEmpty(i);
      });
    }
    function paintHint(i){
      const it = items[i], r = rowEl(i); if(!r) return;
      const h = r.querySelector('.wi-hint'), p = it.price ? parsePrice(it.price) : null;
      h.textContent = p ? ('Giá hiểu là ≈ ' + fmtVnd(p.value) + (p.assumed ? ' (không ghi đơn vị, hiểu là nghìn đồng)' : '')) : '';
    }
    function paintEmpty(i){      // ô trống tô đỏ ngay (như trang thêm nhiều ảnh), chưa cần bấm phân tích
      const it = items[i], r = rowEl(i); if(!r) return;
      r.querySelector('.wi-code').classList.toggle('bad', !it.code);
      r.querySelector('.wi-price').classList.toggle('bad', !it.price);
      r.querySelector('.wi-desc').classList.toggle('bad', !it.desc);
    }
    const liveItems = ()=> items.filter(x=>!x.removed);
    function updateSummary(){
      const n = liveItems().length;
      $('#wiSum').innerHTML = 'Từ file <b>' + esc(fileName) + '</b>: ' + n + ' acc' + (n !== items.length ? ' (đã bỏ ' + (items.length - n) + ')' : '') + '. Ảnh, mã, giá, ghi chú đã điền sẵn — sửa trực tiếp nếu cần.';
      const willSave = liveItems().filter(x=>!(x.level === 'err') && !(x.dupAction === 'skip' && x.dupKind)).length;
      $('#wiSave').textContent = 'Lưu tất cả (' + (analyzed ? willSave : n) + ')';
    }

    // ---------- phân tích ----------
    let quickT = null;
    function scheduleQuick(){ clearTimeout(quickT); quickT = setTimeout(()=>{ quickChecks(); paintResults(); }, 250); }

    function existingDups(code){
      const k = compactCode(code); if(!k || typeof accounts === 'undefined') return [];
      return accounts.filter(a=>a && !a.deletedAt && !a.sold && compactCode(a.code) === k && (typeof isSettingsDoc !== 'function' || !isSettingsDoc(a.id)));
    }
    // Tìm trùng mã (không cần mạng): với acc đang có trong kho (it.dupInfo = danh sách acc cũ) và trùng nhau trong cùng file.
    function computeDups(){
      const byCode = new Map();
      items.forEach(it=>{ it.dupKind = ''; it.dupInfo = null; it._grp = null; });
      liveItems().forEach(it=>{
        const k = compactCode(it.code);
        if(k && CODE_OK.test(it.code)){ (byCode.get(k) || byCode.set(k, []).get(k)).push(it); }
      });
      byCode.forEach(list=>{
        const old = existingDups(list[0].code);
        list.forEach((it, idx)=>{
          it._grp = list;
          if(old.length){ it.dupKind = 'old'; it.dupInfo = old; }
          else if(idx > 0){ it.dupKind = 'batch'; it.dupInfo = list[0]; }
        });
      });
    }
    // Kiểm tra nhanh (không cần mạng): ghi kết quả vào it.msgs / it.level
    function quickChecks(){
      const live = liveItems(), byHash = new Map();
      items.forEach(it=>{ it.msgs = []; it.level = ''; });
      computeDups();
      const add = (it, lv, text)=>{ it.msgs.push({ lv, text }); if(lv === 'err' || (lv === 'warn' && it.level !== 'err')) it.level = lv; };
      live.forEach(it=>{ if(it.hash){ (byHash.get(it.hash) || byHash.set(it.hash, []).get(it.hash)).push(it); } });
      live.forEach(it=>{
        // ảnh
        if(it.err) add(it, 'err', it.err);
        else if(it.cmpErr) add(it, 'err', 'Ảnh lỗi / định dạng trình duyệt không đọc được (' + it.cmpErr + ').');
        else if(it.cmpLen > 760000) add(it, 'warn', 'Ảnh sau khi nén còn khá nặng (' + Math.round(it.cmpLen / 1024) + ' KB) — tốn dung lượng.');
        // mã
        if(!it.code) add(it, 'err', 'Thiếu mã acc.');
        else if(!CODE_OK.test(it.code)) add(it, 'err', 'Mã “' + it.code + '” sai dạng — cần dạng số/số/số… (các số cách nhau bằng dấu /), vd 12/205 hoặc 12/205/3 (trong Word có thể ghi “không thấy rõ”).');
        else {
          const nums = it.code.split('/').map(Number);
          if(nums.some(n => n === 0)) add(it, 'warn', 'Mã ' + it.code + ' có số khác thường — kiểm tra lại cho chắc.');
        }
        // giá
        if(!it.price) add(it, 'err', 'Thiếu giá.');
        else {
          const p = parsePrice(it.price);
          if(!p || !p.value) add(it, 'err', 'Giá “' + it.price + '” không có số nào đọc được.');
          else {
            if(p.assumed) add(it, 'warn', 'Giá “' + it.price + '” không ghi đơn vị — đang hiểu là ' + fmtVnd(p.value) + '.');
            if(p.value < 10000 || p.value > 200000000) add(it, 'warn', 'Giá ' + fmtVnd(p.value) + ' có vẻ bất thường.');
          }
        }
        // ghi chú
        if(!it.desc) add(it, 'err', 'Thiếu ghi chú (tên).');
        else if(/\d/.test(it.desc)) add(it, 'warn', 'Ghi chú “' + it.desc + '” có chữ số — tên thường không có số, kiểm tra lại.');
        if(it.extras && it.extras.length) add(it, 'warn', 'Có dòng chữ không rõ thuộc mục nào: “' + it.extras.join(' / ') + '” (sẽ không được lưu).');
        // trùng ảnh trong file
        const hs = it.hash && byHash.get(it.hash);
        if(hs && hs.length > 1) add(it, 'warn', 'Ảnh giống hệt ảnh #' + hs.filter(x=>x !== it).map(x=>x.n).join(', #') + ' trong file.');
        // trùng mã
        if(it.dupKind === 'old'){
          const old = it.dupInfo;
          add(it, 'warn', 'Mã ' + it.code + ' đã có ' + old.length + ' acc trong kho' + (old[0].price ? ' (giá ' + old[0].price + ')' : '') + '.');
        } else if(it.dupKind === 'batch'){
          add(it, 'warn', 'Trùng mã với ảnh #' + it.dupInfo.n + ' ngay trong file Word.');
        } else if(it._grp && it._grp.length > 1){
          add(it, 'warn', 'Mã này bị lặp ở ảnh #' + it._grp.slice(1).map(x=>x.n).join(', #') + ' trong file.');
        }
      });
    }

    // ---------- hiện thông tin acc trùng ngay trong dòng (Sửa / Xóa được) ----------
    function dupSig(it){
      if(it.removed) return '';
      if(it.dupKind === 'old') return 'o:' + it.dupInfo.map(a=>[a.id, a.code, a.price, a.desc, (a.imageUrl || '').length, a.addedAt].join('~')).join('|');
      if(it.dupKind === 'batch') return 'b:' + it.dupInfo.n + ':' + it.dupInfo.code + ':' + it.dupInfo.price + ':' + it.dupInfo.desc;
      return '';
    }
    function paintDupBox(i){
      const it = items[i], r = rowEl(i); if(!r) return;
      const box = r.querySelector('.wi-dupbox'), sig = dupSig(it);
      if(box._sig === sig) return; box._sig = sig;       // không đổi thì khỏi vẽ lại (tránh nháy ảnh)
      if(!sig){ box.innerHTML = ''; return; }
      if(it.dupKind === 'old' && typeof dupRowsHtml === 'function'){
        box.innerHTML = '<div class="dupbox on"><div class="dupbox-h">⚠ Mã "' + esc(it.code) + '" đã có ' + it.dupInfo.length + ' acc trong kho — Sửa hoặc Xóa ngay tại đây:</div>' + dupRowsHtml(it.dupInfo) + '</div>';
        if(typeof bindDupRows === 'function') bindDupRows(box);
      } else if(it.dupKind === 'batch'){
        const o = it.dupInfo;
        box.innerHTML = '<div class="dupbox on"><div class="dupbox-h">⚠ Trùng mã với ảnh #' + o.n + ' trong cùng file Word:</div>' +
          '<div class="duprow wi-same">' + (o.url ? '<img src="' + o.url + '" alt="">' : '<div class="dupnoimg">—</div>') +
          '<div class="dupinfo"><span class="code tag">' + esc(o.code) + '</span><div class="price">' + esc(o.price) + '</div><div class="rsmall">' + esc(o.desc) + '</div><div class="rsmall">Ảnh #' + o.n + ' trong file</div></div>' +
          '<div class="dupacts"><button type="button" class="edit" data-wijump="' + o.n + '">Tới ảnh #' + o.n + '</button></div></div></div>';
        const jb = box.querySelector('[data-wijump]'); if(jb) jb.onclick = ()=> jumpTo(Number(jb.dataset.wijump));
      }
    }
    // Lựa chọn khi trùng mã (giữ cũ / dùng mới / giữ cả hai)
    function paintDupSelect(i){
      const it = items[i], r = rowEl(i); if(!r) return;
      const dw = r.querySelector('.wi-dupwrap');
      if(it.removed || !it.dupKind){ dw.innerHTML = ''; dw._sig = ''; return; }
      const opts = it.dupKind === 'old'
        ? [['skip', 'Bỏ ảnh mới · giữ acc cũ'], ['replace', 'Dùng ảnh mới · acc cũ vào thùng rác'], ['both', 'Giữ cả hai']]
        : [['skip', 'Bỏ ảnh này'], ['both', 'Giữ cả hai']];
      const sig = it.dupKind + it.dupAction;
      if(dw._sig === sig) return; dw._sig = sig;
      dw.innerHTML = '<select class="wi-dup">' + opts.map(o=>'<option value="' + o[0] + '"' + (it.dupAction === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
      dw.querySelector('select').onchange = e=>{ it.dupAction = e.target.value; dw._sig = it.dupKind + it.dupAction; updateSummary(); };
    }
    // Tìm trùng + vẽ khung acc trùng cho mọi dòng (chạy ngay khi mở file, không cần bấm Phân tích)
    function refreshDups(){
      if(!ov.isConnected || !items.length) return;
      if(analyzed){ quickChecks(); paintResults(); return; }
      computeDups();
      items.forEach((it, i)=>{ paintDupBox(i); paintDupSelect(i); });
    }
    function scheduleDup(){ clearTimeout(dupT); dupT = setTimeout(()=>{ refreshDups(); serverChk = serverDupCheck(); }, 350); }
    // Hỏi máy chủ xem có acc cũ (chưa kịp tải về) trùng mã không -> chạy nền, xong thì cập nhật lại khung trùng.
    async function serverDupCheck(){
      if(typeof ensureNoOldDup !== 'function' || (typeof oldLoaded !== 'undefined' && oldLoaded)) return;
      const codes = [];
      liveItems().forEach(it=>{
        if(!CODE_OK.test(it.code) || checkedOnServer.has(compactCode(it.code))) return;
        checkedOnServer.add(compactCode(it.code));
        codes.push(it.code, it.code.replace(/\//g, ' / '));
      });
      if(codes.length) await withTO(ensureNoOldDup(codes).catch(()=>{}), 20000);
      refreshDups();
    }
    // Sửa / Xóa acc trùng xong (hoặc dữ liệu kho đổi) -> danh sách trùng tự cập nhật
    const onChanged = ()=>{
      if(!ov.isConnected){ document.removeEventListener('acc:changed', onChanged); return; }
      clearTimeout(chgT); chgT = setTimeout(refreshDups, 150);
    };
    document.addEventListener('acc:changed', onChanged);
    function paintResults(){
      items.forEach((it, i)=>{
        const r = rowEl(i); if(!r) return;
        r.classList.remove('err', 'warn', 'ok');
        const badge = r.querySelector('.wi-badge'), msgs = r.querySelector('.wi-msgs');
        paintEmpty(i);
        if(it.removed){ return; }
        const lv = it.level || 'ok';
        r.classList.add(lv);
        badge.classList.remove('hide', 'wi-e', 'wi-w', 'wi-g');
        badge.classList.add(lv === 'err' ? 'wi-e' : lv === 'warn' ? 'wi-w' : 'wi-g');
        badge.textContent = lv === 'err' ? '❌ Lỗi' : lv === 'warn' ? '⚠ Cần xem' : '✓ Ổn';
        msgs.innerHTML = it.msgs.map(m=>'<div class="' + (m.lv === 'err' ? 'wi-e' : 'wi-w') + '">' + (m.lv === 'err' ? '❌ ' : '⚠ ') + esc(m.text) + '</div>').join('');
        paintDupBox(i); paintDupSelect(i);
      });
      renderReport(); updateSummary();
    }
    function renderReport(){
      const live = liveItems(), e = live.filter(x=>x.level === 'err').length, w = live.filter(x=>x.level === 'warn').length, ok = live.length - e - w;
      const box = $('#wiReport'); box.classList.remove('hide');
      const list = [];
      live.forEach(it=>it.msgs.forEach(m=>list.push({ it, m })));
      list.sort((a, b)=> (a.m.lv === 'err' ? 0 : 1) - (b.m.lv === 'err' ? 0 : 1) || a.it.n - b.it.n);
      box.innerHTML = '<h4>Kết quả phân tích nhanh</h4><div class="wi-cnt"><span class="wi-g">✓ Ổn: ' + ok + '</span><span class="wi-w">⚠ Cần xem: ' + w + '</span><span class="wi-e">❌ Lỗi: ' + e + '</span></div>' +
        (list.length
          ? '<ul>' + list.map(x=>'<li data-n="' + x.it.n + '" class="' + (x.m.lv === 'err' ? 'wi-e' : 'wi-w') + '"><b>#' + x.it.n + '</b>' + (x.it.code ? ' · ' + esc(x.it.code) : '') + ' — ' + esc(x.m.text) + '</li>').join('') + '</ul>'
          : '<div class="wi-g">Không phát hiện lỗi nào — có thể bấm Lưu tất cả.</div>') +
        (e ? '<div class="wi-help"><b>Có lỗi ❌ thì chưa lưu được.</b> Sửa trực tiếp ở ô tương ứng (hoặc bấm “Bỏ ảnh này”) rồi bấm Lưu tất cả. Mục ⚠ không chặn việc lưu.</div>' : '');
      box.querySelectorAll('li[data-n]').forEach(li=> li.onclick = ()=> jumpTo(Number(li.dataset.n)));
    }
    function jumpTo(n){
      const i = items.findIndex(x=>x.n === n), r = i >= 0 && rowEl(i); if(!r) return;
      r.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
    }

    async function analyzeAll(){
      if(busy) return false; busy = true;
      const btn = $('#wiAnalyze'), old = btn.textContent; btn.disabled = true; $('#wiSave').disabled = true; btn.textContent = '⏳ Đang phân tích…';
      try{
        await withTO(serverChk, 20000);               // kiểm tra nền lúc mở file (nếu còn đang chạy)
        // đối chiếu với kho trên máy chủ (acc cũ chưa tải về hết) — chỉ hỏi những mã chưa hỏi lần nào
        if(typeof ensureNoOldDup === 'function'){
          const codes = [];
          liveItems().forEach(it=>{
            if(!CODE_OK.test(it.code) || checkedOnServer.has(compactCode(it.code))) return;
            checkedOnServer.add(compactCode(it.code));
            codes.push(it.code, it.code.replace(/\//g, ' / '));
          });
          if(codes.length) await withTO(ensureNoOldDup(codes).catch(()=>{}), 20000);
        }
        // đợi nén ảnh xong để biết ảnh nào hỏng
        await Promise.all(liveItems().map(it=> it.cmp ? it.cmp.catch(()=>{}) : null));
        analyzed = true; quickChecks(); paintResults();
      } finally { busy = false; btn.disabled = false; btn.textContent = old; $('#wiSave').disabled = false; }
      return true;
    }
    $('#wiAnalyze').onclick = async ()=>{
      await analyzeAll();
      const e = liveItems().filter(x=>x.level === 'err').length, w = liveItems().filter(x=>x.level === 'warn').length;
      toast({ title: e ? 'Phát hiện ' + e + ' acc có lỗi' : (w ? 'Không có lỗi nặng, ' + w + ' acc cần xem' : 'Không phát hiện lỗi nào'), message: e ? 'Xem danh sách ở đầu cửa sổ, bấm vào từng dòng để nhảy tới acc đó.' : 'Bấm “Lưu tất cả” để lưu vào trang.', variant: e ? 'error' : undefined });
      const rp = $('#wiReport'); if(rp && rp.scrollIntoView) rp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    // ---------- Lưu tất cả ----------
    $('#wiSave').onclick = async ()=>{
      if(busy || !liveItems().length) return;
      await analyzeAll();                            // luôn soát lại ngay trước khi lưu
      const errs = liveItems().filter(x=>x.level === 'err');
      if(errs.length){
        toast({ title: 'Chưa lưu — còn ' + errs.length + ' acc lỗi', message: 'Sửa các ô đỏ (hoặc bấm “Bỏ ảnh này”) rồi bấm Lưu tất cả lại.', variant: 'error' });
        jumpTo(errs[0].n); return;
      }
      // chốt danh sách việc cần lưu
      const jobs = [], replaceOld = new Map(); let skipped = 0;
      liveItems().forEach(it=>{
        if(it.dupKind && it.dupAction === 'skip'){ skipped++; return; }
        if(it.dupKind === 'old' && it.dupAction === 'replace') replaceOld.set(it.n, it.dupInfo);
        jobs.push(it);
      });
      if(!jobs.length){ toast({ title: 'Không có acc nào để lưu', message: 'Tất cả đều đang được đặt “bỏ vì trùng mã”.', variant: 'error' }); return; }
      const mk = (typeof markupFields === 'function') ? markupFields(0, []) : {};   // nhập từ Word: không đề xuất giá tăng (giá tăng = không có); phần "chờ duyệt giá" do priceApproval:'pending' bên dưới đảm nhiệm
      const batchIds = new Set();
      ov.remove();                                    // đóng cửa sổ ngay; việc lưu chạy ở hàng đợi độc lập (nhãn nhỏ ở đáy màn hình)
      let replaced = 0, late = 0;
      const grp = SaveQueue.group(jobs.length, ({ ok, fail })=>{
        renderHome(); renderAll(); renderTrash();
        toast({ title: 'Hoàn tất nhập từ Word', message: 'Đã lưu ' + ok + ' acc' + (fail ? ', ' + fail + ' acc lỗi/bị hủy' : '') + (replaced ? ', ' + replaced + ' acc cũ chuyển vào thùng rác' : '') + (skipped ? ', bỏ qua ' + skipped + ' ảnh trùng mã' : '') + '.', variant: fail ? 'error' : undefined });
        if(late) toast({ title: '⚠ Có ' + late + ' acc trùng mã với acc cũ', message: 'Đã lưu nhưng trùng mã (acc cũ chưa tải xong lúc nhập). Đã viền đỏ — bấm vào đây để xem danh sách trùng.', variant: 'error', sticky: true, onClick: ()=>{ switchTab('history'); } });
        checkDupAlerts();
        items.forEach(it=>{ try{ URL.revokeObjectURL(it.url); }catch(e){} });
      });
      const base = Date.now();
      jobs.forEach((it, k)=>{
        const id = uid(), addedAt = base + k;        // +k giữ đúng thứ tự trong file Word
        it._id = id; batchIds.add(id);
        const oldAccs = replaceOld.get(it.n);
        upsertAcc({ id, code: it.code, price: it.price, desc: it.desc, imageUrl: it.url, addedAt, deletedAt: null, ...mk, priceApproval: 'pending', _src: newAccSrc(), _pending: true });
        SaveQueue.add({
          group: grp, label: 'Mã ' + it.code,
          run: async ()=>{
            const imageUrl = await compressCached(it.blob);
            if(!imageUrl) throw new Error('Ảnh không nén được');
            await ensureNoOldDup(it.code);
            const d2 = findDuplicateByCode(it.code, id);   // trùng với acc cũ vừa tải về: vẫn lưu nhưng báo + viền đỏ
            if(oldAccs && oldAccs.length){
              for(const a of oldAccs){
                if(a.deletedAt) continue;
                await Loader.silent(()=>accCol(a).doc(a.id).update({ deletedAt: Date.now() })).catch(()=>{});
                a.deletedAt = Date.now(); replaced++;
              }
            } else if(d2 && !batchIds.has(d2.id) && !it.dupKind) late++;
            const data = { code: it.code, price: it.price, desc: it.desc, imageUrl, addedAt, deletedAt: null, ...mk, priceApproval: 'pending' };   // acc nhập từ Word: chờ duyệt giá (in vàng, xem price-approval.js)
            const src = await Loader.silent(()=>saveNewAcc(id, data));
            if(!src) throw new Error('Không lưu được (cả hai project đều lỗi hoặc hết hạn mức)');
            return { src, data };
          },
          onRetry: ()=>{ const cur = accounts.find(x=>x.id === id); if(cur){ delete cur._failed; renderHome(); renderAll(); } },
          onDone: ({ src, data })=>{ const cur = accounts.find(x=>x.id === id); if(cur){ Object.assign(cur, data, { _src: src }); delete cur._pending; delete cur._failed; dedupeId(id, cur); } },
          onFail: ()=>{ const k2 = accounts.findIndex(x=>x.id === id); if(k2 >= 0) accounts[k2]._failed = true; }
        });
      });
      renderHome(); renderAll();
    };
  };
})();
