// ===== HÀNG ĐỢI LƯU ĐỘC LẬP (save-queue.js) =====
// Tách phần "lưu" khỏi giao diện để bấm Lưu là xong ngay:
//   1) Nén ảnh trong LUỒNG RIÊNG (Web Worker + OffscreenCanvas) -> không đơ trang. Không hỗ trợ thì tự dùng cách cũ.
//   2) Mỗi acc là 1 "việc" trong hàng đợi: tối đa 3 việc chạy cùng lúc, lỗi mạng tự thử lại 1 lần.
//   3) Hiện nhãn nhỏ ở giữa đáy màn hình: "Đang lưu 2 acc…" / "✓ Đã lưu xong" / "⚠ 1 acc lưu lỗi — bấm để thử lại".
//   4) Đóng tab khi còn việc chưa xong thì trình duyệt cảnh báo.
// API:  SaveQueue.compress(blob, fallbackFn) -> Promise<dataUrl>
//       SaveQueue.add({label, run, onDone, onFail, onRetry, group}) ; run() trả Promise; lỗi có e.noRetry thì không thử lại
//       SaveQueue.group(total, onFinish) -> nhóm để biết khi cả đợt xong ; SaveQueue.pending() ; SaveQueue.retryFailed()
(function(){
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CFG = { concurrency: 3, retries: 1, retryDelay: 1500, maxSide: 900, quality: 0.7 };

  // ---------- Nén ảnh trong Web Worker ----------
  const WORKER_SRC = `
    self.onmessage = async (e) => {
      const { id, blob, max, q } = e.data;
      try{
        const bmp = await createImageBitmap(blob);
        let w = bmp.width, h = bmp.height;
        if(w > max || h > max){ if(w > h){ h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
        const oc = new OffscreenCanvas(w, h);
        oc.getContext('2d').drawImage(bmp, 0, 0, w, h);
        if(bmp.close) bmp.close();
        const out = await oc.convertToBlob({ type: 'image/jpeg', quality: q });
        const dataUrl = new FileReaderSync().readAsDataURL(out);
        self.postMessage({ id, dataUrl });
      }catch(err){ self.postMessage({ id, error: String(err && err.message || err) }); }
    };`;
  let worker = null, workerBroken = false, seq = 0;
  const waiting = new Map();
  function getWorker(){
    if(worker || workerBroken) return worker;
    try{
      if(!root.Worker || !root.OffscreenCanvas || !root.Blob || !root.URL || !root.createImageBitmap){ workerBroken = true; return null; }
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
      worker.onmessage = e => {
        const d = e.data || {}, p = waiting.get(d.id); if(!p) return;
        waiting.delete(d.id);
        if(d.error) p.reject(new Error(d.error)); else p.resolve(d.dataUrl);
      };
      worker.onerror = () => { workerBroken = true; worker = null; waiting.forEach(p => p.reject(new Error('worker lỗi'))); waiting.clear(); };
    }catch(e){ workerBroken = true; worker = null; }
    return worker;
  }
  function compress(blob, fallback){
    const w = getWorker();
    if(!w) return fallback(blob);
    return new Promise((resolve, reject) => {
      const id = ++seq; waiting.set(id, { resolve, reject });
      try{ w.postMessage({ id, blob, max: CFG.maxSide, q: CFG.quality }); }catch(e){ waiting.delete(id); reject(e); }
    }).catch(() => fallback(blob));      // worker lỗi với ảnh này -> nén bằng luồng chính
  }

  // ---------- Hàng đợi việc ----------
  const queue = [], failed = [];
  let running = 0, okCount = 0, failCount = 0, hideT = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pending(){ return running + queue.length; }

  // ---------- Nhãn trạng thái ----------
  let chip = null;
  function chipEl(){
    if(chip || typeof document === 'undefined' || !document.body) return chip;
    chip = document.createElement('div');
    chip.id = 'saveChip';
    chip.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:150;padding:8px 14px;border-radius:999px;' +
      'font:600 13px/1.2 system-ui,sans-serif;background:var(--card,#fff);color:var(--ink,#111);border:2px solid var(--line,#222);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.18);display:none;cursor:default;white-space:nowrap';
    document.body.appendChild(chip);
    return chip;
  }
  function render(){
    const el = chipEl(); if(!el) return;
    clearTimeout(hideT);
    const n = pending();
    if(n > 0){
      el.style.display = 'block'; el.style.cursor = 'default'; el.onclick = null;
      el.textContent = '⏳ Đang lưu ' + n + ' acc…' + (failed.length ? ' · ' + failed.length + ' lỗi' : '');
    } else if(failed.length){
      el.style.display = 'block'; el.style.cursor = 'pointer';
      el.textContent = '⚠ ' + failed.length + ' acc lưu lỗi — bấm để thử lại';
      el.onclick = retryFailed;
    } else if(okCount > 0){
      el.style.display = 'block'; el.style.cursor = 'default'; el.onclick = null;
      el.textContent = '✓ Đã lưu xong';
      hideT = setTimeout(() => { el.style.display = 'none'; okCount = 0; }, 1800);
    } else el.style.display = 'none';
  }

  // ---------- Chạy việc ----------
  function finishGroup(j, ok){
    const g = j.group; if(!g) return;
    if(ok) g.ok++; else g.fail++;
    if(--g.left === 0 && g.onFinish){ try{ g.onFinish({ ok: g.ok, fail: g.fail }); }catch(e){ console.error(e); } }
  }
  async function runJob(j){
    let retry = false;
    try{
      const r = await j.run();
      okCount++;
      try{ if(j.onDone) j.onDone(r); }catch(e){ console.error(e); }
      finishGroup(j, true);
    }catch(e){
      if(!(e && e.noRetry) && j.tries < CFG.retries){ j.tries++; retry = true; await sleep(CFG.retryDelay * j.tries); }
      else {
        failCount++;
        if(!(e && e.noRetry)) failed.push(j);   // lỗi thật (mạng/hạn mức) -> cho phép bấm thử lại; trùng mã thì không
        try{ if(j.onFail) j.onFail(e); }catch(x){ console.error(x); }
        finishGroup(j, false);
      }
    }finally{
      running--;
      if(retry) queue.unshift(j);
      render(); pump();
    }
  }
  function pump(){
    while(running < CFG.concurrency && queue.length){ running++; runJob(queue.shift()); }
  }
  function add(job){
    job.tries = 0; queue.push(job); render(); pump(); return job;
  }
  function retryFailed(){
    const list = failed.splice(0, failed.length);
    list.forEach(j => { j.tries = 0; try{ if(j.onRetry) j.onRetry(); }catch(e){} queue.push(j); });
    render(); pump();
  }
  function group(total, onFinish){ return { left: total, ok: 0, fail: 0, onFinish }; }

  if(typeof window !== 'undefined' && window.addEventListener){
    window.addEventListener('beforeunload', e => { if(pending() > 0){ e.preventDefault(); e.returnValue = ''; } });
  }

  root.SaveQueue = { compress, add, group, pending, retryFailed, config: CFG, _failed: failed };
})();
