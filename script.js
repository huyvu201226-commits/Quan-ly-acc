// ===== Khởi tạo Firebase =====
firebase.initializeApp(firebaseConfig);
// ===== Hiệu ứng tải (vòng tròn + đếm giây) =====
// - Mở trang / tải lại / mở link: hiện toàn màn hình, đếm giây từ lúc bắt đầu mở trang, tắt khi dữ liệu đã sẵn sàng.
// - Lưu / xóa / cập nhật chậm hơn 0,5 giây: hiện vòng tròn kèm số giây phải đợi (không chặn thao tác).
const Loader = (()=>{
  const el = document.getElementById('loader'), txt = document.getElementById('loaderTxt'), sub = document.getElementById('loaderSub');
  let t0 = 0, tick = null, pending = 0, label = '', pageLoading = true, delayT = null, hideT = null, muted = 0, pageMode = true;
  const fmt = ms=>{ const s = ms/1000; return s<10 ? s.toFixed(1)+'s' : Math.floor(s)+'s'; };
  // Chữ ở màn hình tải trang: chào tên nếu thiết bị này đã có tài khoản, chào khách nếu chưa. Có thể chỉnh trong trang "Tùy chỉnh trang" (Admin tổng).
  const LOAD_DEF = { greetUser:'Chào {name}!', greetGuest:'Chào khách!', note:'Vui lòng đợi chút — tải trang có thể mất vài phút.' };
  function pageTexts(){
    let l = {}; try{ const t = JSON.parse(localStorage.getItem('acc_theme_v1')||'null'); if(t && t.load) l = t.load; }catch(e){}
    const name = localStorage.getItem('acc_myname') || '';
    const g = name ? (l.greetUser || LOAD_DEF.greetUser) : (l.greetGuest || LOAD_DEF.greetGuest);
    return { title: g.replace(/\{name\}/g, name), note: typeof l.note === 'string' ? l.note : LOAD_DEF.note };
  }
  const render = ()=>{
    if(pageMode){ const p = pageTexts(); txt.textContent = p.title; sub.textContent = p.note; }
    else { txt.textContent = label+' '+fmt(performance.now()-t0); sub.textContent = ''; }
  };
  function show(l, page, start){
    label = l; t0 = start; pageMode = !!page; el.classList.add('on'); el.classList.toggle('page', page);
    clearInterval(tick); render();
    if(!page) tick = setInterval(render, 100);      // lưu/xóa chậm: vẫn đếm giây; tải trang: chỉ hiện lời chào
  }
  function hide(){ clearInterval(tick); el.classList.remove('on','page'); }
  show('', true, 0);
  setTimeout(()=>Loader.pageDone(), 30000);       // phòng treo: tối đa 30 giây
  return {
    pageDone(){ if(!pageLoading) return; pageLoading = false; hide(); },
    refreshTexts(){ if(pageMode && el.classList.contains('on')) render(); },
    // Chạy fn (gọi lệnh ghi Firebase) mà KHÔNG hiện vòng xoay toàn màn hình — dùng cho các lần lưu chạy nền trong SaveQueue.
    silent(fn){ muted++; try{ return fn(); } finally{ muted--; } },
    track(p, l){
      if(muted || pageLoading || !p || !p.then) return;
      pending++;
      clearTimeout(hideT);
      if(pending===1 && !el.classList.contains('on')){
        const begun = performance.now();
        delayT = setTimeout(()=>{ if(pending>0) show(l, false, begun); }, 500);   // nhanh hơn 0,5s thì không hiện
      }
      const fin = ()=>{
        pending = Math.max(0, pending-1);
        if(!pending){ clearTimeout(delayT); hideT = setTimeout(hide, 350); }
      };
      p.then(fin, fin);
    }
  };
})();
// Theo dõi mọi lần ghi dữ liệu (lưu/sửa/xóa) trừ nhịp online/lịch sử chạy nền.
(function(){
  const P = firebase.firestore.DocumentReference.prototype;
  [['set','Đang lưu…'],['update','Đang lưu…'],['delete','Đang xóa…']].forEach(([m,l])=>{
    const orig = P[m];
    P[m] = function(...a){
      const c = this.parent && this.parent.id;
      if((m==='set'||m==='update') && c===COL.accounts && !isSettingsDoc(this.id) && a[0] && typeof a[0]==='object' && !Array.isArray(a[0]))
        a[0] = Object.assign({}, a[0], {updatedAt: Date.now()});   // dấu thời gian sửa: để máy khác nhận thay đổi ngay cả với acc cũ
      const p = orig.apply(this, a);
      if(c !== 'accmgr_presence' && c !== 'accmgr_logins') Loader.track(p, l);
      return p;
    };
  });
})();

const db = firebase.firestore();
// Bật cache offline: lần mở trang sau sẽ có dữ liệu ngay từ bộ nhớ đệm cục bộ
// trong khi chờ đồng bộ mới nhất từ máy chủ — giúp khởi động nhanh hơn.
try{ db.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}

// ===== Project Firebase thứ 2 (tùy chọn) — dùng thêm dung lượng cho danh sách acc + ảnh =====
// Chỉ bật khi firebase-config.js có điền firebaseConfig2. Nếu để trống, web chạy như cũ (1 project).
let db2 = null;
try{
  if(typeof firebaseConfig2 !== 'undefined' && firebaseConfig2 && firebaseConfig2.projectId && !/DIEN_VAO/.test(firebaseConfig2.projectId)){
    const app2 = firebase.initializeApp(firebaseConfig2, 'second');
    db2 = app2.firestore();
    try{ db2.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}
  }
}catch(e){ console.error('Không khởi tạo được project thứ 2:', e); db2 = null; }
// Project nào chứa acc này (1 hoặc 2). Acc mới được lưu vào project ghi bởi ACC_WRITE_TO.
function accDb(a){ return (a && a._src === 2 && db2) ? db2 : db; }
function accCol(a){ return accDb(a).collection(COL.accounts); }
// Ước lượng dung lượng acc đang chiếm trong 1 project (đếm chữ trong ảnh base64 + các trường chữ).
function estimateBytes(src){
  let n = 0;
  for(const a of accounts){
    if((a._src||1) !== src) continue;
    // +3300: phần dư của tài liệu + chỉ mục Firestore (mỗi trường chữ được đánh chỉ mục, tốn thêm dung lượng).
    n += (a.imageUrl||'').length + (a.code||'').length + (a.desc||'').length + (a.price? String(a.price).length : 0)
       + (a.buyer||'').length + (a.source||'').length + 3300;
  }
  // Acc cũ đang được tải ngầm nên n có thể còn thiếu: lấy số lớn hơn giữa "đang đếm được" và "lần đo đầy đủ gần nhất".
  try{
    const saved = JSON.parse(localStorage.getItem('acc_bytes_est')||'{}');
    if(typeof oldLoaded !== 'undefined' && oldLoaded){ saved[src] = n; localStorage.setItem('acc_bytes_est', JSON.stringify(saved)); }
    else n = Math.max(n, saved[src]||0);
  }catch(e){}
  return n;
}
// Thêm/cập nhật 1 acc trong bộ nhớ THEO id — tránh trùng lặp (listener realtime và lệnh push thủ công
// cùng thêm 1 acc nên trước đây khi lưu xong sẽ hiện 2 ảnh giống nhau cho tới lần đồng bộ kế tiếp).
// Sau khi lưu xong: nếu realtime đã thêm 1 bản cùng id ở project khác thì bỏ bản thừa, chỉ giữ bản `keep`.
function dedupeId(id, keep){ for(let i=accounts.length-1;i>=0;i--){ if(accounts[i].id===id && accounts[i]!==keep) accounts.splice(i,1); } }
function upsertAcc(obj){
  const i = accounts.findIndex(x=>x.id===obj.id);
  if(i>=0) accounts[i] = Object.assign({}, accounts[i], obj); else accounts.push(obj);
}
// Nhớ project nào vừa báo hết hạn mức để các lần lưu sau đi thẳng sang project còn lại (khỏi chờ lỗi mỗi lần).
const FULL_TTL = 6*3600*1000;
function markFull(src){ try{ localStorage.setItem('acc_full_'+src, String(Date.now())); }catch(e){} }
function isMarkedFull(src){ try{ const t = parseInt(localStorage.getItem('acc_full_'+src)||'0',10); return !!t && Date.now()-t < FULL_TTL; }catch(e){ return false; } }
function isQuotaError(e){ const c = (e && (e.code||'')) + ''; return /resource-exhausted|quota/i.test(c) || /quota|exhausted/i.test((e&&e.message)||''); }
const MAX_BYTES = (typeof ACC_MAX_BYTES !== 'undefined' && ACC_MAX_BYTES > 0) ? ACC_MAX_BYTES : 800*1024*1024;
// Chọn project để lưu acc MỚI: 'auto' = lưu project 1 cho tới khi ước lượng gần đầy thì tự chuyển sang project 2.
function newAccSrc(){
  if(!db2) return 1;
  const mode = (typeof ACC_WRITE_TO !== 'undefined') ? ACC_WRITE_TO : 'auto';
  if(mode === 1) return 1;
  if(mode === 2) return 2;
  if(isMarkedFull(1) && !isMarkedFull(2)) return 2;
  if(isMarkedFull(2) && !isMarkedFull(1)) return 1;
  return estimateBytes(1) >= MAX_BYTES ? 2 : 1;
}
// Lưu acc mới. Nếu project được chọn báo lỗi (vd hết hạn mức) mà còn project kia thì tự thử sang project kia.
async function saveNewAcc(id, data){
  const first = newAccSrc();
  const order = db2 ? [first, first===1 ? 2 : 1] : [1];
  for(const src of order){
    try{
      await accCol({_src:src}).doc(id).set(data);
      return src;
    }catch(e){
      console.error('Lưu vào project '+src+' lỗi:', e);
      if(isQuotaError(e)) markFull(src);
    }
  }
  return null;
}

// Tiền tố riêng cho app này — đảm bảo không bao giờ đụng tới dữ liệu của trang khác
// dùng chung project Firebase (vd trang "site/data" cũ của bạn).
const COL = {
  accounts: 'accmgr_accounts',
  users: 'accmgr_users',
  logins: 'accmgr_logins',
  presence: 'accmgr_presence'
};

let myName = localStorage.getItem('acc_myname') || '';
let myRole = null; // 'user' (chỉ xem) | 'admin' | 'superadmin'
let accounts = [];
let logins = [];
let allUsers = [];
let onlineNames = new Set();
let pasteBlob = null;
let heartbeatTimer = null;
let kbId = null, bulkSel = -1, remindTimer = null;
const shownDue = new Set();

function userKey(name){ return (name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'user'; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString('vi-VN')+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}); }
function monthKey(ts){ const d=new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function dayKey(ts){ const d=new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dayLabel(ts){ const d=new Date(ts); return 'Ngày '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function isStaff(){ return myRole==='admin' || myRole==='superadmin'; }
function isViewer(){ return myRole==='user'; }
function isLive(a){ return !a.deletedAt && !a.sold; }

// ===== Giá tăng thêm khi bán lại =====
// Admin tổng tạo sẵn các mức tăng. Admin phụ bắt buộc chọn 1 mức khi thêm/sửa acc.
// Mức tăng lưu RIÊNG (markup, markupStatus, markupBy), không cộng vào ô "Giá".
// Danh sách mức tăng lưu trong 1 tài liệu đặc biệt (không cần thêm collection/Rules mới).
// LƯU Ý: Firestore CẤM id dạng __abc__ (nên bản cũ lưu thất bại âm thầm, tải lại là mất mức giá).
const MARKUP_DOC = 'settings_markup_options';
const OLD_MARKUP_DOC = '__markup_options__';
const SITE_DOC = 'settings_site';       // giao diện toàn trang (Admin tổng chỉnh) — lưu 1 tài liệu riêng, xem theme.js
function isSettingsDoc(id){ return id===MARKUP_DOC || id===OLD_MARKUP_DOC || id===SITE_DOC; }
// Acc tự bị xóa sau 4 tháng kể từ ngày thêm; web báo trước 24 giờ ở mục Lịch sử.
const EXPIRE_MS = 1000*60*60*24*30*4;
const EXPIRE_WARN_MS = 24*3600*1000;
let markupOptions = [];
function fmtMoney(n){ return Number(n).toLocaleString('vi-VN'); }
const PRIO_LABEL = {good_price:'Giá tốt'};
function prioTagsHtml(a){
  return (a.markupPriority||[]).map(k=>PRIO_LABEL[k]?`<span class="mk-tag">${PRIO_LABEL[k]}</span>`:'').join('');
}
function readPriority(ov, id){
  const r = [];
  if(ov.querySelector('#'+id+'Good')?.checked) r.push('good_price');
  return r;
}
// prev = acc cũ (khi sửa). Admin tổng không đụng tới cờ "Giá tốt" của admin phụ.
// Admin phụ: giá tăng KHÔNG bắt buộc; nếu không chọn thì chỉ lưu cờ Giá tốt (nếu có).
function markupFields(val, flags, prev){
  if(myRole==='superadmin'){
    return val ? {markup:val, markupStatus:'approved', markupBy:myName} : {markup:null, markupStatus:null, markupBy:null};
  }
  if(!val) return {markup:null, markupStatus:null, markupBy:null, markupPriority: flags||[]};
  // Giữ nguyên trạng thái đã duyệt nếu admin phụ không đổi mức giá tăng.
  if(prev && prev.markup===val && prev.markupStatus==='approved') return {markupPriority: flags||[]};
  return {markup:val, markupStatus:'pending', markupBy:myName, markupPriority: flags||[]};
}
// Nhấn Enter ở ô chọn mức tăng / ô đề xuất thì lưu luôn.
function bindEnterSave(ov, ids, saveSel){
  ids.forEach(id=>{
    const el = ov.querySelector('#'+id);
    if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); ov.querySelector(saveSel).click(); } });
  });
}
function markupOptionsHtml(current, noneLabel){
  const opts = markupOptions.slice();
  if(current && !opts.includes(current)) opts.push(current);
  opts.sort((a,b)=>a-b);
  return `<option value="">${noneLabel}</option>` + opts.map(v=>`<option value="${v}"${v===current?' selected':''}>+${fmtMoney(v)}</option>`).join('');
}
function markupSelectHtml(id, current, flags){
  const req = myRole!=='superadmin';
  const f = flags||[];
  const prio = req ? `<div class="mk-prio-row"><span>Đề xuất ưu tiên duyệt:</span>
      <label class="mk-check"><input type="checkbox" id="${id}Good"${f.includes('good_price')?' checked':''}>Giá tốt</label></div>` : '';
  return `<label>Giá tăng thêm khi bán lại (không bắt buộc)</label>
    <select id="${id}">${markupOptionsHtml(current||null, 'Không tăng')}</select>
    <div id="${id}Err" class="fielderr"></div>${prio}`;
}
// Trả về true nếu hợp lệ; nếu thiếu (admin phụ chưa chọn) thì hiện lỗi và trả về false.
function checkMarkup(ov, id){
  const el = ov.querySelector('#'+id);
  const err = ov.querySelector('#'+id+'Err');
  err.textContent = '';
  return true; // Giá tăng thêm không còn bắt buộc
}
function startMarkupListener(){
  db.collection(COL.accounts).doc(MARKUP_DOC).onSnapshot(snap=>{
    const d = snap.exists ? snap.data() : null;
    markupOptions = (d && Array.isArray(d.options)) ? d.options.map(Number).filter(n=>n>0).sort((a,b)=>a-b) : [];
    const tab = document.getElementById('tab-markup');
    if(myRole==='superadmin' && tab && !tab.classList.contains('hide')) renderMarkupPage();
  }, ()=>{});
}
function updateMarkupBadge(){
  const b = document.getElementById('navMarkup'); if(!b) return;
  const n = accounts.filter(a=>isLive(a) && a.markup && a.markupStatus==='pending').length;
  b.textContent = 'Giá tăng' + (n ? ' ('+n+')' : '');
  updateRemindBadge();
}

// Thời lượng hoạt động ở dạng dễ đọc, dùng cho tab Lịch sử.
function formatDuration(ms){
  if(!ms || ms<0) ms = 0;
  const totalMin = Math.round(ms/60000);
  if(totalMin < 1) return 'vài giây';
  if(totalMin < 60) return totalMin+' phút';
  const h = Math.floor(totalMin/60), m = totalMin%60;
  return h+' giờ'+(m?(' '+m+' phút'):'');
}

// ===== Tải dữ liệu 2 giai đoạn (để vào web nhanh, không treo) =====
// Giai đoạn 1 (chặn màn hình tải): chỉ acc thêm trong 2 ngày gần nhất + lịch sử truy cập. Làm song song
//   với màn hình đăng nhập nên đăng nhập xong là có dữ liệu ngay.
// Giai đoạn 2 (chạy ngầm SAU khi đã vào web): tải acc cũ hơn theo từng lô nhỏ, hiện dần, không chặn thao tác.
const RECENT_MS = 2*24*3600*1000;       // "2 ngày gần nhất"
const OLD_PAGE = 25;                    // mỗi lô acc cũ tải bao nhiêu acc (ảnh base64 nặng nên để nhỏ)
const pageStartAt = Date.now();
const recentCutoff = pageStartAt - RECENT_MS;
const syncSince = pageStartAt - 60*1000;   // nghe thay đổi từ lúc mở trang (trừ 1 phút phòng lệch đồng hồ)
function withTimeout(p, ms){ return Promise.race([p, new Promise(r=>setTimeout(()=>r(null), ms))]); }
let preloadPromise = null;
function startPreload(){
  if(!preloadPromise){
    const recent = d => withTimeout(d.collection(COL.accounts).where('addedAt','>=',recentCutoff).get().catch(()=>null), 12000);
    preloadPromise = Promise.all([
      recent(db),
      db.collection(COL.logins).get().catch(()=>null),
      db2 ? recent(db2) : Promise.resolve(null)
    ]);
  }
  return preloadPromise;
}
startPreload();

// ===== Zoom lưới ảnh (thu nhỏ để xem nhiều ảnh hơn / phóng to để xem rõ hơn) =====
const GRID_ZOOM_MIN = 100, GRID_ZOOM_MAX = 260, GRID_ZOOM_STEP = 20;
let gridZoom = parseInt(localStorage.getItem('acc_gridzoom')||'', 10) || 156;
function applyGridZoom(){
  gridZoom = Math.max(GRID_ZOOM_MIN, Math.min(GRID_ZOOM_MAX, gridZoom));
  document.documentElement.style.setProperty('--grid-col', gridZoom+'px');
  localStorage.setItem('acc_gridzoom', gridZoom);
}
document.getElementById('zoomOutBtn').onclick = ()=>{ gridZoom -= GRID_ZOOM_STEP; applyGridZoom(); };
document.getElementById('zoomInBtn').onclick = ()=>{ gridZoom += GRID_ZOOM_STEP; applyGridZoom(); };
applyGridZoom();

// ===== Điều hướng bàn phím trong form =====
// Shift+Enter: xuống dòng (trong ô mô tả nhiều dòng).
// Enter: thay cho việc bấm nút Lưu / Đăng nhập.
// Mũi tên lên/xuống/trái/phải: chuyển giữa các ô, giống di chuyển giữa các ô/chữ trên bảng tính.
// Hoạt động giống nhau trên cả laptop (bàn phím) và điện thoại (bàn phím ảo).
function isCaretAtFirstLine(el){ return el.value.lastIndexOf('\n', el.selectionStart-1) === -1; }
function isCaretAtLastLine(el){ return el.value.indexOf('\n', el.selectionEnd) === -1; }
function focusField(el, pos){
  el.focus();
  if(typeof el.setSelectionRange !== 'function') return;
  if(pos==='end'){ const v=el.value; el.setSelectionRange(v.length, v.length); }
  else if(pos==='start'){ el.setSelectionRange(0,0); }
}
function enableFieldNav(fields, submitFn, onDownFromLast){
  fields.forEach((el, idx)=>{
    if(!el) return;
    el.addEventListener('keydown', (e)=>{
      const isTextarea = el.tagName === 'TEXTAREA';
      if(e.key === 'Enter'){
        if(isTextarea && e.shiftKey) return; // Shift+Enter: xuống dòng bình thường
        e.preventDefault();
        if(submitFn) submitFn();
        return;
      }
      if(e.key === 'ArrowUp'){
        if(isTextarea && !isCaretAtFirstLine(el)) return; // còn dòng trên trong ô: di chuyển con trỏ như bình thường
        const prev = fields[idx-1];
        if(prev){ e.preventDefault(); focusField(prev, 'end'); }
        return;
      }
      if(e.key === 'ArrowDown'){
        if(isTextarea && !isCaretAtLastLine(el)) return;
        const next = fields[idx+1];
        if(next){ e.preventDefault(); focusField(next, 'start'); }
        else if(onDownFromLast){ e.preventDefault(); onDownFromLast(); }   // ô cuối: xuống ô chọn giá tăng
        return;
      }
      if(e.key === 'ArrowLeft'){
        if(el.selectionStart===0 && el.selectionEnd===0){
          const prev = fields[idx-1];
          if(prev){ e.preventDefault(); focusField(prev, 'end'); }
        }
        return;
      }
      if(e.key === 'ArrowRight'){
        if(el.selectionStart===el.value.length && el.selectionEnd===el.value.length){
          const next = fields[idx+1];
          if(next){ e.preventDefault(); focusField(next, 'start'); }
        }
        return;
      }
    });
  });
}

// ===== Dán ảnh (Ctrl+V) — bản bền vững =====
// Lỗi cũ: mỗi modal tự gắn 1 listener 'paste' lên document rồi phải nhớ gỡ. Dùng lâu (mở/đóng nhiều lần,
// lưu lỗi giữa chừng, mở chồng 2 modal...) thì listener cũ bị sót/chồng chéo, biến tạm cũ giữ ảnh
// nên Ctrl+V không còn thêm được ảnh vào modal đang mở.
// Cách mới: chỉ có DUY NHẤT 1 listener, đăng ký 1 lần khi tải trang. Modal nào đang mở (còn nằm trong DOM)
// và được đăng ký ở trên cùng sẽ nhận ảnh — modal bị xóa bằng bất kỳ cách nào cũng tự bị bỏ qua.
const pasteTargets = [];   // [{ov, onImages}]
function registerPasteTarget(ov, onImages){
  pasteTargets.push({ov, onImages});
  return ()=>{ const i = pasteTargets.findIndex(t=>t.ov===ov); if(i>=0) pasteTargets.splice(i,1); };
}
function activePasteTarget(){
  for(let i=pasteTargets.length-1; i>=0; i--){
    if(pasteTargets[i].ov.isConnected) return pasteTargets[i];
    pasteTargets.splice(i,1); // dọn modal đã bị gỡ khỏi trang
  }
  return null;
}
// Lấy TẤT CẢ ảnh trong clipboard: ảnh chụp màn hình, ảnh copy từ web/Zalo/Word, và file ảnh copy từ Explorer/Finder.
function imagesFromClipboardData(cd){
  const out = [];
  if(!cd) return out;
  if(cd.files && cd.files.length){
    for(const f of cd.files){ if(f && f.type && f.type.indexOf('image')===0) out.push(f); }
  }
  if(!out.length && cd.items){
    for(const it of cd.items){
      if(it.kind==='file' && it.type && it.type.indexOf('image')===0){
        const f = it.getAsFile(); if(f) out.push(f);
      }
    }
  }
  return out;
}
function fmtSize(n){ return n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB'; }
// Đang gõ trong ô chữ? (khi đó dán chữ phải hoạt động bình thường)
function isTypingField(){
  const ae = document.activeElement;
  return !!ae && (ae.tagName==='TEXTAREA' || (ae.tagName==='INPUT' && /^(text|search|tel|url|email|number|password|)$/i.test(ae.type||'')));
}
// Dán ảnh ngay ở trang chủ (chưa mở cửa sổ nào) -> tự mở "Thêm ACC" với ảnh vừa dán.
function canQuickAdd(){
  const app = document.getElementById('app');
  return !!app && !app.classList.contains('hide') && isStaff() && !document.querySelector('.overlay') && !isTypingField();
}
// Trả về true nếu đã có nơi nhận ảnh.
function routeImages(imgs){
  const t = activePasteTarget();
  if(t){ t.onImages(imgs); return true; }
  if(canQuickAdd()){
    if(imgs.length > 1) openBulkAddModal(imgs); else openAddModal(imgs[0]);
    return true;
  }
  return false;
}
let lastPasteAt = 0;
document.addEventListener('paste', e=>{
  const cd = e.clipboardData || window.clipboardData;
  const imgs = imagesFromClipboardData(cd);
  if(!imgs.length) return;
  // Copy từ Excel/Word thường có cả chữ lẫn ảnh: đang đứng trong ô chữ thì ưu tiên dán chữ.
  let hasText = false;
  try{ hasText = ((cd.getData && cd.getData('text/plain'))||'').trim().length > 0; }catch(err){}
  if(isTypingField() && hasText) return;
  if(routeImages(imgs)){ lastPasteAt = Date.now(); e.preventDefault(); }
}, true);
// Dự phòng: một số trình duyệt/tiện ích không bắn sự kiện 'paste' khi Ctrl+V lúc đang đứng ở ô select/nút.
// Chỉ chạy khi KHÔNG đứng trong ô chữ (để dán chữ không bị hỏi quyền clipboard).
document.addEventListener('keydown', e=>{
  if(!((e.ctrlKey||e.metaKey) && (e.key==='v'||e.key==='V'))) return;
  if(isTypingField()) return;
  if(!activePasteTarget() && !canQuickAdd()) return;
  const started = Date.now();
  setTimeout(async ()=>{
    if(lastPasteAt >= started) return;            // sự kiện paste đã xử lý xong
    if(!navigator.clipboard || !navigator.clipboard.read) return;
    try{
      const items = await navigator.clipboard.read();
      const files = [];
      for(const it of items){
        const type = it.types.find(x=>x.indexOf('image/')===0);
        if(type){ const blob = await it.getType(type); files.push(new File([blob], 'paste.'+type.split('/')[1], {type})); }
      }
      if(files.length) routeImages(files);
    }catch(err){ /* bị chặn quyền clipboard: bỏ qua */ }
  }, 150);
}, true);

// Kéo thả ảnh từ máy vào cửa sổ (hỗ trợ kéo nhiều ảnh).
function bindImageDrop(ov, zone, onImages){
  const hasFiles = e=> !!(e.dataTransfer && Array.from(e.dataTransfer.types||[]).indexOf('Files')>=0);
  ov.addEventListener('dragover', e=>{ if(!hasFiles(e)) return; e.preventDefault(); zone.classList.add('drag'); });
  ov.addEventListener('dragleave', e=>{ if(!e.relatedTarget || !ov.contains(e.relatedTarget)) zone.classList.remove('drag'); });
  ov.addEventListener('drop', e=>{
    if(!hasFiles(e)) return;
    e.preventDefault(); zone.classList.remove('drag');
    const imgs = Array.from(e.dataTransfer.files).filter(f=>f.type && f.type.indexOf('image/')===0);
    if(imgs.length) onImages(imgs);
  });
}

// Xem ảnh xem trước; luôn thu hồi URL cũ để không phình bộ nhớ khi dán nhiều lần.
function showPreview(dz, blob){
  if(dz._previewUrl){ try{ URL.revokeObjectURL(dz._previewUrl); }catch(e){} }
  const url = URL.createObjectURL(blob);
  dz._previewUrl = url;
  dz.innerHTML = '';
  const im = document.createElement('img'); im.src = url;
  dz.appendChild(im);
}


// ===== Chọn mức giá tăng bằng bàn phím =====
// Ở ô Mô tả (ô cuối) bấm mũi tên xuống -> nhảy vào ô "Giá tăng" và MỞ SẴN danh sách mức giá.
// Mỗi lần bấm ↓ / ↑ đi 1 mức. Enter lần 1: chốt mức đang chọn (đóng danh sách). Enter lần 2: Lưu.
// (Dùng danh sách hiển thị trực tiếp thay cho hộp thả xuống của trình duyệt để hành vi giống nhau ở mọi trình duyệt.)
function enableMarkupPicker(ov, selId, saveSel, prevField){
  const sel = ov.querySelector('#'+selId); if(!sel) return {open(){}};
  let open = false;
  function openList(){
    if(sel.options.length < 2){ open = false; sel.focus(); return; } // chưa có mức nào: không cần mở
    sel.size = Math.min(sel.options.length, 6);
    sel.classList.add('mk-open');
    open = true;
    sel.focus();
    if(sel.scrollIntoView) sel.scrollIntoView({block:'nearest'});
  }
  function closeList(){
    sel.removeAttribute('size');
    sel.classList.remove('mk-open');
    open = false;
  }
  sel.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(open){ closeList(); }                       // Enter lần 1: chốt mức
      else ov.querySelector(saveSel).click();        // Enter lần 2: Lưu
      return;
    }
    if(e.key==='Escape' && open){ e.preventDefault(); e.stopPropagation(); closeList(); return; }
    if(e.key==='ArrowDown' && !open){ e.preventDefault(); openList(); return; }
    if(e.key==='ArrowUp'){
      if(!open || sel.selectedIndex<=0){
        e.preventDefault(); closeList();
        if(prevField) focusField(prevField, 'end');
      }
      return; // đang mở & chưa ở đầu: để trình duyệt tự lùi 1 mức
    }
  });
  sel.addEventListener('blur', closeList);
  return {open: openList};
}

function highlight(text, kw){
  const esc = escapeHtml(text);
  if(!kw || !text) return esc;
  const kwe = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return esc.replace(new RegExp('('+kwe+')','ig'), '<mark>$1</mark>');
}

// ===== Kiểm tra mã trùng =====
function normalizeCode(c){ return (c||'').trim().toLowerCase(); }
// Tìm acc đang hoạt động (chưa xóa) có cùng mã. excludeId dùng khi đang sửa 1 acc để không tự so với chính nó.
function findDuplicateByCode(code, excludeId){
  const nc = normalizeCode(code);
  if(!nc) return null;
  return accounts.find(a => a.id!==excludeId && isLive(a) && normalizeCode(a.code)===nc) || null;
}
// TẤT CẢ acc đang hoạt động có cùng mã.
function findDupsByCode(code, excludeId){
  const nc = normalizeCode(code);
  if(!nc) return [];
  return accounts.filter(a => a.id!==excludeId && isLive(a) && normalizeCode(a.code)===nc);
}

// ----- Danh sách acc trùng mã kèm nút Sửa / Xóa (dùng trong form thêm/sửa, thêm nhiều ảnh, cửa sổ xem trùng) -----
function dupRowsHtml(list){
  return list.map(a=>`<div class="duprow" data-id="${a.id}">
    ${a.imageUrl ? `<img src="${a.imageUrl}" data-zoom="${a.id}" alt="">` : '<div class="dupnoimg">—</div>'}
    <div class="dupinfo">
      <span class="code tag">${escapeHtml(a.code||'')}</span>
      ${a.price ? `<div class="price">${escapeHtml(a.price)}</div>` : ''}
      ${a.desc ? `<div class="rsmall">${escapeHtml(a.desc.length>90 ? a.desc.slice(0,90)+'…' : a.desc)}</div>` : ''}
      <div class="rsmall">Thêm: ${fmtDate(a.addedAt)}</div>
    </div>
    <div class="dupacts"><button type="button" class="edit" data-dedit="${a.id}">Sửa</button><button type="button" class="del" data-ddel="${a.id}">Xóa</button></div>
  </div>`).join('');
}
function bindDupRows(root){
  root.querySelectorAll('[data-dedit]').forEach(b=> b.onclick = e=>{ e.preventDefault(); e.stopPropagation(); openEditModal(b.dataset.dedit); });
  root.querySelectorAll('[data-ddel]').forEach(b=> b.onclick = e=>{ e.preventDefault(); e.stopPropagation(); removeFlow(b.dataset.ddel); });
  root.querySelectorAll('[data-zoom]').forEach(im=> im.onclick = ()=> openZoom(im.dataset.zoom));
}
function dupBoxUpdate(box, code, excludeId){
  if(!box) return;
  const list = findDupsByCode(code, excludeId);
  if(!list.length){ box.innerHTML = ''; box.classList.remove('on'); return; }
  box.classList.add('on');
  box.innerHTML = `<div class="dupbox-h">⚠ Mã "${escapeHtml(code.trim())}" đã có ${list.length} acc — Sửa hoặc Xóa ngay tại đây:</div>${dupRowsHtml(list)}`;
  bindDupRows(box);
}
// Gắn ô cảnh báo trùng vào 1 form: tự cập nhật khi gõ mã và khi dữ liệu acc đổi (sau khi Sửa/Xóa acc trùng).
function watchDupBox(ov, box, getCode, excludeId){
  const upd = ()=> dupBoxUpdate(box, getCode(), excludeId);
  const h = ()=>{ if(!ov.isConnected){ document.removeEventListener('acc:changed', h); return; } upd(); };
  document.addEventListener('acc:changed', h);
  return upd;
}
// Cửa sổ liệt kê tất cả acc trùng 1 mã (mở từ thẻ trong "Thêm nhiều ảnh").
function openDupListModal(code){
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal dupmodal"><button class="close-x">✕</button><h3>Trùng mã "${escapeHtml(code)}"</h3><div class="dupbox on" id="dupListBox"></div><div class="rowbtn"><button id="dupListClose" class="primary">Xong</button></div></div>`;
  document.body.appendChild(ov);
  const box = ov.querySelector('#dupListBox');
  const upd = ()=>{
    const list = findDupsByCode(code);
    box.innerHTML = list.length ? `<div class="dupbox-h">Có ${list.length} acc đang dùng mã này:</div>${dupRowsHtml(list)}` : '<div class="empty">Không còn acc nào trùng mã này 🎉</div>';
    bindDupRows(box);
  };
  upd();
  const h = ()=>{ if(!ov.isConnected){ document.removeEventListener('acc:changed', h); return; } upd(); };
  document.addEventListener('acc:changed', h);
  const close = ()=> ov.remove();
  ov.querySelector('.close-x').onclick = close; ov.querySelector('#dupListClose').onclick = close;
  ov.onclick = e=>{ if(e.target===ov) close(); };
}
// Báo cho các form đang mở biết dữ liệu acc vừa đổi (gom lại để không bắn dồn dập).
let _accEvT = null;
function emitAccChanged(){ clearTimeout(_accEvT); _accEvT = setTimeout(()=> document.dispatchEvent(new Event('acc:changed')), 30); }

// ----- Phát hiện trùng mã trong toàn kho: viền đỏ + thông báo (kể cả acc cũ tải về chậm sau khi đã lưu) -----
let _dupMap = null;
function getDupMap(){
  if(_dupMap) return _dupMap;
  const m = new Map();
  for(const a of accounts){
    if(!isLive(a)) continue;
    const k = normalizeCode(a.code); if(!k) continue;
    const g = m.get(k); if(g) g.push(a); else m.set(k, [a]);
  }
  for(const [k, v] of Array.from(m)) if(v.length < 2) m.delete(k);
  _dupMap = m; setTimeout(()=>{ _dupMap = null; }, 200);
  return m;
}
function dupCountFor(a){
  if(!isStaff() || !isLive(a)) return 0;
  const g = getDupMap().get(normalizeCode(a.code));
  return g ? g.length : 0;
}
function checkDupAlerts(){
  if(!isStaff()) return;
  _dupMap = null;
  const m = getDupMap();
  let seen = {}; try{ seen = JSON.parse(localStorage.getItem('acc_dup_seen')||'{}') || {}; }catch(e){}
  const next = {}, fresh = [];
  m.forEach((list, k)=>{ next[k] = list.length; if(list.length > (seen[k]||0)) fresh.push({code:list[0].code, n:list.length}); });
  // Khi acc cũ chưa tải xong thì chưa biết hết các nhóm trùng -> chỉ cộng dồn, không xóa dấu "đã báo".
  let merged = next;
  if(!oldLoaded){ merged = Object.assign({}, seen); Object.keys(next).forEach(k=>{ merged[k] = Math.max(merged[k]||0, next[k]); }); }
  try{ const js = JSON.stringify(merged); if(js !== localStorage.getItem('acc_dup_seen')) localStorage.setItem('acc_dup_seen', js); }catch(e){}
  updateHistoryBadge();
  if(!fresh.length || document.getElementById('app').classList.contains('hide')) return;
  if(fresh.length <= 3){
    fresh.forEach(f=> showToast({ title:'⚠ Trùng mã '+f.code+' ('+f.n+' acc)', message:'Các acc này đã được viền đỏ. Bấm vào đây để xem kết quả ở trang tìm kiếm.', variant:'error', sticky:true, onClick:()=>goToDupSearch(f.code) }));
  } else {
    showToast({ title:'⚠ Phát hiện '+fresh.length+' mã bị trùng', message:'Các acc trùng đã được viền đỏ. Bấm vào đây để xem danh sách trong mục Lịch sử.', variant:'error', sticky:true, onClick:()=>switchTab('history') });
  }
}

// ----- Điều hướng -----
function switchTab(name){
  const btn = document.querySelector('nav button[data-tab="'+name+'"]');
  if(btn && !btn.classList.contains('hide')) btn.click();
}
// Sang Trang chủ, tự điền mã vào ô tìm kiếm và chỉ hiện đúng các acc trùng mã đó.
let homeExact = null;
function goToDupSearch(code){
  homeExact = normalizeCode(code);
  switchTab('home');
  const inp = document.getElementById('searchInput'); inp.value = code;
  renderHome();
  window.scrollTo({top:0, behavior:'smooth'});
}
function isSearchingCode(code){
  const home = document.getElementById('tab-home');
  return !!home && !home.classList.contains('hide') && normalizeCode(document.getElementById('searchInput').value) === normalizeCode(code);
}
// Sang "Acc đã thêm", cuộn tới đúng acc và nháy sáng.
function goToAcc(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  switchTab('all');
  const idx = accounts.filter(isLive).sort((x,y)=>y.addedAt-x.addedAt).findIndex(x=>x.id===id);
  if(idx >= allLimit) allLimit = idx + 1;
  renderAll();
  setTimeout(()=>{
    const el = document.querySelector('#tab-all .card[data-id="'+id+'"]');
    if(!el){ showToast({ title:'Không tìm thấy acc', message:'Acc này có thể đã bị xóa hoặc chưa tải xong.', variant:'error' }); return; }
    el.scrollIntoView({block:'center', behavior:'smooth'});
    el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'), 4000);
    kbId = id; kbPaint();
  }, 80);
}

// ----- Thông báo acc sắp bị xóa tự động (trước 24 giờ) -----
function expiringList(){
  const now = Date.now();
  return accounts.filter(a=> isLive(a) && a.addedAt && (a.addedAt + EXPIRE_MS - now) <= EXPIRE_WARN_MS).sort((x,y)=>x.addedAt-y.addedAt);
}
function fmtLeft(ms){
  if(ms <= 0) return 'đang chờ xóa';
  const m = Math.floor(ms/60000), h = Math.floor(m/60);
  return 'còn '+(h>0 ? h+' giờ '+(m%60)+' phút' : m+' phút');
}
function checkExpiring(){
  if(!isStaff()) return;
  const list = expiringList();
  updateHistoryBadge();
  if(!list.length) return;
  let seen = []; try{ seen = JSON.parse(localStorage.getItem('acc_exp_seen')||'[]') || []; }catch(e){}
  const set = new Set(seen), fresh = list.filter(a=>!set.has(a.id));
  if(!fresh.length) return;
  fresh.forEach(a=>set.add(a.id));
  try{ localStorage.setItem('acc_exp_seen', JSON.stringify(Array.from(set).slice(-500))); }catch(e){}
  showToast({ title:'🔔 '+fresh.length+' acc sẽ bị xóa tự động trong 24 giờ tới', message:'Bấm vào đây để xem tất cả ảnh ở mục Lịch sử và chuyển tới từng acc.', variant:'error', sticky:true, account:fresh[0], onClick:()=>switchTab('history') });
}
function checkNotices(){ checkExpiring(); checkDupAlerts(); }
function updateHistoryBadge(){
  const b = document.getElementById('navHistory'); if(!b || !isStaff()) return;
  const n = expiringList().length + getDupMap().size;
  b.textContent = 'Lịch sử' + (n ? ' ('+n+')' : '');
}

// ===== Thông báo nổi (toast) góc phải phía dưới =====
function toastWrap(){
  let wrap = document.getElementById('toastWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}
function removeToast(t){
  if(!t || !t.parentElement) return;
  clearTimeout(t._toastTimer);
  t.classList.add('toast-out');
  setTimeout(()=> t.remove(), 200);
}
function showToast({title, message, variant, account, onClick, sticky}){
  const wrap = toastWrap();
  const t = document.createElement('div');
  t.className = 'toast' + (variant==='error' ? ' toast-err' : '');
  t.innerHTML = `
    <button class="toast-close" type="button">✕</button>
    <div class="toast-title">${escapeHtml(title||'')}</div>
    ${message ? `<div class="toast-msg">${escapeHtml(message)}</div>` : ''}
    ${account ? `
      <div class="toast-acc">
        ${account.imageUrl ? `<img src="${account.imageUrl}">` : ''}
        <div class="toast-acc-info">
          <span class="code tag">${escapeHtml(account.code||'(chưa có mã)')}</span>
          ${account.price ? `<div class="price">${escapeHtml(account.price)}</div>` : ''}
          <div class="toast-acc-added">Đã thêm: ${fmtDate(account.addedAt)}</div>
        </div>
      </div>` : ''}
  `;
  wrap.appendChild(t);
  t.querySelector('.toast-close').onclick = ()=> removeToast(t);
  if(onClick){
    t.classList.add('toast-click');
    t.addEventListener('click', e=>{ if(e.target.closest('.toast-close')) return; removeToast(t); try{ onClick(); }catch(err){ console.error(err); } });
  }
  t._toastTimer = setTimeout(()=> removeToast(t), sticky ? 15000 : 6000);
  return t;
}

// ===== Cửa sổ xác nhận nổi (dùng cho xóa acc, xóa người dùng...) =====
// Bấm Enter để xác nhận (giống bấm nút chính), Esc để hủy.
function openConfirmModal({title, message, confirmLabel, danger}){
  return new Promise(resolve=>{
    const ov = document.createElement('div'); ov.className='overlay';
    ov.innerHTML = `<div class="modal" style="max-width:380px">
      <h3>${escapeHtml(title||'Xác nhận')}</h3>
      <p style="font-size:14px;line-height:1.5;margin:0 0 4px">${escapeHtml(message||'')}</p>
      <div class="rowbtn">
        <button id="confirmCancel">Hủy</button>
        <button id="confirmOk" class="primary"${danger!==false?' style="background:var(--danger);border-color:var(--danger);color:#fff"':''}>${escapeHtml(confirmLabel||'Xác nhận')}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    function close(result){
      document.removeEventListener('keydown', onKey);
      ov.remove();
      resolve(result);
    }
    function onKey(e){
      if(e.key === 'Enter'){ e.preventDefault(); close(true); }
      else if(e.key === 'Escape'){ e.preventDefault(); close(false); }
    }
    document.addEventListener('keydown', onKey);
    ov.querySelector('#confirmCancel').onclick = ()=> close(false);
    ov.querySelector('#confirmOk').onclick = ()=> close(true);
    ov.onclick = e=>{ if(e.target===ov) close(false); };
    ov.querySelector('#confirmOk').focus();
  });
}

// ===== Đăng nhập =====
// Người dùng thường: chỉ cần gõ tên là vào được ngay, không cần mật khẩu, không cần admin duyệt.
// Chỉ Admin tổng (tên trong firebase-config.js) và admin phụ (được tạo trong tab Quản trị) mới cần mật khẩu.
//
// Ghi nhớ đăng nhập: sau khi vào được trang (dù là người dùng thường hay admin), tên + quyền
// được lưu lại trên chính trình duyệt/thiết bị đó (localStorage). Lần sau mở lại trang này —
// hoặc bấm tải lại (F5) — trên CÙNG trình duyệt/thiết bị sẽ tự vào lại ngay, không cần gõ tên
// hay mật khẩu lần nữa. Đây là ghi nhớ theo từng trình duyệt: mở trang trên máy/trình duyệt
// khác lần đầu vẫn cần đăng nhập như bình thường.
function rememberSession(name, role){
  localStorage.setItem('acc_myname', name);
  localStorage.setItem('acc_myrole', role);
}
function clearSession(){
  localStorage.removeItem('acc_myname');
  localStorage.removeItem('acc_myrole');
}

document.getElementById('loginBtn').onclick = ()=>{
  const v = document.getElementById('loginName').value.trim();
  const p = document.getElementById('loginPass').value;
  if(!v) return;
  checkAndEnter(v, p);
};
document.getElementById('logoutBtn').onclick = ()=>{
  clearSession();
  location.reload();
};
enableFieldNav(
  [document.getElementById('loginName'), document.getElementById('loginPass')],
  ()=> document.getElementById('loginBtn').click()
);

const rememberedRole = localStorage.getItem('acc_myrole') || '';
if(myName && rememberedRole) autoEnter(myName, rememberedRole);
else if(myName) checkAndEnter(myName, '');
else Loader.pageDone(); // phiên cũ từ trước khi có ghi nhớ quyền — chỉ tự vào lại được nếu là người dùng thường

// Tự vào lại bằng phiên đã ghi nhớ trên thiết bị này, không cần nhập lại mật khẩu.
// Với admin/admin phụ vẫn kiểm tra lại quyền hiện tại trong Firestore, phòng trường hợp
// quyền đã bị Admin tổng thu hồi từ lúc đăng nhập trước.
async function autoEnter(name, role){
  myName = name;
  document.getElementById('login').classList.add('hide');
  const key = userKey(name);
  const isSuperAdminName = name.toLowerCase().trim() === ADMIN_NAME.toLowerCase().trim();

  if(role === 'superadmin' && isSuperAdminName){
    myRole = 'superadmin';
  } else if(role === 'admin'){
    let snap;
    try{ snap = await db.collection(COL.users).doc(key).get(); }catch(e){ snap = null; }
    const existing = (snap && snap.exists) ? snap.data() : null;
    if(existing && existing.status === 'admin'){
      myRole = 'admin';
    } else {
      // Quyền admin phụ đã bị thu hồi — quay lại màn hình đăng nhập.
      clearSession();
      document.getElementById('login').classList.remove('hide');
      Loader.pageDone();
      return;
    }
  } else {
    myRole = 'user';
    await db.collection(COL.users).doc(key).set({name, status:'user'}, {merge:true}).catch(()=>{});
  }
  rememberSession(name, myRole);
  subscribeUsers();
  enterApp();
}

async function checkAndEnter(name, password){
  myName = name;
  document.getElementById('login').classList.add('hide');
  document.getElementById('loginError').textContent = '';
  const key = userKey(name);
  const isSuperAdminName = name.toLowerCase().trim() === ADMIN_NAME.toLowerCase().trim();
  let snap;
  try{ snap = await db.collection(COL.users).doc(key).get(); }catch(e){ snap = null; }
  const existing = (snap && snap.exists) ? snap.data() : null;

  if(isSuperAdminName){
    // Admin tổng: bắt buộc đúng mật khẩu cấu hình trong firebase-config.js
    if(password !== ADMIN_PASSWORD){
      document.getElementById('login').classList.remove('hide');
      document.getElementById('loginError').textContent = 'Sai mật khẩu.';
      Loader.pageDone();
      return;
    }
    myRole = 'superadmin';
    await db.collection(COL.users).doc(key).set({name, status:'superadmin'}, {merge:true}).catch(()=>{});
  } else if(existing && existing.status === 'admin'){
    // Admin phụ: bắt buộc đúng mật khẩu đã được Admin tổng đặt cho tài khoản này.
    if(existing.password !== password){
      document.getElementById('login').classList.remove('hide');
      document.getElementById('loginError').textContent = 'Sai mật khẩu.';
      Loader.pageDone();
      return;
    }
    myRole = 'admin';
  } else {
    // Người dùng thường: vào luôn chỉ cần tên, không cần mật khẩu, không cần chờ duyệt.
    myRole = 'user';
    await db.collection(COL.users).doc(key).set({name, status:'user'}, {merge:true}).catch(()=>{});
  }
  rememberSession(name, myRole);
  subscribeUsers();
  enterApp();
}


function subscribeUsers(){
  db.collection(COL.users).onSnapshot(snap=>{
    allUsers = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(isStaff()) renderAdmin();
  });
}

async function enterApp(){
  document.getElementById('app').classList.remove('hide');
  const roleLabel = myRole==='superadmin' ? ' (Admin tổng)' : myRole==='admin' ? ' (Quản trị viên)' : '';
  document.getElementById('whoAmI').textContent = 'Xin chào, '+myName+roleLabel;
  const staff = isStaff();
  // Người dùng thường chỉ được xem 2 trang: Trang chủ và Acc đã thêm.
  // Thùng rác, Lịch sử và Quản trị chỉ dành cho quản trị viên / admin tổng.
  document.getElementById('navTrash').classList.toggle('hide', !staff);
  document.getElementById('navHistory').classList.toggle('hide', !staff);
  document.getElementById('navAdmin').classList.toggle('hide', !staff);
  document.getElementById('navMarkup').classList.toggle('hide', myRole!=='superadmin');
  document.getElementById('navRemind').classList.toggle('hide', !staff);
  document.getElementById('navTheme').classList.toggle('hide', myRole!=='superadmin');
  // Người dùng thường không được thêm acc.
  document.getElementById('addFab').classList.toggle('hide', !staff);
  // Vào giao diện ngay, không chờ các việc nền (ghi log đăng nhập, dọn dữ liệu cũ) để khởi động nhanh hơn.
  bindTabs();
  bindAdd();
  bindAdminPanel();
  if(isStaff()) startMarkupListener();
  recordLogin(myName);
  startPresence();
  if(staff) startRemindTimer();
  try{ await loadData(); }finally{ Loader.pageDone(); }
  renderHome();
  if(staff){ renderRemind(); checkDueReminders(); }
}

async function recordLogin(name){
  // Mỗi người dùng chỉ có đúng 1 dòng lịch sử (ghi đè theo tên) — luôn là lần truy cập gần nhất,
  // không lưu cả danh sách các lần đăng nhập cũ.
  const key = userKey(name);
  const now = Date.now();
  try{ await db.collection(COL.logins).doc(key).set({name, loginAt: now, lastSeen: now}, {merge:true}); }catch(e){}
  const idx = logins.findIndex(l=>l.id===key);
  if(idx>=0){ logins[idx].loginAt = now; logins[idx].lastSeen = now; logins[idx].name = name; }
  else logins.push({id:key, name, loginAt: now, lastSeen: now});
}

// ===== Trạng thái online (nhịp tim mỗi 20s) =====
// Nhịp tim này cũng cập nhật "lastSeen" của dòng lịch sử truy cập, dùng để tính
// thời lượng hoạt động của lần truy cập gần nhất.
function startPresence(){
  const key = userKey(myName);
  const ping = ()=>{
    const now = Date.now();
    db.collection(COL.presence).doc(key).set({name: myName, lastSeen: now}).catch(()=>{});
    db.collection(COL.logins).doc(key).set({lastSeen: now}, {merge:true}).catch(()=>{});
    const rec = logins.find(l=>l.id===key); if(rec) rec.lastSeen = now;
    if(document.getElementById('tab-history') && !document.getElementById('tab-history').classList.contains('hide')) renderHistory();
  };
  ping();
  heartbeatTimer = setInterval(ping, 20000);
  db.collection(COL.presence).onSnapshot(snap=>{
    const now = Date.now();
    onlineNames = new Set(snap.docs.map(d=>d.data()).filter(p=> now - p.lastSeen < 40000).map(p=>p.name));
    renderHistory();
  });
  window.addEventListener('beforeunload', ()=> db.collection(COL.presence).doc(key).delete().catch(()=>{}));
}

// ===== Dữ liệu acc =====
let oldLoaded = false, oldStarted = false, oldCount = 0;
async function loadData(){
  // Hiện tạm dữ liệu gần đây đã lưu từ lần trước (nếu có) để thấy ngay, trong lúc chờ dữ liệu mới từ máy chủ.
  try{
    const cached = JSON.parse(localStorage.getItem('acc_cache_accounts')||'null');
    if(cached && cached.length){ const seenC = new Set(); accounts = cached.filter(a=>{ if(seenC.has(a.id)) return false; seenC.add(a.id); return true; }); renderHome(); }
  }catch(e){}
  const [accSnap, loginSnap, accSnap2] = await startPreload();
  const docsOf = (snap, src)=> snap ? snap.docs.filter(d=>!isSettingsDoc(d.id)).map(d=>({id:d.id, ...d.data(), _src:src})) : null;
  const r1 = docsOf(accSnap,1), r2 = docsOf(accSnap2,2);
  // Phần "gần đây": thay bằng dữ liệu mới nhất từ máy chủ (project nào tải lỗi thì giữ bản cache).
  accounts = accounts.filter(a=> !(a.addedAt >= recentCutoff && (((a._src||1)===1) ? r1 : r2))).concat(r1||[], r2||[]);
  // Mấy ngày gần đây chưa có đủ acc để trang chủ hiện 30 acc mới nhất -> lấy thêm 30 acc mới nhất mỗi project (rất nhẹ).
  if(accounts.filter(isLive).length < 30){
    const top = async (src, d)=>{
      try{ const sn = await withTimeout(d.collection(COL.accounts).orderBy('addedAt','desc').limit(30).get(), 6000); return docsOf(sn, src) || []; }
      catch(e){ return []; }
    };
    const [t1, t2] = await Promise.all([top(1, db), db2 ? top(2, db2) : Promise.resolve([])]);
    mergeMany(t1.concat(t2));
  }
  if(loginSnap) logins = loginSnap.docs.map(d=>({id:d.id, ...d.data()}));
  scheduleCacheSave();
  startAccountsListener();   // từ đây acc thay đổi tự cập nhật, không cần F5
  // Giai đoạn 2: tải acc cũ ngầm, sau khi giao diện đã hiện xong.
  if(!oldStarted){ oldStarted = true; setTimeout(()=>loadOlderAccounts(), 1500); }
  purgeDuplicateLogins().then(()=>{ if(isStaff()) renderHistory(); });
}

// Gộp danh sách acc vào bộ nhớ THEO id+project. Bản nào có updatedAt mới hơn thì thắng (lô tải chậm không đè lên bản vừa sửa).
function mergeMany(list){
  if(!list || !list.length) return;
  const idx = new Map();
  accounts.forEach((a,i)=> idx.set(a.id+'|'+(a._src||1), i));
  list.forEach(n=>{
    const k = n.id+'|'+(n._src||1), i = idx.get(k);
    if(i === undefined){ idx.set(k, accounts.length); accounts.push(n); }
    else if((accounts[i].updatedAt||0) <= (n.updatedAt||0)) accounts[i] = n;
  });
}

// Vẽ lại có giãn cách để các lô dữ liệu dồn dập không làm đơ trang.
let renderTimer = null, lastRenderAt = 0;
function scheduleRender(minGap){
  if(renderTimer) return;
  const wait = Math.max(100, (minGap||0) - (Date.now()-lastRenderAt));
  renderTimer = setTimeout(()=>{
    renderTimer = null; lastRenderAt = Date.now();
    renderHome(); renderAll(); renderTrash(); renderRemind(); renderHistory();
    if(myRole==='superadmin'){ const t = document.getElementById('tab-markup'); if(t && !t.classList.contains('hide')) renderMarkupPage(); }
    if(isStaff()) checkDueReminders();
    scheduleCacheSave();
  }, wait);
}
// Cache cục bộ chỉ giữ acc GẦN ĐÂY (tối đa ~3,5MB) — trước đây lưu cả kho nên vượt hạn mức trình duyệt và làm đơ máy khi chuyển thành chuỗi.
let cacheTimer = null;
function scheduleCacheSave(){
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(()=>{
    try{
      const recent = accounts.filter(a=>a.addedAt >= recentCutoff && !a._pending).sort((x,y)=>y.addedAt-x.addedAt);
      const keep = []; let size = 0;
      for(const a of recent){ const n = (a.imageUrl||'').length + 600; if(size+n > 3500000) break; size += n; keep.push(a); }
      localStorage.setItem('acc_cache_accounts', JSON.stringify(keep));
    }catch(e){}
  }, 3000);
}

// Thanh trạng thái nhỏ ở góc trái dưới khi đang tải ngầm acc cũ.
function setBgLoad(text, cls, onClick){
  const el = document.getElementById('bgLoad'); if(!el) return;
  if(!text){ el.classList.add('hide'); el._t = ''; return; }
  if(el._t === text+'|'+(cls||'') && !el.classList.contains('hide')) return;   // cùng nội dung thì khỏi ghi lại (không nháy)
  el._t = text+'|'+(cls||'');
  el.className = 'bgload '+(cls||''); el.textContent = text; el.onclick = onClick || null;
}
// Giai đoạn 2: tải acc cũ (addedAt < mốc 2 ngày) theo lô OLD_PAGE, mới -> cũ. Hai project chạy song song.
async function loadOlderAccounts(){
  setBgLoad('⟳ Đang làm mới dữ liệu…', 'run');
  const run = async (src, database)=>{
    let last = null;
    for(;;){
      let q = database.collection(COL.accounts).where('addedAt','<',recentCutoff).orderBy('addedAt','desc').limit(OLD_PAGE);
      if(last) q = q.startAfter(last);
      let snap;
      try{ snap = await q.get(); }
      catch(e){ console.error('Tải acc cũ (project '+src+') lỗi:', e); return false; }
      if(snap.empty) return true;
      mergeMany(snap.docs.filter(d=>!isSettingsDoc(d.id)).map(d=>({id:d.id, ...d.data(), _src:src})));
      oldCount += snap.size; last = snap.docs[snap.docs.length-1];
      setBgLoad('⟳ Đang làm mới dữ liệu…', 'run');
      scheduleRender(900);
      if(snap.size < OLD_PAGE) return true;
      await new Promise(r=>setTimeout(r, 150));   // nhường CPU cho giao diện giữa các lô
    }
  };
  const res = await Promise.all([run(1, db), db2 ? run(2, db2) : Promise.resolve(true)]);
  if(res.every(Boolean)){
    oldLoaded = true;
    setBgLoad('✓ Đã làm mới xong', 'done');
    setTimeout(()=>setBgLoad(''), 3000);
    scheduleRender(0);
    purgeOld();   // dọn acc quá hạn: chỉ làm khi đã có đủ dữ liệu
  } else {
    setBgLoad('Làm mới dữ liệu bị lỗi — bấm vào đây để thử lại', 'err', ()=>{ oldCount = 0; loadOlderAccounts(); });
  }
}
// Trong lúc acc cũ chưa tải xong, kiểm tra trùng mã trực tiếp trên máy chủ để không lưu trùng với acc cũ chưa kịp tải.
async function ensureNoOldDup(codes){
  if(oldLoaded) return;
  const list = Array.from(new Set((Array.isArray(codes)?codes:[codes]).map(c=>(c||'').trim()).filter(Boolean)));
  if(!list.length) return;
  const found = [];
  await Promise.all(list.flatMap(code => [[1,db],[2,db2]].filter(x=>x[1]).map(async ([src,d])=>{
    try{ const sn = await withTimeout(d.collection(COL.accounts).where('code','==',code).get(), 6000); if(sn) sn.docs.forEach(x=>{ if(!isSettingsDoc(x.id)) found.push({id:x.id, ...x.data(), _src:src}); }); }
    catch(e){}
  })));
  mergeMany(found);
}

// Mỗi nick chỉ được phép có đúng 1 dòng lịch sử truy cập (dòng có "loginAt" mới nhất).
// Nếu vì lý do gì đó có nhiều hơn 1 dòng cho cùng 1 nick (vd dữ liệu cũ từ trước, hoặc truy cập
// dồn dập tạo lệch), hàm này tự xóa hết các dòng thừa trên Firestore và chỉ giữ lại đúng 1 dòng
// chuẩn (id = mã hóa từ tên) cho mỗi nick.
async function purgeDuplicateLogins(){
  const byKey = {};
  logins.forEach(l=>{
    const k = userKey(l.name);
    (byKey[k] = byKey[k] || []).push(l);
  });
  const deduped = [];
  for(const k in byKey){
    const group = byKey[k].sort((a,b)=> (b.loginAt||0)-(a.loginAt||0));
    const keep = group[0];
    const extras = group.slice(1);
    for(const ex of extras){
      if(ex.id !== k) await db.collection(COL.logins).doc(ex.id).delete().catch(()=>{});
    }
    if(keep.id !== k){
      // Dòng giữ lại đang ở id kiểu cũ (không phải id chuẩn theo tên) — chuyển về đúng id chuẩn.
      await db.collection(COL.logins).doc(k).set({name: keep.name, loginAt: keep.loginAt, lastSeen: keep.lastSeen}, {merge:true}).catch(()=>{});
      await db.collection(COL.logins).doc(keep.id).delete().catch(()=>{});
      keep.id = k;
    }
    deduped.push(keep);
  }
  logins = deduped;
}

async function purgeOld(){
  const now = Date.now();
  const fourMonths = EXPIRE_MS;
  const day = 1000*60*60*24;
  for(const a of [...accounts]){
    if(!a.deletedAt && !a.sold && now - a.addedAt > fourMonths){
      await accCol(a).doc(a.id).delete().catch(()=>{});
      accounts = accounts.filter(x=>x.id!==a.id);
    } else if(a.deletedAt && now - a.deletedAt > day){
      await accCol(a).doc(a.id).delete().catch(()=>{});
      accounts = accounts.filter(x=>x.id!==a.id);
    }
  }
}

// ===== Tabs =====
function bindTabs(){
  document.querySelectorAll('nav button').forEach(btn=>{
    btn.onclick = ()=>{
      if(btn.classList.contains('hide')) return; // phòng trường hợp nút bị ẩn nhưng vẫn có trong DOM
      document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      ['home','all','trash','history','admin','markup','remind','theme'].forEach(t=>{ const e = document.getElementById('tab-'+t); if(e) e.classList.add('hide'); });
      document.getElementById('tab-'+btn.dataset.tab).classList.remove('hide');
      if(btn.dataset.tab==='all') renderAll();
      if(btn.dataset.tab==='trash' && isStaff()) renderTrash();
      if(btn.dataset.tab==='history' && isStaff()) renderHistory();
      if(btn.dataset.tab==='admin' && isStaff()) renderAdmin();
      if(btn.dataset.tab==='markup' && myRole==='superadmin') renderMarkupPage();
      if(btn.dataset.tab==='remind' && isStaff()){ renderRemind(); askNotifyPerm(); }
      if(btn.dataset.tab==='theme' && myRole==='superadmin' && window.SiteTheme) SiteTheme.render();
    };
  });
  let searchTimer = null;
  document.getElementById('searchInput').oninput = ()=>{ homeExact = null; clearTimeout(searchTimer); searchTimer = setTimeout(renderHome, 120); };
}

// ===== Thẻ acc =====
// Người dùng thường chỉ được thấy mã acc và ảnh — không thấy giá, mô tả, ngày thêm,
// và không có nút Sửa / Xóa.
function cardHtml(a, kw, opts){
  opts = opts||{};
  const viewer = isViewer();
  const codeHtml = highlight(a.code||'', kw);
  const descHtml = highlight(a.desc||'', kw);
  const img = a.imageUrl ? `<img src="${a.imageUrl}" data-id="${a.id}" class="zoomtrig" loading="lazy" decoding="async">` : `<div style="aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:12px;border-bottom:2px solid var(--line)">Không có ảnh</div>`;
  const actions = viewer ? '' : `<div class="actions">
      ${opts.trash ? `<button class="ok" data-restore="${a.id}">Khôi phục</button>` : `<button class="edit" data-edit="${a.id}">Sửa</button><button class="del" data-del="${a.id}">Xóa</button>`}
    </div>`;
  const goodRed = (myRole==='superadmin' && (a.markupPriority||[]).includes('good_price')) ? ' mk-good' : '';
  const pend = a._failed ? '<span class="pendbadge err">⚠ Chưa lưu được</span>' : (a._pending ? '<span class="pendbadge">⏳ Đang lưu…</span>' : '');
  const dupN = dupCountFor(a);
  const dupBadge = dupN > 1 ? `<button type="button" class="dupbadge" data-dupgo="${escapeHtml(a.code||'')}" title="Bấm để xem tất cả acc trùng mã này">⚠ Trùng mã ×${dupN}</button>` : '';
  return `<div class="card${goodRed}${dupN>1?' dupflag':''}" data-id="${a.id}"${dupN>1?` data-dupcode="${escapeHtml(a.code||'')}"`:''}>
    ${pend}${dupBadge}${img}
    <div class="info">
      <span class="code">${codeHtml||'(chưa có mã)'}</span>
      ${(!viewer && a.price) ? `<div class="price">${highlight(a.price, kw)}</div>` : ''}
      ${(!viewer && a.markup) ? `<div class="mk-line ${a.markupStatus==='pending'?'pending':'approved'}">Tăng +${fmtMoney(a.markup)} · ${a.markupStatus==='pending'?('chờ duyệt'+((a.markupPriority||[]).length?' · ưu tiên: '+a.markupPriority.map(k=>PRIO_LABEL[k]).filter(Boolean).join(', '):'')):'đã duyệt'}</div>` : ''}
      ${!viewer ? `<div class="desc">${descHtml}</div>` : ''}
      ${!viewer ? `<div class="meta">Thêm: ${fmtDate(a.addedAt)}${a.deletedAt?('<br>Xóa: '+fmtDate(a.deletedAt)):''}</div>` : ''}
    </div>
    ${actions}
  </div>`;
}

function attachCardEvents(container){
  setTimeout(kbPaint,0);
  // Acc trùng mã (viền đỏ): bấm vào acc -> sang Trang chủ, tự tìm mã trùng. Đang ở đúng kết quả tìm đó thì bấm ảnh để phóng to như bình thường.
  container.querySelectorAll('.zoomtrig').forEach(img=> img.onclick = ()=>{
    const card = img.closest('.card.dupflag');
    if(card && !isSearchingCode(card.dataset.dupcode)) goToDupSearch(card.dataset.dupcode); else openZoom(img.dataset.id);
  });
  container.querySelectorAll('.card.dupflag').forEach(card=> card.addEventListener('click', e=>{
    if(e.target.closest('button,.zoomtrig,a,select,input')) return;
    if(!isSearchingCode(card.dataset.dupcode)) goToDupSearch(card.dataset.dupcode);
  }));
  container.querySelectorAll('[data-dupgo]').forEach(b=> b.onclick = e=>{ e.stopPropagation(); goToDupSearch(b.dataset.dupgo); });
  if(isViewer()) return; // Người dùng thường: chỉ xem ảnh, không có nút sửa/xóa để gắn sự kiện.
  container.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = (e)=>{ e.stopPropagation(); openEditModal(b.dataset.edit); };
  });
  container.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick = (e)=>{ e.stopPropagation(); removeFlow(b.dataset.del); };
  });
  container.querySelectorAll('[data-restore]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.restore;
      const a = accounts.find(x=>x.id===id);
      await accCol(a).doc(id).update({deletedAt: null}).catch(()=>{});
      if(a) a.deletedAt = null;
      renderTrash(); renderAll(); renderHome();
    };
  });
}

function openZoom(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  const viewer = isViewer();
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    ${a.imageUrl?`<img class="zoomimg" src="${a.imageUrl}">`:''}
    <div style="margin-top:10px" class="code tag">${escapeHtml(a.code||'')}</div>
    ${(!viewer && a.price) ? `<div class="price">${escapeHtml(a.price)}</div>` : ''}
    ${(!viewer && a.markup) ? `<div class="mk-line ${a.markupStatus==='pending'?'pending':'approved'}">Tăng +${fmtMoney(a.markup)} · ${a.markupStatus==='pending'?('chờ duyệt'+((a.markupPriority||[]).length?' · ưu tiên: '+a.markupPriority.map(k=>PRIO_LABEL[k]).filter(Boolean).join(', '):'')):'đã duyệt'}</div>` : ''}
    ${!viewer ? `<p style="font-size:14px">${escapeHtml(a.desc||'')}</p>` : ''}
    ${!viewer ? `<div class="meta" style="font-size:12px;color:var(--sub)">Thêm lúc: ${fmtDate(a.addedAt)}</div>` : ''}
  </div>`;
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.onclick = e=>{ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ===== Sửa ACC đã thêm =====
// Bắt buộc đủ 4 thông tin: ảnh, mã, giá, mô tả (ảnh có thể là ảnh cũ nếu không đổi ảnh mới).
function openEditModal(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  let newBlob = null;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    <h3>Sửa ACC</h3>
    <label>Ảnh (bấm vào khung để đổi ảnh khác, dán Ctrl+V hoặc chọn file)</label>
    <div class="dropzone" id="dzEdit" tabindex="0">${a.imageUrl ? `<img src="${a.imageUrl}">` : 'Dán ảnh (Ctrl+V) · kéo thả ảnh vào đây · hoặc bấm để chọn file'}</div>
    <div id="imgErrEdit" class="fielderr"></div>
    <input type="file" id="fileInputEdit" accept="image/*" class="hide">
    <label>Mã số (vd 12/205)</label>
    <input id="codeInputEdit" placeholder="12/205" value="${escapeHtml(a.code||'')}">
    <div id="codeErrEdit" class="fielderr"></div>
    <div id="dupBoxEdit" class="dupbox"></div>
    <label>Giá</label>
    <input id="priceInputEdit" placeholder="vd 50.000đ" value="${escapeHtml(a.price||'')}">
    <div id="priceErrEdit" class="fielderr"></div>
    <label>Mô tả / thông tin khác</label>
    <textarea id="descInputEdit" placeholder="Thông tin thêm...">${escapeHtml(a.desc||'')}</textarea>
    <div id="descErrEdit" class="fielderr"></div>
    ${markupSelectHtml('markupSelEdit', a.markup||null, a.markupPriority)}
    <div class="rowbtn">
      <button id="cancelEdit">Hủy</button>
      <button id="saveEdit" class="primary">Lưu thay đổi</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dzEdit');
  const fileInput = ov.querySelector('#fileInputEdit');
  const imgErrEdit = ov.querySelector('#imgErrEdit');
  const mkEdit = enableMarkupPicker(ov, 'markupSelEdit', '#saveEdit', ov.querySelector('#descInputEdit'));
  enableFieldNav(
    [ov.querySelector('#codeInputEdit'), ov.querySelector('#priceInputEdit'), ov.querySelector('#descInputEdit')],
    ()=> ov.querySelector('#saveEdit').click(),
    ()=> mkEdit.open()
  );
  function clearImgErr(){ imgErrEdit.textContent=''; dz.style.borderColor=''; }
  dz.onclick = ()=> fileInput.click();
  fileInput.onchange = ()=>{ if(fileInput.files[0]){ newBlob = fileInput.files[0]; showPreview(dz, newBlob); clearImgErr(); compressCached(newBlob).catch(()=>{}); } };
  function setImage(files){
    newBlob = files[0]; showPreview(dz, newBlob); clearImgErr();
    showToast({ title:'Đã đổi ảnh', message: fmtSize(newBlob.size)+' — bấm Lưu thay đổi để áp dụng.' });
    compressCached(newBlob).catch(()=>{});   // nén sẵn trong lúc bạn nhập thông tin
  }
  const unregisterPaste = registerPasteTarget(ov, setImage);
  bindImageDrop(ov, dz, setImage);
  const codeInputEdit = ov.querySelector('#codeInputEdit');
  const codeErrEdit = ov.querySelector('#codeErrEdit');
  const priceInputEdit = ov.querySelector('#priceInputEdit');
  const priceErrEdit = ov.querySelector('#priceErrEdit');
  const descInputEdit = ov.querySelector('#descInputEdit');
  const descErrEdit = ov.querySelector('#descErrEdit');
  const dupUpdE = watchDupBox(ov, ov.querySelector('#dupBoxEdit'), ()=>codeInputEdit.value, a.id);
  codeInputEdit.oninput = ()=>{ codeErrEdit.textContent=''; codeInputEdit.style.borderColor=''; dupUpdE(); };
  dupUpdE();
  priceInputEdit.oninput = ()=>{ priceErrEdit.textContent=''; priceInputEdit.style.borderColor=''; };
  descInputEdit.oninput = ()=>{ descErrEdit.textContent=''; descInputEdit.style.borderColor=''; };
  ov.querySelector('.close-x').onclick = closeModal;
  ov.querySelector('#cancelEdit').onclick = closeModal;
  bindEnterSave(ov, ['markupSelEditGood'], '#saveEdit');
  ov.onclick = e=>{ if(e.target===ov) closeModal(); };
  function closeModal(){ unregisterPaste(); if(dz._previewUrl){ try{ URL.revokeObjectURL(dz._previewUrl); }catch(e){} } ov.remove(); }
  ov.querySelector('#saveEdit').onclick = async ()=>{
    const code = codeInputEdit.value.trim();
    const price = priceInputEdit.value.trim();
    const desc = descInputEdit.value.trim();
    const hasImage = !!(newBlob || a.imageUrl);

    // Bắt buộc điền đủ cả 4 thông tin: ảnh, mã, giá, mô tả.
    codeErrEdit.textContent=''; priceErrEdit.textContent=''; descErrEdit.textContent=''; clearImgErr();
    codeInputEdit.style.borderColor=''; priceInputEdit.style.borderColor=''; descInputEdit.style.borderColor='';
    let firstMissing = null;
    if(!hasImage){ imgErrEdit.textContent = 'Bắt buộc phải có ảnh.'; dz.style.borderColor='var(--danger)'; firstMissing = firstMissing||dz; }
    if(!code){ codeErrEdit.textContent = 'Bắt buộc phải điền mã số.'; codeInputEdit.style.borderColor='var(--danger)'; firstMissing = firstMissing||codeInputEdit; }
    if(!price){ priceErrEdit.textContent = 'Bắt buộc phải điền giá.'; priceInputEdit.style.borderColor='var(--danger)'; firstMissing = firstMissing||priceInputEdit; }
    if(!desc){ descErrEdit.textContent = 'Bắt buộc phải điền mô tả.'; descInputEdit.style.borderColor='var(--danger)'; firstMissing = firstMissing||descInputEdit; }
    const mkOkEdit = checkMarkup(ov, 'markupSelEdit');
    if(!mkOkEdit){ firstMissing = firstMissing||ov.querySelector('#markupSelEdit'); }
    const mkValEdit = parseInt(ov.querySelector('#markupSelEdit').value)||0;
    if(firstMissing){
      firstMissing.focus();
      showToast({ title:'Thiếu thông tin', message:'Vui lòng điền đủ ảnh, mã số, giá và mô tả trước khi lưu.', variant:'error' });
      return;
    }

    const dup = findDuplicateByCode(code, a.id);     // kiểm tra trùng trong bộ nhớ ngay; kiểm tra máy chủ chạy nền
    if(dup){
      codeErrEdit.textContent = 'Mã "'+code+'" đã tồn tại.';
      codeInputEdit.style.borderColor = 'var(--danger)';
      codeInputEdit.focus();
      dupUpdE();
      showToast({
        title: 'Mã đã tồn tại',
        message: 'Không thể lưu — mã "'+code+'" đã có '+findDupsByCode(code, a.id).length+' acc khác. Xem danh sách ngay dưới ô mã, có thể Sửa hoặc Xóa tại đó.',
        variant: 'error'
      });
      return;
    }
    const update = {code, price, desc, ...markupFields(mkValEdit, readPriority(ov,'markupSelEdit'), a)};
    const blobE = newBlob, tmpUrlE = blobE ? URL.createObjectURL(blobE) : null;
    const prev = {}; Object.keys(update).forEach(k=>{ prev[k] = a[k]; }); prev.imageUrl = a.imageUrl;
    Object.assign(a, update);                         // hiện thay đổi + đóng cửa sổ NGAY
    if(blobE){ a.imageUrl = tmpUrlE; a._pending = true; }
    closeModal();
    renderHome(); renderAll(); renderTrash();
    SaveQueue.add({
      label: 'Sửa '+code,
      run: async ()=>{
        const up = Object.assign({}, update);
        if(blobE){ try{ up.imageUrl = await compressCached(blobE); }catch(e){ console.error('Lỗi xử lý ảnh:', e); } }
        await ensureNoOldDup(code);                  // trùng với acc cũ vừa tải về: vẫn lưu, nhưng đánh dấu viền đỏ + báo trùng mã
        const d2 = findDuplicateByCode(code, id);
        await Loader.silent(()=>accCol(a).doc(id).update(up));
        return Object.assign({}, up, d2 ? {__dup:true} : {});
      },
      onDone: up=>{
        const hadDup = !!up.__dup; delete up.__dup;
        Object.assign(a, up); delete a._pending;
        if(tmpUrlE){ try{ URL.revokeObjectURL(tmpUrlE); }catch(e){} }
        renderHome(); renderAll(); renderTrash();
        if(hadDup) showToast({ title:'⚠ Trùng mã '+code, message:'Đã lưu nhưng mã này trùng với acc cũ. Đã viền đỏ — bấm vào đây để xem các acc trùng.', variant:'error', sticky:true, onClick:()=>goToDupSearch(code) });
        checkDupAlerts();
      },
      onFail: e=>{
        Object.assign(a, prev); delete a._pending;   // lưu lỗi -> trả về như cũ
        renderHome(); renderAll(); renderTrash();
        showToast({ title:'Không lưu được thay đổi', message:(e&&e.message||'Lỗi kết nối')+' — thay đổi chưa được lưu, hãy thử lại.', variant:'error' });
      }
    });
  };
}

// ===== Render các trang =====
function renderHome(){
  _dupMap = null; emitAccChanged();
  updateMarkupBadge(); updateHistoryBadge();
  const kw = document.getElementById('searchInput').value.trim();
  const active = accounts.filter(isLive);
  let results;
  const exact = !!(kw && homeExact && normalizeCode(kw)===homeExact);
  if(!kw){ results = [...active].sort((a,b)=>b.addedAt-a.addedAt).slice(0,30); }
  else if(exact){ results = active.filter(a=>normalizeCode(a.code)===homeExact).sort((a,b)=>b.addedAt-a.addedAt); }
  else{ const kwl = kw.toLowerCase(); results = active.filter(a => (a.code||'').toLowerCase().includes(kwl) || (a.desc||'').toLowerCase().includes(kwl) || (a.price||'').toLowerCase().includes(kwl)); }
  const box = document.getElementById('homeResults');
  box.parentElement.querySelectorAll('.tagsrow').forEach(n=>n.remove());   // xóa HẾT dòng ghi chú cũ (trước đây chỉ xóa 1 dòng nên các dòng chồng dần lên mỗi lần làm mới)
  if(!results.length){ box._html = null; box.innerHTML = '<div class="empty">'+(oldLoaded?'Không tìm thấy acc phù hợp':'⟳ Đang làm mới dữ liệu — kết quả sẽ tự cập nhật khi xong')+'</div>'; return; }
  if(kw && !oldLoaded){
    // Đang làm mới dữ liệu: chỉ 1 dòng cố định (không đếm số, không đổi chữ liên tục); xong thì tự cập nhật lại kết quả cho đúng.
    const n=document.createElement('div'); n.className='tagsrow'; n.style.cssText='margin-bottom:8px;font-size:12px;color:var(--sub)';
    n.textContent='⟳ Đang làm mới dữ liệu — kết quả sẽ tự cập nhật cho đúng khi xong'; box.before(n);
  }
  if(exact){
    const d=document.createElement('div'); d.className='tagsrow dupnote';
    d.innerHTML = '⚠ Đang hiện <b>'+results.length+'</b> acc trùng mã <b>'+escapeHtml(kw)+'</b> — Sửa hoặc Xóa để xử lý trùng. <button type="button" class="ghost-btn" id="clearDupSearch">Bỏ lọc</button>';
    box.before(d);
    d.querySelector('#clearDupSearch').onclick = ()=>{ homeExact = null; document.getElementById('searchInput').value=''; renderHome(); };
  } else if(kw && oldLoaded && results.length>1){     // danh sách "Trùng khớp" chỉ hiện khi dữ liệu đã đủ (tránh nhảy liên tục lúc đang tải)
    const d=document.createElement('div'); d.className='tagsrow';
    d.style.marginBottom='10px';
    d.innerHTML = 'Trùng khớp: '+results.map(r=>`<span class="tag">${escapeHtml(r.code||'?')}</span>`).join('');
    box.before(d);
  }
  const html = results.map(a=>cardHtml(a, kw)).join('');
  if(box._html === html) return;      // không đổi thì khỏi vẽ lại (tránh nháy ảnh khi dữ liệu nền về từng lô)
  box._html = html;
  box.innerHTML = html;
  attachCardEvents(box);
}

let allLimit = 60;
function renderAll(){
  const wrap = document.getElementById('tab-all');
  if(wrap.classList.contains('hide')) return; // tab đang ẩn: khỏi vẽ, mở tab sẽ vẽ sau
  const active = accounts.filter(isLive).sort((a,b)=>b.addedAt-a.addedAt);
  if(!active.length){ wrap.innerHTML = '<div class="empty">Chưa có acc nào</div>'; return; }
  // Nhóm theo tháng, rồi phân nhỏ theo từng ngày gửi trong tháng đó.
  const monthGroups = {};
  active.forEach(a=>{ const k=monthKey(a.addedAt); (monthGroups[k]=monthGroups[k]||[]).push(a); });
  let html = '', left = allLimit;
  Object.keys(monthGroups).sort().reverse().forEach(mk=>{
    if(left <= 0) return;
    html += `<div class="month-h">Tháng ${mk}</div>`;
    const dayGroups = {};
    monthGroups[mk].forEach(a=>{ const dk=dayKey(a.addedAt); (dayGroups[dk]=dayGroups[dk]||[]).push(a); });
    Object.keys(dayGroups).sort().reverse().forEach(dk=>{
      if(left <= 0) return;
      const items = dayGroups[dk], shown = items.slice(0, left); left -= shown.length;
      html += `<div class="day-h">${dayLabel(items[0].addedAt)} · ${items.length} acc</div><div class="grid">${shown.map(a=>cardHtml(a,'')).join('')}</div>`;
    });
  });
  // Chia trang: chỉ vẽ allLimit acc đầu để trang không nặng khi kho có hàng nghìn acc.
  const more = active.length - allLimit;
  if(more > 0) html += `<div style="text-align:center;margin:18px 0"><button class="ghost-btn" id="allMoreBtn">Hiện thêm 60 acc (còn ${more})</button></div>`;
  if(wrap._html === html) return;     // không đổi thì khỏi vẽ lại
  wrap._html = html;
  wrap.innerHTML = html;
  attachCardEvents(wrap);
  const mb = wrap.querySelector('#allMoreBtn');
  if(mb) mb.onclick = ()=>{ allLimit += 60; renderAll(); };
}

function renderTrash(){
  if(!isStaff()) return;
  const box = document.getElementById('trashList');
  if(document.getElementById('tab-trash').classList.contains('hide')) return;
  const trashed = accounts.filter(a=>a.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt);
  if(!trashed.length){ box.innerHTML = '<div class="empty">Thùng rác trống</div>'; return; }
  box.innerHTML = trashed.map(a=>cardHtml(a,'',{trash:true})).join('');
  attachCardEvents(box);
}

// Lịch sử truy cập: mỗi người chỉ hiện ĐÚNG 1 dòng — lần truy cập gần nhất (ngày giờ)
// và đã hoạt động trong bao lâu ở lần đó — không hiện cả danh sách các lần trước.
// Luôn gom theo tên (lấy lần loginAt mới nhất) trước khi hiển thị, để dù dữ liệu có lỡ
// sót bản ghi trùng/cũ thì màn hình vẫn chỉ hiện đúng 1 dòng cho mỗi nick.
function renderHistory(){
  if(!isStaff()) return;
  const box = document.getElementById('historyList');
  if(!box) return;
  if(document.getElementById('tab-history').classList.contains('hide')) return;
  renderNotices();
  if(!logins.length){ box.innerHTML = '<div class="empty">Chưa có lịch sử truy cập</div>'; return; }
  const latestByUser = {};
  logins.forEach(l=>{
    const k = userKey(l.name);
    if(!latestByUser[k] || (l.loginAt||0) > (latestByUser[k].loginAt||0)) latestByUser[k] = l;
  });
  const sorted = Object.values(latestByUser).sort((a,b)=> (b.loginAt||0)-(a.loginAt||0));
  box.innerHTML = sorted.map(l=>{
    const on = onlineNames.has(l.name);
    const dur = formatDuration((l.lastSeen||l.loginAt||0) - (l.loginAt||0));
    return `<div class="loghist">
      <span><span class="dot ${on?'on':'off'}"></span>${escapeHtml(l.name)}</span>
      <span class="meta">Gần nhất: ${fmtDate(l.loginAt)} · Hoạt động: ${dur}${on?' · đang online':''}</span>
    </div>`;
  }).join('');
}

// Khu thông báo ở đầu tab Lịch sử: acc sắp bị xóa tự động (24 giờ) + mã đang bị trùng. Bấm vào để tới đúng chỗ.
function renderNotices(){
  const box = document.getElementById('notifBox'); if(!box) return;
  _dupMap = null;
  const ex = expiringList(), groups = Array.from(getDupMap().values());
  let h = `<div class="section-h">🔔 Sắp bị xóa tự động trong 24 giờ (${ex.length})</div>`;
  h += ex.length
    ? `<div class="grid">${ex.map(a=>`<div class="ncard" data-goacc="${a.id}" tabindex="0" title="Bấm để chuyển tới acc này">
        ${a.imageUrl ? `<img src="${a.imageUrl}" loading="lazy" decoding="async" alt="">` : '<div class="nnoimg">Không có ảnh</div>'}
        <div class="ninfo"><span class="code tag">${escapeHtml(a.code||'(chưa có mã)')}</span>
        <div class="nleft">⏳ ${fmtLeft(a.addedAt+EXPIRE_MS-Date.now())}</div>
        <div class="rsmall">Bị xóa lúc ${fmtDate(a.addedAt+EXPIRE_MS)}</div></div></div>`).join('')}</div>`
    : '<div class="empty small">Không có acc nào sắp bị xóa trong 24 giờ tới. Acc tự xóa sau 4 tháng kể từ ngày thêm — web sẽ báo ở đây trước 24 giờ.</div>';
  h += `<div class="section-h">⚠ Mã đang bị trùng (${groups.length})</div>`;
  h += groups.length
    ? groups.map(g=>`<div class="dupgroup" data-dupgo="${escapeHtml(g[0].code||'')}" tabindex="0" title="Bấm để xem kết quả ở trang tìm kiếm">
        <div class="dg-h"><b>${escapeHtml(g[0].code||'')}</b> · ${g.length} acc <span class="dg-go">Xem kết quả →</span></div>
        <div class="dg-thumbs">${g.slice(0,8).map(a=>a.imageUrl?`<img src="${a.imageUrl}" loading="lazy" decoding="async" alt="">`:'').join('')}</div></div>`).join('')
    : '<div class="empty small">Không có mã nào bị trùng.</div>';
  if(box._html !== h){
    box._html = h; box.innerHTML = h;
    box.querySelectorAll('[data-goacc]').forEach(c=>{ const go = ()=>goToAcc(c.dataset.goacc); c.onclick = go; c.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } }; });
    box.querySelectorAll('[data-dupgo]').forEach(c=>{ const go = ()=>goToDupSearch(c.dataset.dupgo); c.onclick = go; c.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } }; });
  }
  updateHistoryBadge();
}

function renderAdmin(){
  if(!isStaff()) return;
  const superBox = document.getElementById('superOnlySection');
  const note = document.getElementById('adminNote');
  if(myRole!=='superadmin'){
    superBox.classList.add('hide');
    if(note) note.classList.remove('hide');
    return;
  }
  superBox.classList.remove('hide');
  if(note) note.classList.add('hide');

  // Danh sách người dùng thường (chỉ xem) — chỉ Admin tổng mới xóa được.
  const viewerBox = document.getElementById('viewerUsers');
  const viewers = allUsers.filter(u=>u.status==='user');
  viewerBox.innerHTML = viewers.length ? viewers.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts"><button style="color:var(--danger);border-color:var(--danger)" data-deluser="${u.id}">Xóa</button></div></div>`).join('') : '<div class="empty">Chưa có người dùng nào</div>';
  viewerBox.querySelectorAll('[data-deluser]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.deluser;
      const u = allUsers.find(x=>x.id===id);
      const ok = await openConfirmModal({
        title: 'Xóa người dùng',
        message: 'Xóa quyền truy cập của "'+(u?u.name:id)+'"? Người này sẽ cần nhập lại tên để vào lại.',
        confirmLabel: 'Xóa'
      });
      if(!ok) return;
      await db.collection(COL.users).doc(id).delete().catch(()=>{});
      await db.collection(COL.logins).doc(id).delete().catch(()=>{});
      await db.collection(COL.presence).doc(id).delete().catch(()=>{});
    };
  });

  const adminBox = document.getElementById('adminList');
  const admins = allUsers.filter(u=>u.status==='admin');
  adminBox.innerHTML = admins.length ? admins.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts"><button style="color:var(--danger);border-color:var(--danger)" data-removeadmin="${u.id}">Xóa quyền</button></div></div>`).join('') : '<div class="empty">Chưa có admin phụ nào</div>';
  adminBox.querySelectorAll('[data-removeadmin]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.removeadmin;
      const ok = await openConfirmModal({
        title: 'Xóa quyền quản trị',
        message: 'Gỡ quyền quản trị viên của tài khoản này?',
        confirmLabel: 'Xóa quyền'
      });
      if(!ok) return;
      await db.collection(COL.users).doc(id).delete().catch(()=>{});
    };
  });
}

function bindAdminPanel(){
  const btn = document.getElementById('addAdminBtn');
  if(!btn) return;
  enableFieldNav(
    [document.getElementById('newAdminUser'), document.getElementById('newAdminPass')],
    ()=> btn.click()
  );
  btn.onclick = async ()=>{
    if(myRole!=='superadmin') return;
    const uname = document.getElementById('newAdminUser').value.trim();
    const pass = document.getElementById('newAdminPass').value.trim();
    if(!uname || !pass) return;
    const key = userKey(uname);
    await db.collection(COL.users).doc(key).set({name: uname, status:'admin', username: uname, password: pass}).catch(()=>{});
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
  };
}

// ===== Thêm acc mới =====
function bindAdd(){
  const fab = document.getElementById('addFab');
  fab.onclick = ()=>{ fab.blur(); if(!isViewer()) openAddModal(); };
}

// Bắt buộc điền đủ cả 4: ảnh, mã, giá, mô tả trước khi lưu được.
function openAddModal(initialBlob){
  if(document.querySelector('.overlay[data-kind="add"]')) return; // đã mở rồi thì không mở chồng thêm
  pasteBlob = null;
  const ov = document.createElement('div'); ov.className='overlay'; ov.dataset.kind='add';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    <h3>Thêm ACC mới</h3>
    <label>Ảnh (dán Ctrl+V ở bất kỳ đâu, kéo thả, hoặc chọn file)</label>
    <div class="dropzone" id="dz" tabindex="0">Dán ảnh (Ctrl+V) · kéo thả ảnh vào đây · hoặc bấm để chọn file</div>
    <div id="imgErr" class="fielderr"></div>
    <input type="file" id="fileInput" accept="image/*" class="hide">
    <label>Mã số (vd 12/205)</label>
    <input id="codeInput" placeholder="Nhập mã (vd 12/205)">
    <div id="codeErr" class="fielderr"></div>
    <div id="dupBox" class="dupbox"></div>
    <label>Giá</label>
    <input id="priceInput" placeholder="vd 50.000đ">
    <div id="priceErr" class="fielderr"></div>
    <label>Mô tả / thông tin khác</label>
    <textarea id="descInput" placeholder="Thông tin thêm..."></textarea>
    <div id="descErr" class="fielderr"></div>
    ${markupSelectHtml('markupSelAdd', null)}
    <div class="rowbtn">
      <button id="cancelAdd">Hủy</button>
      <button id="saveAdd" class="primary">Lưu</button>
    </div>
    <button id="goBulk" style="width:100%;margin-top:10px;padding:10px;border:none;background:none;color:var(--sub);text-decoration:underline;font-size:12px">Thêm nhiều ảnh cùng lúc từ máy</button>
  </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dz');
  const fileInput = ov.querySelector('#fileInput');
  const imgErr = ov.querySelector('#imgErr');
  const mkAdd = enableMarkupPicker(ov, 'markupSelAdd', '#saveAdd', ov.querySelector('#descInput'));
  enableFieldNav(
    [ov.querySelector('#codeInput'), ov.querySelector('#priceInput'), ov.querySelector('#descInput')],
    ()=> ov.querySelector('#saveAdd').click(),
    ()=> mkAdd.open()
  );
  function clearImgErr(){ imgErr.textContent=''; dz.style.borderColor=''; }
  dz.onclick = ()=> fileInput.click();
  fileInput.onchange = ()=>{ if(fileInput.files[0]){ pasteBlob = fileInput.files[0]; showPreview(dz, pasteBlob); clearImgErr(); fileInput.value=''; if(!codeInput.value) codeInput.focus(); compressCached(pasteBlob).catch(()=>{}); } };
  function setImage(files){
    if(files.length > 1){ closeModal(); openBulkAddModal(files); return; }   // nhiều ảnh -> chuyển sang thêm hàng loạt
    pasteBlob = files[0]; showPreview(dz, pasteBlob); clearImgErr();
    showToast({ title:'Đã thêm ảnh', message: fmtSize(pasteBlob.size)+' — nhập mã số, giá, mô tả rồi bấm Lưu.' });
    if(!codeInput.value) codeInput.focus();   // ảnh vào xong nhảy thẳng tới ô mã số
    compressCached(pasteBlob).catch(()=>{});   // nén sẵn trong lúc bạn nhập thông tin
  }
  const unregisterPaste = registerPasteTarget(ov, setImage);
  bindImageDrop(ov, dz, setImage);
  const codeInput = ov.querySelector('#codeInput');
  const codeErr = ov.querySelector('#codeErr');
  const priceInput = ov.querySelector('#priceInput');
  const priceErr = ov.querySelector('#priceErr');
  const descInput = ov.querySelector('#descInput');
  const descErr = ov.querySelector('#descErr');
  // Gõ mã tới đâu, kiểm tra trùng tới đó: hiện TẤT CẢ acc trùng mã kèm nút Sửa / Xóa ngay dưới ô mã.
  const dupUpd = watchDupBox(ov, ov.querySelector('#dupBox'), ()=>codeInput.value, null);
  codeInput.oninput = ()=>{ codeErr.textContent=''; codeInput.style.borderColor=''; dupUpd(); };
  priceInput.oninput = ()=>{ priceErr.textContent=''; priceInput.style.borderColor=''; };
  descInput.oninput = ()=>{ descErr.textContent=''; descInput.style.borderColor=''; };
  ov.querySelector('.close-x').onclick = closeModal;
  ov.querySelector('#cancelAdd').onclick = closeModal;
  ov.querySelector('#goBulk').onclick = ()=>{ closeModal(); openBulkAddModal(); };
  if(initialBlob) setImage([initialBlob]);   // mở từ Ctrl+V ngoài trang chủ
  bindEnterSave(ov, ['markupSelAddGood'], '#saveAdd');
  function closeModal(){ unregisterPaste(); if(dz._previewUrl){ try{ URL.revokeObjectURL(dz._previewUrl); }catch(e){} } ov.remove(); }
  ov.querySelector('#saveAdd').onclick = async ()=>{
    const code = codeInput.value.trim();
    const price = priceInput.value.trim();
    const desc = descInput.value.trim();

    // Bắt buộc điền đủ cả 4 thông tin: ảnh, mã, giá, mô tả.
    codeErr.textContent=''; priceErr.textContent=''; descErr.textContent=''; clearImgErr();
    codeInput.style.borderColor=''; priceInput.style.borderColor=''; descInput.style.borderColor='';
    let firstMissing = null;
    if(!pasteBlob){ imgErr.textContent = 'Bắt buộc phải thêm ảnh.'; dz.style.borderColor='var(--danger)'; firstMissing = firstMissing||dz; }
    if(!code){ codeErr.textContent = 'Bắt buộc phải điền mã số.'; codeInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||codeInput; }
    if(!price){ priceErr.textContent = 'Bắt buộc phải điền giá.'; priceInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||priceInput; }
    if(!desc){ descErr.textContent = 'Bắt buộc phải điền mô tả.'; descInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||descInput; }
    const mkOkAdd = checkMarkup(ov, 'markupSelAdd');
    if(!mkOkAdd){ firstMissing = firstMissing||ov.querySelector('#markupSelAdd'); }
    const mkValAdd = parseInt(ov.querySelector('#markupSelAdd').value)||0;
    if(firstMissing){
      firstMissing.focus();
      showToast({ title:'Thiếu thông tin', message:'Vui lòng điền đủ ảnh, mã số, giá và mô tả trước khi lưu.', variant:'error' });
      return;
    }

    // Kiểm tra trùng NGAY trong bộ nhớ (không chờ mạng). Kiểm tra với máy chủ + nén + ghi Firebase chạy ở hàng đợi độc lập.
    const dup = findDuplicateByCode(code);
    if(dup){
      codeErr.textContent = 'Mã "'+code+'" đã tồn tại.';
      codeInput.style.borderColor = 'var(--danger)';
      codeInput.focus();
      dupUpd();
      const bx = ov.querySelector('#dupBox'); if(bx && bx.scrollIntoView) bx.scrollIntoView({block:'nearest'});
      showToast({
        title: 'Mã đã tồn tại',
        message: 'Không thể thêm — mã "'+code+'" đã có '+findDupsByCode(code).length+' acc. Xem danh sách ngay dưới ô mã, có thể Sửa hoặc Xóa tại đó.',
        variant: 'error'
      });
      return;
    }
    const id = uid(), blob = pasteBlob, addedAt = Date.now(), tmpUrl = URL.createObjectURL(blob);
    const meta = markupFields(mkValAdd, readPriority(ov,'markupSelAdd'));
    compressCached(blob).catch(()=>{});   // (đã nén sẵn từ lúc chọn ảnh)
    upsertAcc({id, code, price, desc, imageUrl:tmpUrl, addedAt, deletedAt:null, ...meta, _src:newAccSrc(), _pending:true});
    pasteBlob = null;
    closeModal();
    renderHome(); renderAll();                       // acc hiện NGAY, cửa sổ đóng NGAY
    SaveQueue.add({
      label: 'Mã '+code,
      run: async ()=>{
        const imageUrl = await compressCached(blob).catch(e=>{ console.error('Lỗi xử lý ảnh:', e); return ''; });
        await ensureNoOldDup(code);                  // acc cũ chưa tải xong -> hỏi máy chủ (chạy nền)
        const d2 = findDuplicateByCode(code, id);    // trùng với acc cũ vừa tải về: VẪN LƯU, nhưng đánh dấu viền đỏ + báo trùng mã
        const data = {code, price, desc, imageUrl, addedAt, deletedAt:null, ...meta};
        const src = await Loader.silent(()=>saveNewAcc(id, data));
        if(!src) throw new Error('Không lưu được (cả hai project đều lỗi hoặc hết hạn mức)');
        return {src, data, dup:d2};
      },
      onRetry: ()=>{ const cur = accounts.find(x=>x.id===id); if(cur){ delete cur._failed; renderHome(); renderAll(); } },
      onDone: ({src, data, dup})=>{
        const cur = accounts.find(x=>x.id===id);
        if(cur){ Object.assign(cur, data, {_src:src}); delete cur._pending; delete cur._failed; dedupeId(id, cur); }
        try{ URL.revokeObjectURL(tmpUrl); }catch(e){}
        renderHome(); renderAll();
        if(dup) showToast({ title:'⚠ Trùng mã '+code, message:'Acc đã lưu nhưng trùng mã với acc cũ (chưa tải xong lúc bạn nhập). Đã viền đỏ — bấm vào đây để xem các acc trùng.', variant:'error', sticky:true, onClick:()=>goToDupSearch(code) });
        else showToast({ title:'Đã lưu acc', message:'Mã '+code+' · lưu vào Firebase '+src+(db2?'/2':'') });
        checkDupAlerts();
      },
      onFail: e=>{
        const i = accounts.findIndex(x=>x.id===id);
        if(i>=0) accounts[i]._failed = true;         // giữ lại trên màn hình, bấm nhãn ở đáy để thử lại
        showToast({ title:'Chưa lưu được acc mã '+code, message:(e&&e.message||'Lỗi kết nối')+'. Bấm nhãn ⚠ ở đáy màn hình để thử lại.', variant:'error' });
        renderHome(); renderAll();
      }
    });
  };
}

// ===== Thêm nhiều ACC cùng lúc từ nhiều ảnh chọn sẵn trên máy =====
// Mỗi ảnh cũng bắt buộc phải có đủ mã, giá, mô tả (ảnh thì luôn có sẵn vì chọn từ máy)
// trước khi "Lưu tất cả" được phép chạy.
let bulkItems = [];
let bulkActiveIdx = -1;

function openBulkAddModal(initialFiles){
  bulkItems = [];
  bulkActiveIdx = -1; bulkSel = -1;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal" style="max-width:640px">
    <button class="close-x">✕</button>
    <h3>Thêm nhiều ACC cùng lúc</h3>
    <input type="file" id="bulkFileInput" accept="image/*" multiple class="hide">
    <button id="bulkPickBtn" style="width:100%;padding:14px;border:2px dashed var(--line);border-radius:10px;background:transparent;color:var(--ink);font-size:14px">Chọn nhiều ảnh từ máy · hoặc Ctrl+V · kéo thả</button>
    <p style="font-size:12px;color:var(--sub);margin:8px 0 0">Điền mã số → giá → mô tả rồi bấm Enter để sang ảnh kế tiếp. Esc: thoát nhập · ← → ↑ ↓: chọn ảnh (khung đậm) · Enter: nhập thông tin · Delete: xóa ảnh đang chọn. Nhập riêng cho từng ảnh — bắt buộc điền đủ mã số, giá, mô tả (giá tăng thêm không bắt buộc).</p>
    ${markupSelectHtml('markupSelBulk', null).replace('Giá tăng thêm khi bán lại','Giá tăng thêm (áp dụng cho tất cả ảnh)')}
    <div id="bulkGrid" class="grid" style="margin-top:14px"></div>
    <div class="rowbtn">
      <button id="bulkCancel">Hủy</button>
      <button id="bulkSaveAll" class="primary">Lưu tất cả</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const bulkFileInput = ov.querySelector('#bulkFileInput');
  ov.querySelector('#bulkPickBtn').onclick = ()=> bulkFileInput.click();
  // Thêm ảnh vào danh sách (cộng dồn, không xóa ảnh đã có) — dùng cho chọn file, Ctrl+V và kéo thả.
  function addBulkFiles(files){
    files = files.filter(f=>f && f.type && f.type.indexOf('image/')===0);
    if(!files.length) return;
    if(bulkActiveIdx >= 0){   // giữ lại chữ đang gõ dở ở thẻ đang sửa
      const g = ov.querySelector('#bulkGrid'), i = bulkActiveIdx;
      const c = g.querySelector(`.bi-code[data-idx="${i}"]`), pr = g.querySelector(`.bi-price[data-idx="${i}"]`), d = g.querySelector(`.bi-desc[data-idx="${i}"]`);
      if(c && bulkItems[i]){ bulkItems[i].code = c.value.trim(); bulkItems[i].price = pr.value.trim(); bulkItems[i].desc = d.value.trim(); }
    }
    const startIdx = bulkItems.length;
    bulkItems = bulkItems.concat(files.map(f=>({file:f, url:URL.createObjectURL(f), code:'', price:'', desc:''})));
    if(bulkActiveIdx < 0){ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); bulkActiveIdx = bulkItems.length - files.length; bulkSel = bulkActiveIdx; }
    renderBulkGrid(ov);
    showToast({ title:'Đã thêm '+files.length+' ảnh', message:'Tổng cộng '+bulkItems.length+' ảnh. Nhập mã số, giá, mô tả cho từng ảnh.' });
    bulkItems.slice(startIdx).forEach(it=>{ try{ compressCached(it.file).catch(()=>{}); }catch(e){} });   // nén sẵn trong lúc bạn nhập
  }
  bulkFileInput.onchange = ()=>{ addBulkFiles(Array.from(bulkFileInput.files)); bulkFileInput.value=''; };
  registerPasteTarget(ov, addBulkFiles);
  bindImageDrop(ov, ov.querySelector('#bulkPickBtn'), addBulkFiles);
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.querySelector('#bulkCancel').onclick = ()=>ov.remove();
  if(initialFiles && initialFiles.length) addBulkFiles(initialFiles);
  enableMarkupPicker(ov, 'markupSelBulk', '#bulkSaveAll', null);
  bindEnterSave(ov, ['markupSelBulkGood'], '#bulkSaveAll');
  bindBulkKeys(ov);
  ov._dupSig = '';
  const onAccChanged = ()=>{
    if(!ov.isConnected){ document.removeEventListener('acc:changed', onAccChanged); return; }
    const sig = bulkDupSig(); if(sig === ov._dupSig) return; ov._dupSig = sig;
    if(bulkActiveIdx >= 0) updateBulkDup(ov, bulkActiveIdx); else renderBulkGrid(ov);
  };
  document.addEventListener('acc:changed', onAccChanged);
  ov.querySelector('#bulkSaveAll').onclick = async ()=>{
    if(!bulkItems.length) return;
    if(bulkActiveIdx >= 0) bulkRead(ov, bulkActiveIdx);
    const mkValBulk = parseInt(ov.querySelector('#markupSelBulk').value)||0;
    const missingIdx = bulkItems.findIndex(it=> !it.code || !it.price || !it.desc);
    if(missingIdx !== -1){
      bulkActiveIdx = missingIdx; bulkSel = missingIdx;
      renderBulkGrid(ov);
      showToast({ title:'Thiếu thông tin', message:'Vui lòng điền đủ mã số, giá và mô tả cho tất cả ảnh trước khi lưu.', variant:'error' });
      return;
    }
    // (kiểm tra trùng với máy chủ cho acc cũ chưa tải xong chạy nền trong hàng đợi lưu, không chặn ở đây)
    // Gom các ảnh trùng mã (với acc trong kho, hoặc trùng nhau trong cùng đợt) để TỰ DUYỆT, không tự động xóa.
    const conflicts = [], seen = {};
    bulkItems.forEach((it,i)=>{
      const nc = normalizeCode(it.code), old = findDuplicateByCode(it.code);
      if(old) conflicts.push({i, kind:'old', acc:old, old:{img:old.imageUrl, code:old.code, price:old.price, desc:old.desc}});
      else if(seen[nc] !== undefined){ const e = bulkItems[seen[nc]]; conflicts.push({i, kind:'batch', j:seen[nc], old:{img:e.url, code:e.code, price:e.price, desc:e.desc}}); }
      if(seen[nc] === undefined) seen[nc] = i;
    });
    let dec = {};
    if(conflicts.length){ dec = await openDupReview(conflicts); if(!dec) return; }
    const drop = new Set();
    conflicts.forEach(c=>{ if(dec[c.i]==='skip') drop.add(c.i); else if(dec[c.i]==='replace' && c.kind==='batch') drop.add(c.j); });
    const mkB = markupFields(mkValBulk, readPriority(ov,'markupSelBulk'));
    const jobs = []; bulkItems.forEach((it,i)=>{ if(!drop.has(i)) jobs.push({it,i}); });
    const skipped = drop.size; let replaced = 0, late = 0;
    ov.remove();                                       // đóng cửa sổ NGAY; toàn bộ việc lưu chạy ở hàng đợi độc lập
    const grp = SaveQueue.group(jobs.length, ({ok, fail})=>{
      renderHome(); renderAll(); renderTrash();
      showToast({ title:'Hoàn tất', message:`Đã lưu ${ok} acc`+(fail?`, ${fail} acc lỗi/bị hủy`:'')+(replaced?`, ${replaced} acc cũ chuyển vào thùng rác`:'')+(skipped?`, bỏ qua ${skipped} ảnh trùng`:'')+'.', variant: fail?'error':undefined });
      if(late) showToast({ title:'⚠ Có '+late+' acc trùng mã với acc cũ', message:'Đã lưu nhưng bị trùng mã (acc cũ chưa tải xong lúc bạn nhập). Đã viền đỏ — bấm vào đây để xem danh sách trùng.', variant:'error', sticky:true, onClick:()=>{ switchTab('history'); } });
      checkDupAlerts();
    });
    jobs.forEach(({it,i})=>{
      const c = conflicts.find(x=>x.i===i), id = uid(), addedAt = Date.now() + i;   // +i giữ đúng thứ tự ảnh
      upsertAcc({id, code:it.code, price:it.price, desc:it.desc, imageUrl:it.url, addedAt, deletedAt:null, ...mkB, _src:newAccSrc(), _pending:true});
      SaveQueue.add({
        group: grp, label: 'Mã '+it.code,
        run: async ()=>{
          const imageUrl = await compressCached(it.file).catch(e=>{ console.error(e); return ''; });
          await ensureNoOldDup(it.code);
          const d2 = findDuplicateByCode(it.code, id);   // trùng với acc cũ vừa tải về từ máy chủ: vẫn lưu, đánh dấu viền đỏ + báo trùng mã
          if(d2 && !(c && c.kind==='old' && dec[i]==='replace' && d2===c.acc)) late++;
          if(c && c.kind==='old' && dec[i]==='replace'){
            await Loader.silent(()=>accCol(c.acc).doc(c.acc.id).update({deletedAt: Date.now()})).catch(()=>{});
            c.acc.deletedAt = Date.now(); replaced++;
          }
          const data = {code: it.code, price: it.price, desc: it.desc, imageUrl, addedAt, deletedAt: null, ...mkB};
          const src = await Loader.silent(()=>saveNewAcc(id, data));
          if(!src) throw new Error('Không lưu được (cả hai project đều lỗi hoặc hết hạn mức)');
          return {src, data};
        },
        onRetry: ()=>{ const cur = accounts.find(x=>x.id===id); if(cur){ delete cur._failed; renderHome(); renderAll(); } },
        onDone: ({src, data})=>{
          const cur = accounts.find(x=>x.id===id); if(cur){ Object.assign(cur, data, {_src:src}); delete cur._pending; delete cur._failed; dedupeId(id, cur); }
        },
        onFail: e=>{
          const k = accounts.findIndex(x=>x.id===id);
          if(k>=0) accounts[k]._failed = true;
        }
      });
    });
    renderHome(); renderAll();
  };
}

// ----- Cảnh báo trùng mã cho từng thẻ trong "Thêm nhiều ACC" -----
// Trùng với acc đang có -> nút mở danh sách để Sửa / Xóa. Trùng với ảnh khác trong cùng đợt -> báo số thứ tự ảnh.
function bulkDupInfo(it, i){
  const nc = normalizeCode(it.code);
  if(!nc) return {olds:[], same:[]};
  const same = []; bulkItems.forEach((o,j)=>{ if(j!==i && normalizeCode(o.code)===nc) same.push(j+1); });
  return {olds: findDupsByCode(it.code), same};
}
function bulkDupHtml(it, i){
  const d = bulkDupInfo(it, i); let h = '';
  if(d.olds.length) h += `<button type="button" class="bi-dupbtn" data-dupidx="${i}">⚠ Trùng mã với ${d.olds.length} acc đã có — bấm để Sửa / Xóa</button>`;
  if(d.same.length) h += `<div class="bi-dupnote">⚠ Trùng mã với ảnh số ${d.same.join(', ')} trong đợt này</div>`;
  return h;
}
function bindDupBtns(ov, root){
  root.querySelectorAll('.bi-dupbtn').forEach(btn=>{
    btn.onclick = e=>{
      e.stopPropagation(); e.preventDefault();
      const it = bulkItems[parseInt(btn.dataset.dupidx)]; if(it) openDupListModal(it.code);
    };
  });
}
function bulkDupSig(){ return bulkItems.map((it,i)=>{ const d = bulkDupInfo(it,i); return d.olds.map(a=>a.id).join(',')+'/'+d.same.join(','); }).join('|'); }
// Cập nhật cảnh báo trùng của đúng 1 thẻ đang nhập (không vẽ lại cả lưới để khỏi mất chữ đang gõ).
function updateBulkDup(ov, i){
  const it = bulkItems[i]; if(!it) return;
  const card = ov.querySelector(`.bulkcard[data-idx="${i}"]`); if(!card) return;
  const box = card.querySelector('.bi-dup'); if(box){ box.innerHTML = bulkDupHtml(it, i); bindDupBtns(ov, box); }
  card.classList.toggle('dupflag', !!(box && box.innerHTML));
}

function bulkViewCardHtml(it, i){
  const incomplete = !it.code || !it.price || !it.desc;
  const sel = bulkSel===i ? ' sel' : '';
  const dupHtml = bulkDupHtml(it, i);
  return `<div class="bulkcard${incomplete?' incomplete':''}${dupHtml?' dupflag':''}${sel}" data-idx="${i}">
      <img src="${it.url}">
      <div class="bi-caption">${it.code ? escapeHtml(it.code) : '<span class="bi-hint">+ Bấm để thêm mã/giá/mô tả</span>'}${it.price?(' · '+escapeHtml(it.price)):''}</div>
      <div class="bi-dup">${dupHtml}</div>
      ${incomplete ? '<div class="bi-warn">Thiếu thông tin bắt buộc</div>' : ''}
    </div>`;
}
function bindBulkCard(ov, el){
  if(!el) return;
  el.onclick = ()=>{ if(bulkActiveIdx>=0) bulkRead(ov, bulkActiveIdx); bulkSel = bulkActiveIdx = parseInt(el.dataset.idx); renderBulkGrid(ov); };
  bindDupBtns(ov, el);
}

function bulkRead(ov, i){
  const g = ov.querySelector('#bulkGrid'), c = g.querySelector(`.bi-code[data-idx="${i}"]`);
  if(!c || !bulkItems[i]) return;
  bulkItems[i].code = c.value.trim();
  bulkItems[i].price = g.querySelector(`.bi-price[data-idx="${i}"]`).value.trim();
  bulkItems[i].desc = g.querySelector(`.bi-desc[data-idx="${i}"]`).value.trim();
}
// Enter trong ô nhập: nhảy tới ô còn trống; điền đủ 3 ô thì sang NGAY ảnh kế tiếp, vào dòng đầu (mã số).
function bulkEnter(ov, i){
  bulkRead(ov, i);
  const it = bulkItems[i], g = ov.querySelector('#bulkGrid');
  for(const [f,cls] of [['code','bi-code'],['price','bi-price'],['desc','bi-desc']]){
    if(!it[f]){ g.querySelector(`.${cls}[data-idx="${i}"]`).focus(); return; }
  }
  const hasNext = i+1 < bulkItems.length;
  bulkSel = hasNext ? i+1 : i;
  bulkActiveIdx = hasNext ? i+1 : -1;
  renderBulkGrid(ov);
  if(!hasNext){ const sb = ov.querySelector('#bulkSaveAll'); if(sb) sb.focus(); }
}
function bindBulkKeys(ov){
  const h = e=>{
    if(!ov.isConnected){ document.removeEventListener('keydown', h); return; }
    const tops = document.querySelectorAll('.overlay');
    if(tops[tops.length-1] !== ov) return;     // đang có cửa sổ khác (so sánh trùng...) ở trên
    if(bulkActiveIdx >= 0){
      if(e.key==='Escape'){ e.preventDefault(); bulkRead(ov, bulkActiveIdx); bulkSel = bulkActiveIdx; bulkActiveIdx = -1; renderBulkGrid(ov); }
      return;
    }
    const ae = document.activeElement;
    if((ae && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(ae.tagName)) || !bulkItems.length) return;
    const k = e.key;
    if(k.indexOf('Arrow')===0){
      e.preventDefault();
      bulkSel = gridMove(Array.from(ov.querySelectorAll('.bulkcard')), bulkSel, k);
      renderBulkGrid(ov);
    } else if(k==='Enter' && bulkSel>=0){
      e.preventDefault(); bulkActiveIdx = bulkSel; renderBulkGrid(ov);
    } else if((k==='Delete' || k==='Backspace') && bulkSel>=0){
      e.preventDefault();
      try{ URL.revokeObjectURL(bulkItems[bulkSel].url); }catch(err){}
      bulkItems.splice(bulkSel,1);
      bulkSel = Math.min(bulkSel, bulkItems.length-1);
      renderBulkGrid(ov);
    }
  };
  document.addEventListener('keydown', h);
}

function renderBulkGrid(ov){
  const grid = ov.querySelector('#bulkGrid');
  grid.innerHTML = bulkItems.map((it,i)=>{
    const incomplete = !it.code || !it.price || !it.desc;
    const sel = bulkSel===i ? ' sel' : '';
    if(bulkActiveIdx===i){
      return `<div class="bulkcard editing${sel}${bulkDupHtml(it,i)?' dupflag':''}" data-idx="${i}">
        <img src="${it.url}">
        <div class="bi-dup">${bulkDupHtml(it,i)}</div>
        <input class="bi-code" data-idx="${i}" placeholder="Mã số (vd 12/205) *" value="${escapeHtml(it.code)}">
        <input class="bi-price" data-idx="${i}" placeholder="Giá (vd 50.000đ) *" value="${escapeHtml(it.price||'')}">
        <textarea class="bi-desc" data-idx="${i}" placeholder="Mô tả / từ khóa... *">${escapeHtml(it.desc)}</textarea>
        <button class="bi-done" data-idx="${i}">Xong</button>
      </div>`;
    }
    return bulkViewCardHtml(it,i);
  }).join('');
  grid.querySelectorAll('.bulkcard:not(.editing)').forEach(el=>bindBulkCard(ov, el));
  grid.querySelectorAll('.bulkcard.editing').forEach(el=>bindDupBtns(ov, el));
  grid.querySelectorAll('.bi-done').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); const i = parseInt(btn.dataset.idx); bulkRead(ov, i); bulkSel = i; bulkActiveIdx = -1; renderBulkGrid(ov); };
  });
  const ed = grid.querySelector('.bulkcard.editing');
  if(ed){
    const i = ed.dataset.idx;
    const f = ['code','price','desc'].map(k=>grid.querySelector(`.bi-${k}[data-idx="${i}"]`));
    enableFieldNav(f, ()=> bulkEnter(ov, parseInt(i)));
    f[0].addEventListener('input', ()=>{ if(bulkItems[+i]){ bulkItems[+i].code = f[0].value.trim(); updateBulkDup(ov, +i); } });   // gõ mã tới đâu báo trùng tới đó
    updateBulkDup(ov, +i);
    (f.find(x=>!x.value) || f[0]).focus();
    ed.scrollIntoView({block:'nearest'});
  } else {
    const sc = grid.querySelector('.bulkcard.sel'); if(sc) sc.scrollIntoView({block:'nearest'});
  }
}

// Nén và chuyển ảnh thành chuỗi base64 (giới hạn cạnh dài 900px, JPEG chất lượng 0.7)
// để vừa với giới hạn 1MB/tài liệu của Firestore.
// Bản nhanh: giải mã ảnh bằng createImageBitmap (không qua FileReader->dataURL->Image), mã hoá bằng toBlob (bất đồng bộ).
function canvasToDataUrl(c){
  return new Promise(res=>{
    if(!c.toBlob) return res(c.toDataURL('image/jpeg', 0.7));
    c.toBlob(b=>{
      if(!b) return res(c.toDataURL('image/jpeg', 0.7));
      const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror = ()=>res(c.toDataURL('image/jpeg', 0.7)); r.readAsDataURL(b);
    }, 'image/jpeg', 0.7);
  });
}
function compressToBase64Legacy(blob){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ()=>{
      img.onload = ()=>{
        const maxSide = 900;
        let w = img.width, h = img.height;
        if(w > maxSide || h > maxSide){
          if(w > h){ h = Math.round(h * maxSide / w); w = maxSide; }
          else { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function compressToBase64(blob){
  if(window.createImageBitmap){
    try{
      const bmp = await createImageBitmap(blob);
      const maxSide = 900;
      let w = bmp.width, h = bmp.height;
      if(w > maxSide || h > maxSide){
        if(w > h){ h = Math.round(h * maxSide / w); w = maxSide; }
        else { w = Math.round(w * maxSide / h); h = maxSide; }
      }
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const cx = canvas.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, w, h);
      if(bmp.close) bmp.close();
      return await canvasToDataUrl(canvas);
    }catch(e){ /* trình duyệt không giải mã được -> dùng cách cũ */ }
  }
  return compressToBase64Legacy(blob);
}
// Nén SẴN ngay khi chọn/dán ảnh (chạy lúc bạn đang gõ mã/giá/mô tả) -> bấm Lưu là có luôn, khỏi chờ nén.
const _cmpCache = new WeakMap();
function compressCached(blob){
  let p = _cmpCache.get(blob);
  if(!p){ p = window.SaveQueue ? SaveQueue.compress(blob, compressToBase64) : compressToBase64(blob); _cmpCache.set(blob, p); p.catch(()=>{ _cmpCache.delete(blob); }); }
  return p;
}



// ===== Trang "Giá tăng" (chỉ Admin tổng) =====
async function saveMarkupOptions(list){
  const sorted = list.slice().sort((a,b)=>a-b);
  try{
    await db.collection(COL.accounts).doc(MARKUP_DOC).set({options: sorted, settings:true});
    markupOptions = sorted;
    return true;
  }catch(e){
    console.error('Lưu mức giá tăng lỗi:', e);
    showToast({ title:'Không lưu được mức giá', message:'Lỗi kết nối hoặc quyền ghi Firestore. Mức giá chưa được lưu, hãy thử lại.', variant:'error' });
    return false;
  }
}

function renderMarkupPage(){
  if(myRole!=='superadmin') return;
  const box = document.getElementById('tab-markup');
  if(!box) return;
  const live = accounts.filter(a=>isLive(a) && a.markup);
  const pending = live.filter(a=>a.markupStatus==='pending').sort((a,b)=>((b.markupPriority||[]).length-(a.markupPriority||[]).length) || (b.addedAt-a.addedAt));
  const approved = live.filter(a=>a.markupStatus!=='pending').sort((a,b)=>b.addedAt-a.addedAt);

  const chips = markupOptions.length
    ? markupOptions.map(v=>`<span class="tag mk-chip">+${fmtMoney(v)}<button type="button" data-mk-del="${v}" title="Xóa mức này">✕</button></span>`).join('')
    : '<span style="color:var(--sub);font-size:13px">Chưa có mức nào. Admin phụ sẽ không thêm/sửa acc được cho tới khi bạn tạo ít nhất 1 mức.</span>';

  const pendingHtml = pending.length ? `<div class="grid">${pending.map(a=>`
    <div class="card mk-card${(a.markupPriority||[]).length?' mk-prio-card mk-good':''}" data-id="${a.id}">
      ${a.imageUrl ? `<img src="${a.imageUrl}" data-id="${a.id}" class="zoomtrig" loading="lazy" decoding="async">` : ''}
      <div class="info">
        <span class="code">${escapeHtml(a.code||'(chưa có mã)')}</span>
        <div class="price">${escapeHtml(a.price||'')}</div>
        <div class="meta">${escapeHtml(a.markupBy||'Admin phụ')} đề xuất tăng +${fmtMoney(a.markup)}</div>
        <div>${prioTagsHtml(a)}</div>
      </div>
      <div class="mk-actions">
        <select data-mk-sel="${a.id}">${markupOptionsHtml(a.markup, 'Bỏ mức tăng')}</select>
        <button type="button" class="ok" data-mk-approve="${a.id}">Duyệt</button>
      </div>
    </div>`).join('')}</div>` : '<div class="empty">Không có acc nào đang chờ duyệt giá tăng</div>';

  box.innerHTML = `
    <div class="section-h">Các mức giá tăng (Admin phụ chọn 1 mức khi thêm/sửa acc)</div>
    <div class="mk-box">
      <input id="mkNewInput" inputmode="numeric" placeholder="Số tiền tăng, vd 10000">
      <button id="mkAddBtn" type="button">Thêm mức</button>
    </div>
    <div class="tagsrow">${chips}</div>
    <div class="section-h">Chờ duyệt (${pending.length})</div>
    <p style="font-size:12px;color:var(--sub);margin:0 0 10px">Acc admin phụ đề xuất ưu tiên (Giá tốt) được xếp lên đầu. Chọn lại mức trong ô danh sách nếu cần sửa, rồi bấm Duyệt. Chọn "Bỏ mức tăng" để gỡ phần tăng của acc đó.</p>
    ${pendingHtml}
    <div class="section-h">Đã duyệt (${approved.length})</div>
    ${approved.length ? `<div class="grid" id="mkApprovedGrid">${approved.map(a=>cardHtml(a,'')).join('')}</div>` : '<div class="empty">Chưa có acc nào được duyệt giá tăng</div>'}
  `;

  const input = box.querySelector('#mkNewInput');
  const addOpt = async ()=>{
    const v = parseInt((input.value||'').replace(/\D/g,''));
    if(!v || v<=0){ showToast({ title:'Số tiền không hợp lệ', message:'Nhập một số lớn hơn 0.', variant:'error' }); return; }
    if(markupOptions.includes(v)){ showToast({ title:'Đã có mức này', message:'Mức +'+fmtMoney(v)+' đã tồn tại.', variant:'error' }); return; }
    if(await saveMarkupOptions([...markupOptions, v])) renderMarkupPage();
  };
  box.querySelector('#mkAddBtn').onclick = addOpt;
  input.onkeydown = e=>{ if(e.key==='Enter'){ e.preventDefault(); addOpt(); } };

  box.querySelectorAll('[data-mk-del]').forEach(b=>{
    b.onclick = async ()=>{
      const v = parseInt(b.dataset.mkDel);
      const ok = await openConfirmModal({
        title: 'Xóa mức giá tăng',
        message: 'Xóa mức +'+fmtMoney(v)+'? Các acc đã chọn mức này vẫn giữ nguyên số tiền tăng.',
        confirmLabel: 'Xóa'
      });
      if(!ok) return;
      if(await saveMarkupOptions(markupOptions.filter(x=>x!==v))) renderMarkupPage();
    };
  });

  box.querySelectorAll('[data-mk-approve]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.mkApprove;
      const a = accounts.find(x=>x.id===id); if(!a) return;
      const val = parseInt(box.querySelector(`[data-mk-sel="${id}"]`).value)||0;
      const upd = val
        ? {markup: val, markupStatus:'approved', markupBy: a.markupBy||null, approvedBy: myName}
        : {markup: null, markupStatus: null, markupBy: null, approvedBy: null};
      b.disabled = true;
      await accCol(a).doc(id).update(upd).catch(e=>console.error(e));
      Object.assign(a, upd);
      renderMarkupPage(); renderHome(); renderAll();
    };
  });

  // Xem ảnh phóng to + nút Sửa/Xóa trên các thẻ đã duyệt
  attachCardEvents(box);
}


// =====================================================================
// ===== Di chuyển bằng bàn phím (khung đậm) · Xóa/Đã bán · Nhắc nhở =====
// =====================================================================
function gridMove(cards, idx, key){
  if(!cards.length) return -1;
  if(idx < 0) return 0;
  if(key==='ArrowLeft') return Math.max(0, idx-1);
  if(key==='ArrowRight') return Math.min(cards.length-1, idx+1);
  const sib = Array.from(cards[idx].parentElement.children), t = sib[0].offsetTop;
  const cols = sib.filter(c=>c.offsetTop===t).length || 1;
  return key==='ArrowUp' ? Math.max(0, idx-cols) : Math.min(cards.length-1, idx+cols);
}
// Hàng nút: ← → đổi nút trong hàng, ↑ ↓ đổi hàng. Enter = bấm nút đang chọn (thay chuột).
function bindButtonGrid(ov, getRows){
  ov.addEventListener('keydown', e=>{
    if(e.key.indexOf('Arrow')!==0) return;
    const rows = getRows(); let r=-1, c=-1;
    rows.forEach((row,i)=>{ const j=row.indexOf(document.activeElement); if(j>=0){ r=i; c=j; } });
    if(r<0) return;
    e.preventDefault();
    if(e.key==='ArrowLeft') c = Math.max(0,c-1);
    else if(e.key==='ArrowRight') c = Math.min(rows[r].length-1,c+1);
    else { r = Math.max(0, Math.min(rows.length-1, r+(e.key==='ArrowUp'?-1:1))); c = Math.min(c, rows[r].length-1); }
    rows[r][c].focus(); rows[r][c].scrollIntoView({block:'nearest'});
  });
}
function kbTab(){ return ['home','all','remind'].map(t=>document.getElementById('tab-'+t)).find(el=>el && !el.classList.contains('hide')); }
function kbCards(){ const t = kbTab(); return t ? Array.from(t.querySelectorAll('.card[data-id], .rcard')) : []; }
function kbPaint(){
  const cs = kbCards();
  cs.forEach(c=>c.classList.toggle('kbsel', c.dataset.id===kbId));
  const s = cs.find(c=>c.dataset.id===kbId); if(s) s.scrollIntoView({block:'nearest'});
}
// Kho acc / Trang chủ / Nhắc nhở: ← → ↑ ↓ chọn ảnh (khung đậm) · Enter = Sửa · Delete = Xóa/Đã bán.
document.addEventListener('keydown', e=>{
  const app = document.getElementById('app');
  if(!app || app.classList.contains('hide') || !isStaff()) return;
  if(document.querySelector('.overlay') || isTypingField()) return;
  const ae = document.activeElement;
  if(ae && /^(SELECT|BUTTON)$/.test(ae.tagName) && e.key==='Enter') return;
  const cs = kbCards(); if(!cs.length) return;
  let i = cs.findIndex(c=>c.dataset.id===kbId);
  if(e.key.indexOf('Arrow')===0){
    e.preventDefault(); i = gridMove(cs, i, e.key); kbId = cs[i].dataset.id; kbPaint();
  } else if(e.key==='Enter' && i>=0){
    const b = cs[i].querySelector('[data-edit],[data-redit]'); if(b){ e.preventDefault(); b.click(); }
  } else if(e.key==='Delete' && i>=0){
    const b = cs[i].querySelector('[data-del]'); if(b){ e.preventDefault(); b.click(); }
  }
});

function rerenderAll(){ renderHome(); renderAll(); renderTrash(); renderRemind(); }

function openRemoveChoice(a){
  return new Promise(res=>{
    const ov = document.createElement('div'); ov.className='overlay';
    ov.innerHTML = `<div class="modal" style="max-width:440px">
      <h3>Xóa ACC</h3>
      <p style="font-size:14px;line-height:1.5;margin:0 0 4px">Acc <b>${escapeHtml(a.code||'(chưa có mã)')}</b> — chọn cách xử lý:</p>
      <div class="rowbtn">
        <button data-c="sold" class="primary">Đã bán</button>
        <button data-c="del" style="color:var(--danger);border-color:var(--danger)">Xóa acc</button>
        <button data-c="cancel">Hủy</button>
      </div>
      <p style="font-size:11px;color:var(--sub);margin:10px 0 0">← → chọn nút · Enter xác nhận · Esc hủy</p>
    </div>`;
    document.body.appendChild(ov);
    const btns = Array.from(ov.querySelectorAll('[data-c]'));
    bindButtonGrid(ov, ()=>[btns]);
    const done = v=>{ document.removeEventListener('keydown', esc); ov.remove(); res(v); };
    const esc = e=>{ if(e.key==='Escape'){ e.preventDefault(); done(null); } };
    document.addEventListener('keydown', esc);
    btns.forEach(b=> b.onclick = ()=> done(b.dataset.c==='cancel' ? null : b.dataset.c));
    ov.onclick = e=>{ if(e.target===ov) done(null); };
    btns[0].focus();
  });
}
async function removeFlow(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  const cs = kbCards(), i = cs.findIndex(c=>c.dataset.id===id), nb = cs[i+1] || cs[i-1];
  const c = await openRemoveChoice(a); if(!c) return;
  if(nb) kbId = nb.dataset.id;
  if(c==='sold'){ openSoldModal(a); return; }
  const now = Date.now();
  await accCol(a).doc(id).update({deletedAt: now}).catch(()=>{});
  a.deletedAt = now;
  rerenderAll();
}

// ----- Moneys -----
function moneyNum(s){
  s = String(s==null?'':s).toLowerCase().trim();
  const n = parseFloat(s.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'')) || 0;
  return Math.round(/tr|triệu/.test(s) ? n*1e6 : /k|nghìn/.test(s) ? n*1e3 : n);
}
function toLocalInput(ts){
  const d = new Date(ts), p = n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
}

// ----- Form "Đã bán" / sửa hẹn trả góp -----
function openSoldModal(a){
  const editing = !!a.sold;
  let defDue = a.dueAt; if(!defDue){ const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0); defDue = d.getTime(); }
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    <h3>${editing?'Sửa lịch hẹn trả góp':'Đã bán — hẹn trả góp'}</h3>
    <div class="sold-head">${a.imageUrl?`<img src="${a.imageUrl}">`:''}<div><span class="code tag">${escapeHtml(a.code||'')}</span><div class="rsmall">${escapeHtml(a.price||'')}</div></div></div>
    <label>Hẹn ngày và giờ *</label>
    <input id="sDue" type="datetime-local" value="${toLocalInput(defDue)}">
    <label>Bán cho ai *</label>
    <input id="sBuyer" placeholder="Tên khách" value="${escapeHtml(a.buyer||'')}">
    <label>Nguồn của ai</label>
    <input id="sSource" placeholder="Acc này lấy nguồn từ ai" value="${escapeHtml(a.source||'')}">
    <label>Giá khách đã trả (đ)</label>
    <input id="sPaid" placeholder="vd 2000000 hoặc 2tr" value="${a.paid||''}">
    <label>Tổng giá tiền (đ) *</label>
    <input id="sTotal" placeholder="vd 5000000 hoặc 5tr" value="${a.total||''}">
    <div id="sErr" class="fielderr" style="margin-top:8px"></div>
    <div class="rowbtn"><button id="sCancel">Hủy</button><button id="sSave" class="primary">Lưu</button></div>
  </div>`;
  document.body.appendChild(ov);
  const $ = id=>ov.querySelector('#'+id);
  const close = ()=>{ document.removeEventListener('keydown', esc); ov.remove(); };
  const esc = e=>{ if(e.key==='Escape'){ const t=document.querySelectorAll('.overlay'); if(t[t.length-1]===ov){ e.preventDefault(); close(); } } };
  document.addEventListener('keydown', esc);
  ov.querySelector('.close-x').onclick = close; $('sCancel').onclick = close;
  ov.onclick = e=>{ if(e.target===ov) close(); };
  enableFieldNav([$('sBuyer'),$('sSource'),$('sPaid'),$('sTotal')], ()=>$('sSave').click());
  $('sDue').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); $('sBuyer').focus(); } });
  $('sDue').focus();
  $('sSave').onclick = async ()=>{
    const due = new Date($('sDue').value).getTime(), buyer = $('sBuyer').value.trim(), source = $('sSource').value.trim();
    const paid = moneyNum($('sPaid').value), total = moneyNum($('sTotal').value);
    const err = !due||isNaN(due) ? 'Bắt buộc chọn ngày và giờ hẹn.' : !buyer ? 'Bắt buộc điền bán cho ai.' : !total ? 'Bắt buộc điền tổng giá tiền.' : paid>total ? 'Số tiền đã trả không thể lớn hơn tổng giá.' : '';
    if(err){ $('sErr').textContent = err; return; }
    $('sSave').disabled = true; $('sSave').textContent = 'Đang lưu...';
    const upd = {sold:true, soldAt:a.soldAt||Date.now(), dueAt:due, buyer, source, paid, total, remindDone:false, emailedAt:(editing && a.dueAt===due) ? (a.emailedAt||null) : null};
    await accCol(a).doc(a.id).update(upd).catch(e=>console.error(e));
    Object.assign(a, upd);
    shownDue.delete(a.id);
    close(); rerenderAll(); checkDueReminders();
    showToast({title: editing?'Đã cập nhật lịch hẹn':'Đã chuyển sang trang Nhắc nhở', message:'Acc '+(a.code||'')+' · hẹn '+fmtDate(due)});
  };
}

// ----- Trang Nhắc nhở -----
function remindList(){ return accounts.filter(a=>a.sold && !a.remindDone && !a.deletedAt).sort((x,y)=>(x.dueAt||0)-(y.dueAt||0)); }
function dueState(a){
  const d = a.dueAt||0, now = Date.now();
  if(d<=now) return now-d>864e5 ? ['late','Quá hạn'] : ['due','Đến hạn'];
  if(d-now<864e5) return ['soon','Sắp đến hạn (<24 giờ)'];
  return ['wait','Còn '+Math.ceil((d-now)/864e5)+' ngày'];
}
function updateRemindBadge(){
  const b = document.getElementById('navRemind'); if(!b) return;
  const n = remindList().filter(a=>(a.dueAt||0)<=Date.now()).length;
  b.textContent = 'Nhắc nhở' + (n ? ' ('+n+')' : '');
}
function renderRemind(){
  updateRemindBadge();
  const box = document.getElementById('tab-remind');
  if(!box || !isStaff() || box.classList.contains('hide')) return;
  const list = remindList();
  if(!list.length){ box.innerHTML = '<div class="empty">Chưa có acc nào đang hẹn trả góp.<br>Vào kho acc → bấm Xóa (hoặc phím Delete) → chọn <b>Đã bán</b> để thêm vào đây.</div>'; return; }
  box.innerHTML = '<div class="rlist">' + list.map(a=>{
    const [st, label] = dueState(a), total = a.total||0, paid = a.paid||0, pct = total ? Math.min(100, Math.round(paid*100/total)) : 0;
    return `<div class="rcard r-${st}" data-id="${a.id}">
      ${a.imageUrl ? `<img class="zoomtrig" data-id="${a.id}" src="${a.imageUrl}">` : ''}
      <div class="rbody">
        <div class="rdue">⏰ ${fmtDate(a.dueAt)} <span class="rbadge">${label}</span></div>
        <div class="rline"><b>Bán cho:</b> ${escapeHtml(a.buyer||'—')}</div>
        <div class="rline"><b>Nguồn:</b> ${escapeHtml(a.source||'—')}</div>
        <div class="rline"><b>Đã trả:</b> ${fmtMoney(paid)} / ${fmtMoney(total)} · <b>còn ${fmtMoney(Math.max(0,total-paid))}</b></div>
        <div class="rbar"><i style="width:${pct}%"></i></div>
        <div class="rsmall">Mã ${escapeHtml(a.code||'')} · giá ${escapeHtml(a.price||'')}${a.desc?' · '+escapeHtml(a.desc):''}</div>
        <div class="ractions">
          <button data-redit="${a.id}">Sửa hẹn</button><button data-rmail="${a.id}">✉ Email</button><button data-rcal="${a.id}">📅 Lịch</button>
          <button class="ok" data-rdone="${a.id}">Đã trả đủ</button><button data-rback="${a.id}">Trả về kho</button>
        </div>
      </div></div>`;
  }).join('') + '</div>';
  const find = id=>accounts.find(x=>x.id===id);
  box.querySelectorAll('.zoomtrig').forEach(im=> im.onclick = ()=> openZoom(im.dataset.id));
  box.querySelectorAll('[data-redit]').forEach(b=> b.onclick = ()=> openSoldModal(find(b.dataset.redit)));
  box.querySelectorAll('[data-rmail]').forEach(b=> b.onclick = ()=> sendRemindEmail(find(b.dataset.rmail), true));
  box.querySelectorAll('[data-rcal]').forEach(b=> b.onclick = ()=> openCalendar(find(b.dataset.rcal)));
  box.querySelectorAll('[data-rdone]').forEach(b=> b.onclick = async ()=>{
    const a = find(b.dataset.rdone);
    if(!await openConfirmModal({title:'Đã trả đủ', message:'Khách đã trả đủ cho acc "'+(a.code||'')+'"? Acc sẽ rời khỏi trang Nhắc nhở.', confirmLabel:'Xác nhận', danger:false})) return;
    const upd = {remindDone:true, paid:a.total||a.paid||0};
    await accCol(a).doc(a.id).update(upd).catch(()=>{}); Object.assign(a, upd); rerenderAll();
  });
  box.querySelectorAll('[data-rback]').forEach(b=> b.onclick = async ()=>{
    const a = find(b.dataset.rback);
    if(!await openConfirmModal({title:'Trả về kho', message:'Hủy bán acc "'+(a.code||'')+'" và đưa lại vào kho acc?', confirmLabel:'Trả về kho', danger:false})) return;
    const upd = {sold:false, dueAt:null, buyer:null, source:null, paid:null, total:null, emailedAt:null, remindDone:false};
    await accCol(a).doc(a.id).update(upd).catch(()=>{}); Object.assign(a, upd); rerenderAll();
  });
  kbPaint();
}

// ----- Nhắc qua email / lịch / thông báo trình duyệt -----
function remindMsg(a){
  const paid = a.paid||0, total = a.total||0;
  return 'ACC NÀY ĐÃ ĐẾN HẠN TRẢ GÓP\n\nMã acc: '+(a.code||'')+'\nHẹn: '+fmtDate(a.dueAt)+'\nBán cho: '+(a.buyer||'—')+'\nNguồn: '+(a.source||'—')+
    '\nĐã trả: '+fmtMoney(paid)+' / Tổng: '+fmtMoney(total)+'\nCòn lại: '+fmtMoney(Math.max(0,total-paid))+
    '\n\nGiá acc: '+(a.price||'')+'\nMô tả: '+(a.desc||'');
}
function remindTo(){ return (typeof REMIND_EMAIL!=='undefined' && REMIND_EMAIL) ? REMIND_EMAIL : 'huyvu201226@gmail.com'; }
async function sendRemindEmail(a, manual){
  const to = remindTo(), subject = '[Nhắc hạn] Acc '+(a.code||'')+' đã đến hạn trả góp', body = remindMsg(a);
  const ej = (typeof EMAILJS!=='undefined') ? EMAILJS : null;
  if(ej && ej.serviceId && ej.templateId && ej.publicKey){
    try{
      const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({service_id:ej.serviceId, template_id:ej.templateId, user_id:ej.publicKey, template_params:{to_email:to, subject, message:body, acc_code:a.code||''}})});
      if(!r.ok) throw new Error(await r.text());
      const now = Date.now();
      await accCol(a).doc(a.id).update({emailedAt:now}).catch(()=>{}); a.emailedAt = now;
      showToast({title:'Đã gửi email nhắc', message:'Gửi tới '+to});
      return true;
    }catch(e){ console.error(e); showToast({title:'Gửi email lỗi', message:'Kiểm tra lại cấu hình EMAILJS trong firebase-config.js.', variant:'error'});
      if(!manual){ await accCol(a).doc(a.id).update({emailedAt:null}).catch(()=>{}); a.emailedAt = null; } }
  }
  if(manual) window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body), '_blank');
  return false;
}
// Google Calendar gửi nhắc cho bạn kể cả khi đóng web (cần lưu sự kiện 1 lần).
function openCalendar(a){
  const f = t=> new Date(t).toISOString().replace(/[-:]|\.\d{3}/g,'');
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent('Hạn trả góp acc '+(a.code||'')+' — '+(a.buyer||''))+
    '&dates='+f(a.dueAt)+'/'+f((a.dueAt||0)+30*60000)+'&details='+encodeURIComponent(remindMsg(a))+'&add='+encodeURIComponent(remindTo());
  window.open(url, '_blank');
}
function askNotifyPerm(){ try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){} }
function checkDueReminders(){
  if(!isStaff()) return;
  updateRemindBadge();
  checkNotices();
  const now = Date.now(), ej = (typeof EMAILJS!=='undefined') ? EMAILJS : null, auto = !!(ej && ej.serviceId && ej.templateId && ej.publicKey);
  remindList().filter(a=>(a.dueAt||0)<=now).forEach(a=>{
    if(!shownDue.has(a.id)){
      shownDue.add(a.id);
      showToast({title:'⏰ Acc '+(a.code||'')+' đã đến hạn trả góp', message:'Bán cho '+(a.buyer||'—')+' · còn '+fmtMoney(Math.max(0,(a.total||0)-(a.paid||0))), variant:'error', account:a});
      try{ if('Notification' in window && Notification.permission==='granted') new Notification('Acc '+(a.code||'')+' đã đến hạn trả góp', {body:'Bán cho '+(a.buyer||'—')}); }catch(e){}
    }
    if(auto && !a.emailedAt && !sendingEmail.has(a.id)){
      sendingEmail.add(a.id);
      claimEmail(a).then(ok=> ok ? sendRemindEmail(a, false) : null).finally(()=>{ sendingEmail.delete(a.id); });
    }
  });
  if(!document.getElementById('tab-remind').classList.contains('hide')) renderRemind();
}
const sendingEmail = new Set();
// Giành quyền gửi email bằng transaction: nếu 2 admin cùng mở web thì chỉ 1 người gửi (tránh email trùng).
async function claimEmail(a){
  try{
    const ref = accCol(a).doc(a.id);
    return await accDb(a).runTransaction(async tx=>{
      const d = await tx.get(ref);
      if(!d.exists || (d.data()||{}).emailedAt) return false;
      tx.update(ref, {emailedAt: Date.now(), updatedAt: Date.now()});
      return true;
    });
  }catch(e){ console.error('claimEmail', e); return true; }
}
function startRemindTimer(){
  if(remindTimer) clearInterval(remindTimer);
  remindTimer = setInterval(checkDueReminders, 30000);
  // Tab ngủ/ẩn bị trình duyệt làm chậm timer: kiểm tra lại ngay khi quay lại tab hoặc máy thức dậy.
  if(!startRemindTimer._bound){
    startRemindTimer._bound = true;
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkDueReminders(); });
    window.addEventListener('focus', checkDueReminders);
    window.addEventListener('online', checkDueReminders);
    // Xin quyền thông báo ở lần bấm đầu tiên (trình duyệt chỉ hỏi khi có thao tác của người dùng).
    document.addEventListener('click', askNotifyPerm, {once:true});
  }
}

// ----- Cửa sổ so sánh ảnh trùng mã (tự duyệt từng ảnh) -----
function openDupReview(conflicts){
  return new Promise(resolve=>{
    const dec = {}; conflicts.forEach(c=>dec[c.i]='skip');
    const side = (t,img,o)=>`<div class="dup-side"><div class="dup-t">${t}</div>${img?`<img src="${img}">`:''}<div class="code tag">${escapeHtml(o.code||'')}</div> <span class="price">${escapeHtml(o.price||'')}</span><div class="dup-d">${escapeHtml(o.desc||'')}</div></div>`;
    const ov = document.createElement('div'); ov.className='overlay';
    ov.innerHTML = `<div class="modal dupmodal">
      <h3>Trùng mã — duyệt ${conflicts.length} ảnh</h3>
      <p class="rsmall" style="margin:0 0 6px">Chưa xóa gì cả. Chọn cho từng cặp (← → đổi nút, ↑ ↓ đổi cặp, Enter chọn). Mặc định: giữ ảnh cũ.</p>
      ${conflicts.map(c=>{ const n = bulkItems[c.i]; return `<div class="dup-row" data-i="${c.i}">
        <div class="dup-pair">${side(c.kind==='old'?'Ảnh đang có trong kho':'Ảnh nhập trước trong đợt này', c.old.img, c.old)}${side('Ảnh mới nhập', n.url, n)}</div>
        <div class="dup-btns"><button type="button" data-d="skip">Giữ ảnh cũ · bỏ ảnh mới</button><button type="button" data-d="replace">Dùng ảnh mới · ${c.kind==='old'?'ảnh cũ vào thùng rác':'bỏ ảnh trước'}</button><button type="button" data-d="both">Giữ cả hai</button></div>
      </div>`; }).join('')}
      <div class="rowbtn"><button id="dupBack">Quay lại</button><button id="dupOk" class="primary">Xác nhận &amp; lưu</button></div>
    </div>`;
    document.body.appendChild(ov);
    const rowEls = Array.from(ov.querySelectorAll('.dup-row'));
    const rows = rowEls.map(r=>Array.from(r.querySelectorAll('[data-d]')));
    const footer = [ov.querySelector('#dupBack'), ov.querySelector('#dupOk')];
    const paint = ()=> rowEls.forEach(r=> r.querySelectorAll('[data-d]').forEach(b=> b.classList.toggle('on', dec[r.dataset.i]===b.dataset.d)));
    paint();
    bindButtonGrid(ov, ()=>rows.concat([footer]));
    rows.forEach((btns,ri)=> btns.forEach((b,bi)=> b.onclick = ()=>{
      dec[rowEls[ri].dataset.i] = b.dataset.d; paint();
      const nx = rows[ri+1] ? rows[ri+1][bi] : footer[1]; nx.focus(); nx.scrollIntoView({block:'nearest'});
    }));
    const done = v=>{ document.removeEventListener('keydown', esc); ov.remove(); resolve(v); };
    const esc = e=>{ if(e.key==='Escape'){ e.preventDefault(); done(null); } };
    document.addEventListener('keydown', esc);
    footer[0].onclick = ()=>done(null); footer[1].onclick = ()=>done(dec);
    rows[0][0].focus();
  });
}


// ===== Tự cập nhật dữ liệu acc (không cần F5) =====
// Chỉ nghe những acc có dấu thời gian sửa (updatedAt) từ lúc mở trang trở đi — gồm acc mới thêm, sửa, bán, xóa mềm,
// kể cả acc cũ. Không còn nghe cả kho nên không phải tải lại toàn bộ dữ liệu.
let accListening = false;
function startAccountsListener(){
  if(accListening) return;
  accListening = true;
  const listen = (src, database)=> database.collection(COL.accounts).where('updatedAt','>=',syncSince).onSnapshot(snap=>{
    const ups = [], gone = new Set();
    snap.docChanges().forEach(ch=>{
      if(isSettingsDoc(ch.doc.id)) return;
      if(ch.type==='removed') gone.add(ch.doc.id);
      else ups.push({id:ch.doc.id, ...ch.doc.data(), _src:src});
    });
    let changed = false;
    if(gone.size){ const n = accounts.length; accounts = accounts.filter(a=>!((a._src||1)===src && gone.has(a.id))); changed = accounts.length !== n; }
    if(ups.length){ mergeMany(ups); changed = true; }
    if(changed) scheduleRender(0);
  }, e=>console.error(e));
  listen(1, db);
  if(db2) listen(2, db2);
}
