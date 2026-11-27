// ===== LƯU GIAO DIỆN NHANH (tách riêng khỏi theme.js) =====
// Việc của file này: nén ảnh (logo / ảnh nền) và LƯU giao diện lên Firestore thật nhanh.
//  · Bấm Lưu: giao diện được áp dụng + nhớ trên máy NGAY (không chờ mạng), việc ghi Firestore chạy ở nền.
//  · Bấm Lưu liên tục: chỉ ghi bản mới nhất (gộp các lần bấm), không ghi chồng nhiều lần.
//  · Không có thay đổi so với bản đã lưu thì không ghi gì (đỡ tốn lượt ghi miễn phí).
//  · Ghi bằng update() thay vì set(): thay đúng trường "theme", tài liệu chưa có thì tự tạo mới.
//  · Lỗi mạng tự thử lại 1 lần; vẫn lỗi thì báo và GIỮ bản đang chỉnh để bấm Lưu lại. Ctrl+S cũng lưu được.
//  · Không bật vòng xoay phủ toàn màn hình (Loader.silent) vì đã có nhãn trạng thái ngay cạnh nút Lưu.
//  · Nén ảnh dùng createImageBitmap + toBlob (không khoá giao diện như toDataURL nhiều vòng).
(function(){
  'use strict';

  // ---------- Nén ảnh ----------
  async function decode(file){
    if(window.createImageBitmap){ try{ return await createImageBitmap(file); }catch(e){} }
    return await new Promise((res, rej)=>{
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = ()=>{ URL.revokeObjectURL(u); res(im); };
      im.onerror = ()=>{ URL.revokeObjectURL(u); rej(new Error('bad image')); };
      im.src = u;
    });
  }
  const toBlob = (c, type, q)=> new Promise(r=> c.toBlob(r, type, q));
  const readUrl = b => new Promise((res, rej)=>{ const f = new FileReader(); f.onload = ()=> res(f.result); f.onerror = ()=> rej(f.error); f.readAsDataURL(b); });

  // opts: max (cạnh dài tối đa), quality, minQ, limit (độ dài tối đa của chuỗi data:), type, square (cắt vuông ở giữa — dùng cho logo)
  async function compress(file, opts){
    const o = Object.assign({ max:1920, quality:.8, minQ:.5, limit:520000, type:'image/jpeg', square:false }, opts||{});
    const src = await decode(file);
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    let sx = 0, sy = 0, sw = w0, sh = h0;
    if(o.square){ const s = Math.min(w0, h0); sx = (w0-s)/2; sy = (h0-s)/2; sw = sh = s; }
    const lossy = o.type === 'image/jpeg' || o.type === 'image/webp';
    let m = o.max, q = o.quality, out = '';
    for(let n=0; n<10; n++){
      const sc = Math.min(1, m/Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw*sc)); c.height = Math.max(1, Math.round(sh*sc));
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const blob = await toBlob(c, o.type, q);
      if(!blob) throw new Error('encode');
      out = await readUrl(blob);
      if(out.length <= o.limit) break;
      if(lossy && q > o.minQ) q = Math.max(o.minQ, q-.1); else m = Math.round(m*.8);
    }
    if(src.close) src.close();
    if(out.length > o.limit*1.35) throw new Error('too big');
    return out;
  }

  // ---------- Lưu lên Firestore ----------
  let lastJson = '', latest = null, busy = null, state = 'ok';   // state: 'ok' | 'sync' | 'err'
  const quiet = fn => (window.Loader && Loader.silent) ? Loader.silent(fn) : fn();
  const wait = ms => new Promise(r=> setTimeout(r, ms));
  const toast = o => { try{ if(typeof showToast === 'function') showToast(o); }catch(e){} };

  async function write(job){
    const h = job.h, ref = h.db.collection(h.col).doc(h.doc);
    const data = { theme: job.t, settings: true, savedBy: h.who || '', savedAt: Date.now() };
    const go = ()=> quiet(()=> ref.update(data)).catch(e=>{
      if(e && e.code === 'not-found') return quiet(()=> ref.set(data));   // chưa có tài liệu: tạo mới
      throw e;
    });
    try{ await go(); }
    catch(e){ await wait(1200); await go(); }                              // lỗi mạng: thử lại 1 lần
  }

  function flush(){
    if(busy) return busy;                                                  // đang ghi: bản mới nhất sẽ ghi ngay sau đó
    busy = (async ()=>{
      while(latest){
        const job = latest; latest = null;
        state = 'sync'; if(job.h.state) job.h.state('sync');
        try{
          await write(job);
          lastJson = job.json;
          if(!latest){
            state = 'ok'; if(job.h.state) job.h.state('ok');
            toast({ title:'Đã lưu giao diện', message:'Mọi người mở web sẽ thấy giao diện này (máy đang mở sẽ tự cập nhật).' });
          }
        }catch(e){
          console.error('Lưu giao diện lỗi:', e);
          latest = null; state = 'err'; if(job.h.state) job.h.state('err');
          toast({ title:'Chưa lưu được giao diện', message:'Giao diện đã áp dụng trên máy này nhưng chưa lên mạng. Bấm Lưu để thử lại.', variant:'error' });
        }
      }
    })().finally(()=>{ busy = null; });
    return busy;
  }

  // t: giao diện đã normalize. h: { db, col, doc, who, local(), state(s) }
  function save(t, h){
    const json = JSON.stringify(t);
    if(json === lastJson && state === 'ok' && !latest && !busy){ if(h.local) h.local(); if(h.state) h.state('ok'); return Promise.resolve('same'); }
    if(h.local) h.local();                                                 // áp dụng + nhớ trên máy ngay
    latest = { t, json, h };
    return flush();
  }
  function baseline(t){ if(state === 'ok') lastJson = JSON.stringify(t); } // bản vừa đọc từ máy chủ = bản đã lưu

  window.addEventListener('beforeunload', e=>{ if(busy || latest || state === 'err'){ e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e=>{
    if(!(e.ctrlKey || e.metaKey) || e.altKey || (e.key !== 's' && e.key !== 'S')) return;
    const el = document.getElementById('tab-theme');
    if(el && !el.classList.contains('hide') && window.SiteTheme && SiteTheme.save){ e.preventDefault(); SiteTheme.save(); }
  });

  window.ThemeSave = { compress, save, baseline };
})();
