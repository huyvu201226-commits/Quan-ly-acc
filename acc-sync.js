// ===== TẢI DỮ LIỆU ACC ĐỘC LẬP (acc-sync.js) =====
// Tách riêng phần "tải acc từ Firebase" khỏi giao diện để chạy nhanh, bền và dễ thay thế.
// Nạp TRƯỚC script.js. Không phụ thuộc biến nào của script.js — script.js đưa vào những gì cần.
//
// Vì sao trước đây có acc "đã nhập mà không tìm ra":
//   1) Tải 2 ngày gần nhất bị quá hạn/lỗi mạng -> bị bỏ qua êm, và phần tải ngầm chỉ lấy acc CŨ hơn 2 ngày
//      nên acc mới của phiên đó không bao giờ xuất hiện lại.
//   2) Tải ngầm bị lỗi 1 lô là dừng cả project (mất nốt phần còn lại), phải bấm tay mới tải tiếp.
//   3) Acc đang "⏳ Đang lưu…" bị xóa khỏi màn hình khi dữ liệu máy chủ về (đã lưu nhưng không thấy).
//   4) Acc thiếu trường addedAt (kiểu số) không thuộc lô nào nên tải kiểu nào cũng không ra.
// Mỗi lỗi trên đều có cách xử lý ở đây hoặc ở chỗ script.js gọi hàm này.
//
// API (window.AccSync):
//   AccSync.sleep(ms)
//   AccSync.retry(fn, {tries, base})                -> thử lại với thời gian chờ tăng dần (1s, 2s, 4s…)
//   AccSync.fetchRecent(database, col, cutoff, ms)  -> {ok, docs}   (acc có addedAt >= cutoff, có thử lại + giới hạn thời gian)
//   AccSync.pageLoad(opts)                          -> {ok, count, last}   tải theo lô mới -> cũ, lô lỗi tự thử lại, lỗi hẳn thì nhớ chỗ để tải tiếp
//   AccSync.searchRemote(database, col, kw)         -> docs   (tìm trực tiếp trên máy chủ theo tiền tố mã, dùng khi chưa tải xong)
//   AccSync.scanOrphans(opts)                       -> {scanned, found:[…]}  quét theo id tài liệu để tìm acc thiếu addedAt (chạy tay)
(function(){
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function retry(fn, o){
    o = o || {};
    const tries = o.tries || 3, base = o.base || 1000;
    let err;
    for(let i = 0; i < tries; i++){
      try{ return await fn(i); }
      catch(e){
        err = e;
        if(e && /permission-denied|invalid-argument|failed-precondition/i.test(String(e.code||''))) break;   // lỗi cấu hình: thử lại cũng vô ích
        if(i < tries - 1) await sleep(base * Math.pow(2, i));
      }
    }
    throw err;
  }
  function timeout(p, ms){
    let t;
    return Promise.race([
      p.finally(()=> clearTimeout(t)),
      new Promise((_, rej)=>{ t = setTimeout(()=> rej(Object.assign(new Error('timeout'), {code:'timeout'})), ms); })
    ]);
  }
  const bytesOf = d => (d && d.imageUrl ? d.imageUrl.length : 0) + 600;

  // Acc gần đây: lỗi/quá hạn thì thử lại tối đa `tries` lần, vẫn lỗi thì báo ok:false (KHÔNG im lặng trả rỗng như trước).
  async function fetchRecent(database, col, cutoff, ms, tries){
    try{
      const snap = await retry(()=> timeout(database.collection(col).where('addedAt','>=',cutoff).get(), ms || 12000), {tries: tries || 2, base: 800});
      return { ok:true, docs: snap.docs };
    }catch(e){ console.warn('[AccSync] tải acc gần đây lỗi:', e); return { ok:false, docs:[] }; }
  }

  // Tải theo lô, mới -> cũ. upper = null nghĩa là tải TẤT CẢ (dùng khi phần "gần đây" bị lỗi).
  // opts: {database, col, upper, pageSize, maxPage, resume, onBatch(docs), isSettings(id), idle(), tries}
  // Trả {ok, count, last}. Nếu !ok thì truyền lại last vào opts.resume để tải tiếp đúng chỗ dừng.
  async function pageLoad(o){
    let last = o.resume || null, count = 0, page = o.pageSize || 25;
    const maxPage = o.maxPage || 60;
    for(;;){
      let q = o.database.collection(o.col);
      if(o.upper != null) q = q.where('addedAt','<',o.upper);
      q = q.orderBy('addedAt','desc').limit(page);
      if(last) q = q.startAfter(last);
      let snap;
      try{ snap = await retry(()=> timeout(q.get(), 30000), {tries: o.tries || 4, base: 1000}); }
      catch(e){ console.error('[AccSync] lô lỗi, dừng ở chỗ này để tải tiếp sau:', e); return { ok:false, count, last }; }
      if(snap.empty) return { ok:true, count, last };
      const docs = snap.docs.filter(d => !(o.isSettings && o.isSettings(d.id)));
      count += snap.size; last = snap.docs[snap.docs.length - 1];
      if(o.onBatch) o.onBatch(docs);
      if(snap.size < page) return { ok:true, count, last };
      // lô nhẹ thì tăng dần cỡ lô cho nhanh; lô nặng (ảnh to) thì giữ nguyên
      let b = 0; docs.forEach(d => { b += bytesOf(d.data()); });
      if(b < 1200000 && page < maxPage) page = Math.min(maxPage, page + 10);
      if(o.idle) await o.idle(); else await sleep(0);
    }
  }

  // Tìm trực tiếp trên máy chủ theo tiền tố của mã (vd gõ "12/2" ra 12/2, 12/205…). Giới hạn 40 acc.
  async function searchRemote(database, col, kw){
    kw = (kw || '').trim();
    if(!kw || kw.length < 2) return [];
    try{
      const snap = await timeout(database.collection(col).where('code','>=',kw).where('code','<=',kw + '\uf8ff').limit(40).get(), 8000);
      return snap.docs;
    }catch(e){ return []; }
  }

  // Quét theo id tài liệu (không phụ thuộc addedAt) để tìm acc bị sót. Đọc TOÀN BỘ kho nên chỉ chạy khi bấm tay.
  // opts: {database, col, known:Set(id), isSettings, onFound(doc), onProgress(n), pageSize}
  async function scanOrphans(o){
    const FP = root.firebase.firestore.FieldPath;
    let last = null, scanned = 0; const found = [];
    for(;;){
      let q = o.database.collection(o.col).orderBy(FP.documentId()).limit(o.pageSize || 30);
      if(last) q = q.startAfter(last);
      let snap;
      try{ snap = await retry(()=> timeout(q.get(), 30000), {tries:4, base:1000}); }
      catch(e){ return { ok:false, scanned, found }; }
      if(snap.empty) break;
      snap.docs.forEach(d=>{
        if(o.isSettings && o.isSettings(d.id)) return;
        if(o.known && o.known.has(d.id)) return;
        const x = d.data();
        if(!x || (!x.imageUrl && !x.code)) return;      // không giống acc thì bỏ qua
        found.push(d);
        if(o.onFound) o.onFound(d);
      });
      scanned += snap.size; last = snap.docs[snap.docs.length - 1];
      if(o.onProgress) o.onProgress(scanned);
      if(snap.size < (o.pageSize || 30)) break;
      await sleep(30);
    }
    return { ok:true, scanned, found };
  }

  root.AccSync = { sleep, retry, timeout, fetchRecent, pageLoad, searchRemote, scanOrphans };
})();
