// ===== Khởi tạo Firebase =====
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// Bật cache offline: lần mở trang sau sẽ có dữ liệu ngay từ bộ nhớ đệm cục bộ
// trong khi chờ đồng bộ mới nhất từ máy chủ — giúp khởi động nhanh hơn.
try{ db.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}

// Tiền tố riêng cho app này — đảm bảo không bao giờ đụng tới dữ liệu của trang khác
// dùng chung project Firebase (vd trang "site/data" cũ của bạn).
const COL = {
  accounts: 'accmgr_accounts',
  users: 'accmgr_users',
  logins: 'accmgr_logins',
  presence: 'accmgr_presence'
};

let myName = localStorage.getItem('acc_myname') || '';
let myRole = null; // 'pending' | 'approved' | 'admin'
let accounts = [];
let logins = [];
let allUsers = [];
let onlineNames = new Set();
let pasteBlob = null;
let heartbeatTimer = null;

function userKey(name){ return (name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'user'; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString('vi-VN')+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}); }
function monthKey(ts){ const d=new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function dayKey(ts){ const d=new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dayLabel(ts){ const d=new Date(ts); return 'Ngày '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
function enableFieldNav(fields, submitFn){
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
  return accounts.find(a => a.id!==excludeId && !a.deletedAt && normalizeCode(a.code)===nc) || null;
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
function showToast({title, message, variant, account}){
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
  t._toastTimer = setTimeout(()=> removeToast(t), 6000);
  return t;
}

// ===== Đăng nhập / duyệt tài khoản =====
document.getElementById('loginBtn').onclick = ()=>{
  const v = document.getElementById('loginName').value.trim();
  const p = document.getElementById('loginPass').value;
  if(!v) return;
  localStorage.setItem('acc_myname', v);
  checkAndEnter(v, p);
};
document.getElementById('recheckBtn').onclick = ()=> checkAndEnter(myName, '');
document.getElementById('logoutBtn').onclick = ()=>{
  localStorage.removeItem('acc_myname');
  location.reload();
};
enableFieldNav(
  [document.getElementById('loginName'), document.getElementById('loginPass')],
  ()=> document.getElementById('loginBtn').click()
);

if(myName) checkAndEnter(myName, '');

async function checkAndEnter(name, password){
  myName = name;
  document.getElementById('login').classList.add('hide');
  document.getElementById('loginError').textContent = '';
  const key = userKey(name);
  const isSuperAdminName = name.toLowerCase().trim() === ADMIN_NAME.toLowerCase().trim();
  let snap;
  try{ snap = await db.collection(COL.users).doc(key).get(); }catch(e){ snap = null; }
  const existing = (snap && snap.exists) ? snap.data() : null;

  if(existing && existing.password){
    // Tài khoản admin phụ có mật khẩu riêng — bắt buộc kiểm tra đúng mật khẩu.
    if(existing.password !== password){
      document.getElementById('login').classList.remove('hide');
      document.getElementById('loginError').textContent = 'Sai mật khẩu.';
      return;
    }
    myRole = existing.status;
  } else if(isSuperAdminName){
    // Admin tổng: bắt buộc đúng mật khẩu cấu hình trong firebase-config.js
    if(password !== ADMIN_PASSWORD){
      document.getElementById('login').classList.remove('hide');
      document.getElementById('loginError').textContent = 'Sai mật khẩu.';
      return;
    }
    myRole = 'superadmin';
    await db.collection(COL.users).doc(key).set({name, status:'superadmin', requestedAt: existing?existing.requestedAt:Date.now()}, {merge:true}).catch(()=>{});
  } else if(!existing){
    myRole = 'pending';
    await db.collection(COL.users).doc(key).set({name, status: myRole, requestedAt: Date.now()}).catch(()=>{});
  } else {
    myRole = existing.status || 'pending';
  }
  subscribeUsers();
  if(myRole==='pending'){
    document.getElementById('pendingName').textContent = name;
    document.getElementById('pending').classList.remove('hide');
    return;
  }
  document.getElementById('pending').classList.add('hide');
  enterApp();
}

function subscribeUsers(){
  db.collection(COL.users).onSnapshot(snap=>{
    allUsers = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const mine = allUsers.find(u=>u.id===userKey(myName));
    if(myRole==='pending' && mine && mine.status!=='pending'){
      myRole = mine.status;
      document.getElementById('pending').classList.add('hide');
      enterApp();
    }
    if(myRole==='admin' || myRole==='superadmin') renderAdmin();
  });
}

async function enterApp(){
  document.getElementById('app').classList.remove('hide');
  const roleLabel = myRole==='superadmin' ? ' (Admin tổng)' : myRole==='admin' ? ' (Quản trị viên)' : '';
  document.getElementById('whoAmI').textContent = 'Xin chào, '+myName+roleLabel;
  if(myRole==='admin' || myRole==='superadmin') document.getElementById('navAdmin').classList.remove('hide');
  // Vào giao diện ngay, không chờ các việc nền (ghi log đăng nhập, dọn dữ liệu cũ) để khởi động nhanh hơn.
  bindTabs();
  bindAdd();
  bindAdminPanel();
  recordLogin(myName);
  startPresence();
  await loadData();
  renderHome();
}

async function recordLogin(name){
  try{ await db.collection(COL.logins).doc(uid()).set({name, at: Date.now()}); }catch(e){}
}

// ===== Trạng thái online (nhịp tim mỗi 20s) =====
function startPresence(){
  const key = userKey(myName);
  const ping = ()=> db.collection(COL.presence).doc(key).set({name: myName, lastSeen: Date.now()}).catch(()=>{});
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
async function loadData(){
  // Hiện tạm dữ liệu đã lưu từ lần trước (nếu có) để cảm giác tải nhanh hơn,
  // trong lúc chờ dữ liệu mới nhất từ Firestore.
  try{
    const cached = JSON.parse(localStorage.getItem('acc_cache_accounts')||'null');
    if(cached && cached.length){ accounts = cached; renderHome(); }
  }catch(e){}
  const [accSnap, loginSnap] = await Promise.all([
    db.collection(COL.accounts).get().catch(()=>null),
    db.collection(COL.logins).orderBy('at','desc').limit(100).get().catch(()=>null)
  ]);
  if(accSnap){
    accounts = accSnap.docs.map(d=>({id:d.id, ...d.data()}));
    try{ localStorage.setItem('acc_cache_accounts', JSON.stringify(accounts)); }catch(e){}
  } else if(!accounts.length){ accounts = []; }
  logins = loginSnap ? loginSnap.docs.map(d=>({id:d.id, ...d.data()})) : [];
  purgeOld(); // chạy nền, không chặn hiển thị ban đầu
}

async function purgeOld(){
  const now = Date.now();
  const fourMonths = 1000*60*60*24*30*4;
  const day = 1000*60*60*24;
  for(const a of [...accounts]){
    if(!a.deletedAt && now - a.addedAt > fourMonths){
      await db.collection(COL.accounts).doc(a.id).delete().catch(()=>{});
      accounts = accounts.filter(x=>x.id!==a.id);
    } else if(a.deletedAt && now - a.deletedAt > day){
      await db.collection(COL.accounts).doc(a.id).delete().catch(()=>{});
      accounts = accounts.filter(x=>x.id!==a.id);
    }
  }
}

// ===== Tabs =====
function bindTabs(){
  document.querySelectorAll('nav button').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      ['home','all','trash','history','admin'].forEach(t=>document.getElementById('tab-'+t).classList.add('hide'));
      document.getElementById('tab-'+btn.dataset.tab).classList.remove('hide');
      if(btn.dataset.tab==='all') renderAll();
      if(btn.dataset.tab==='trash') renderTrash();
      if(btn.dataset.tab==='history') renderHistory();
      if(btn.dataset.tab==='admin') renderAdmin();
    };
  });
  document.getElementById('searchInput').oninput = renderHome;
}

// ===== Thẻ acc =====
function cardHtml(a, kw, opts){
  opts = opts||{};
  const codeHtml = highlight(a.code||'', kw);
  const descHtml = highlight(a.desc||'', kw);
  const img = a.imageUrl ? `<img src="${a.imageUrl}" data-id="${a.id}" class="zoomtrig">` : `<div style="aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:12px;border-bottom:2px solid var(--line)">Không có ảnh</div>`;
  return `<div class="card" data-id="${a.id}">
    ${img}
    <div class="info">
      <span class="code">${codeHtml||'(chưa có mã)'}</span>
      ${a.price ? `<div class="price">${highlight(a.price, kw)}</div>` : ''}
      <div class="desc">${descHtml}</div>
      <div class="meta">Thêm: ${fmtDate(a.addedAt)}${a.deletedAt?('<br>Xóa: '+fmtDate(a.deletedAt)):''}</div>
    </div>
    <div class="actions">
      ${opts.trash ? `<button class="ok" data-restore="${a.id}">Khôi phục</button>` : `<button class="edit" data-edit="${a.id}">Sửa</button><button class="del" data-del="${a.id}">Xóa</button>`}
    </div>
  </div>`;
}

function attachCardEvents(container){
  container.querySelectorAll('.zoomtrig').forEach(img=> img.onclick = ()=> openZoom(img.dataset.id));
  container.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = (e)=>{ e.stopPropagation(); openEditModal(b.dataset.edit); };
  });
  container.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.del;
      await db.collection(COL.accounts).doc(id).update({deletedAt: Date.now()}).catch(()=>{});
      const a = accounts.find(x=>x.id===id); if(a) a.deletedAt = Date.now();
      renderHome(); renderAll(); renderTrash();
    };
  });
  container.querySelectorAll('[data-restore]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.restore;
      await db.collection(COL.accounts).doc(id).update({deletedAt: null}).catch(()=>{});
      const a = accounts.find(x=>x.id===id); if(a) a.deletedAt = null;
      renderTrash(); renderAll(); renderHome();
    };
  });
}

function openZoom(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    ${a.imageUrl?`<img class="zoomimg" src="${a.imageUrl}">`:''}
    <div style="margin-top:10px" class="code tag">${escapeHtml(a.code||'')}</div>
    ${a.price ? `<div class="price">${escapeHtml(a.price)}</div>` : ''}
    <p style="font-size:14px">${escapeHtml(a.desc||'')}</p>
    <div class="meta" style="font-size:12px;color:var(--sub)">Thêm lúc: ${fmtDate(a.addedAt)}</div>
  </div>`;
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.onclick = e=>{ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ===== Sửa ACC đã thêm =====
function openEditModal(id){
  const a = accounts.find(x=>x.id===id); if(!a) return;
  let newBlob = null;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    <h3>Sửa ACC</h3>
    <label>Ảnh (bấm vào khung để đổi ảnh khác, dán Ctrl+V hoặc chọn file)</label>
    <div class="dropzone" id="dzEdit" tabindex="0">${a.imageUrl ? `<img src="${a.imageUrl}">` : 'Bấm vào đây rồi dán ảnh (Ctrl+V) hoặc bấm để chọn file'}</div>
    <input type="file" id="fileInputEdit" accept="image/*" class="hide">
    <label>Mã số (vd 12/205)</label>
    <input id="codeInputEdit" placeholder="12/205" value="${escapeHtml(a.code||'')}">
    <div id="codeErrEdit" class="fielderr"></div>
    <label>Giá</label>
    <input id="priceInputEdit" placeholder="vd 50.000đ" value="${escapeHtml(a.price||'')}">
    <label>Mô tả / thông tin khác</label>
    <textarea id="descInputEdit" placeholder="Thông tin thêm...">${escapeHtml(a.desc||'')}</textarea>
    <div class="rowbtn">
      <button id="cancelEdit">Hủy</button>
      <button id="saveEdit" class="primary">Lưu thay đổi</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dzEdit');
  const fileInput = ov.querySelector('#fileInputEdit');
  enableFieldNav(
    [ov.querySelector('#codeInputEdit'), ov.querySelector('#priceInputEdit'), ov.querySelector('#descInputEdit')],
    ()=> ov.querySelector('#saveEdit').click()
  );
  dz.onclick = ()=> fileInput.click();
  fileInput.onchange = ()=>{ if(fileInput.files[0]){ newBlob = fileInput.files[0]; showPreview(dz, newBlob); } };
  function handlePaste(e){
    const items = (e.clipboardData||window.clipboardData)?.items;
    if(!items) return;
    for(const it of items){
      if(it.type.indexOf('image')===0){
        newBlob = it.getAsFile();
        showPreview(dz, newBlob);
        e.preventDefault();
        break;
      }
    }
  }
  document.addEventListener('paste', handlePaste);
  const codeInputEdit = ov.querySelector('#codeInputEdit');
  const codeErrEdit = ov.querySelector('#codeErrEdit');
  codeInputEdit.oninput = ()=>{ codeErrEdit.textContent=''; codeInputEdit.style.borderColor=''; };
  ov.querySelector('.close-x').onclick = closeModal;
  ov.querySelector('#cancelEdit').onclick = closeModal;
  ov.onclick = e=>{ if(e.target===ov) closeModal(); };
  function closeModal(){ document.removeEventListener('paste', handlePaste); ov.remove(); }
  ov.querySelector('#saveEdit').onclick = async ()=>{
    const code = codeInputEdit.value.trim();
    const dup = findDuplicateByCode(code, a.id);
    if(dup){
      codeErrEdit.textContent = 'Mã "'+code+'" đã tồn tại.';
      codeInputEdit.style.borderColor = 'var(--danger)';
      codeInputEdit.focus();
      showToast({
        title: 'Mã đã tồn tại',
        message: 'Không thể lưu — mã "'+code+'" đã được dùng cho một acc khác.',
        variant: 'error',
        account: dup
      });
      return;
    }
    codeErrEdit.textContent = ''; codeInputEdit.style.borderColor = '';
    const saveBtn = ov.querySelector('#saveEdit');
    saveBtn.textContent = 'Đang lưu...'; saveBtn.disabled = true;
    const price = ov.querySelector('#priceInputEdit').value.trim();
    const desc = ov.querySelector('#descInputEdit').value.trim();
    const update = {code, price, desc};
    if(newBlob){
      try{ update.imageUrl = await compressToBase64(newBlob); }
      catch(e){ console.error('Lỗi xử lý ảnh:', e); }
    }
    await db.collection(COL.accounts).doc(id).update(update).catch(e=>console.error(e));
    Object.assign(a, update);
    closeModal();
    renderHome(); renderAll(); renderTrash();
  };
}

// ===== Render các trang =====
function renderHome(){
  const kw = document.getElementById('searchInput').value.trim();
  const active = accounts.filter(a=>!a.deletedAt);
  let results;
  if(!kw){ results = [...active].sort((a,b)=>b.addedAt-a.addedAt).slice(0,30); }
  else{ const kwl = kw.toLowerCase(); results = active.filter(a => (a.code||'').toLowerCase().includes(kwl) || (a.desc||'').toLowerCase().includes(kwl) || (a.price||'').toLowerCase().includes(kwl)); }
  const box = document.getElementById('homeResults');
  box.parentElement.querySelector('.tagsrow')?.remove();
  if(!results.length){ box.innerHTML = '<div class="empty">Không tìm thấy acc phù hợp</div>'; return; }
  if(kw && results.length>1){
    const d=document.createElement('div'); d.className='tagsrow';
    d.style.marginBottom='10px';
    d.innerHTML = 'Trùng khớp: '+results.map(r=>`<span class="tag">${escapeHtml(r.code||'?')}</span>`).join('');
    box.before(d);
  }
  box.innerHTML = results.map(a=>cardHtml(a, kw)).join('');
  attachCardEvents(box);
}

function renderAll(){
  const wrap = document.getElementById('tab-all');
  const active = accounts.filter(a=>!a.deletedAt).sort((a,b)=>b.addedAt-a.addedAt);
  if(!active.length){ wrap.innerHTML = '<div class="empty">Chưa có acc nào</div>'; return; }
  // Nhóm theo tháng, rồi phân nhỏ theo từng ngày gửi trong tháng đó.
  const monthGroups = {};
  active.forEach(a=>{ const k=monthKey(a.addedAt); (monthGroups[k]=monthGroups[k]||[]).push(a); });
  let html = '';
  Object.keys(monthGroups).sort().reverse().forEach(mk=>{
    html += `<div class="month-h">Tháng ${mk}</div>`;
    const dayGroups = {};
    monthGroups[mk].forEach(a=>{ const dk=dayKey(a.addedAt); (dayGroups[dk]=dayGroups[dk]||[]).push(a); });
    Object.keys(dayGroups).sort().reverse().forEach(dk=>{
      const items = dayGroups[dk];
      html += `<div class="day-h">${dayLabel(items[0].addedAt)} · ${items.length} acc</div><div class="grid">${items.map(a=>cardHtml(a,'')).join('')}</div>`;
    });
  });
  wrap.innerHTML = html;
  attachCardEvents(wrap);
}

function renderTrash(){
  const box = document.getElementById('trashList');
  const trashed = accounts.filter(a=>a.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt);
  if(!trashed.length){ box.innerHTML = '<div class="empty">Thùng rác trống</div>'; return; }
  box.innerHTML = trashed.map(a=>cardHtml(a,'',{trash:true})).join('');
  attachCardEvents(box);
}

function renderHistory(){
  const box = document.getElementById('historyList');
  if(!box || !logins.length){ if(box) box.innerHTML = '<div class="empty">Chưa có lịch sử đăng nhập</div>'; return; }
  box.innerHTML = logins.map(l=>{
    const on = onlineNames.has(l.name);
    return `<div class="loghist"><span><span class="dot ${on?'on':'off'}"></span>${escapeHtml(l.name)}</span><span class="meta">${fmtDate(l.at)}</span></div>`;
  }).join('');
}

function renderAdmin(){
  if(myRole!=='admin' && myRole!=='superadmin') return;
  const pendBox = document.getElementById('pendingUsers');
  if(!pendBox) return;
  const pend = allUsers.filter(u=>u.status==='pending');
  pendBox.innerHTML = pend.length ? pend.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts">
        <button style="color:var(--ok);border-color:var(--ok)" data-approve="${u.id}">Duyệt</button>
        <button style="color:var(--danger);border-color:var(--danger)" data-reject="${u.id}">Từ chối</button>
      </div></div>`).join('') : '<div class="empty">Không có yêu cầu nào</div>';
  pendBox.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.approve).update({status:'approved'}).catch(()=>{}); });
  pendBox.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.reject).delete().catch(()=>{}); });

  const superBox = document.getElementById('superOnlySection');
  if(myRole!=='superadmin'){ superBox.classList.add('hide'); return; }
  superBox.classList.remove('hide');

  const apprBox = document.getElementById('approvedUsers');
  const appr = allUsers.filter(u=>u.status==='approved');
  apprBox.innerHTML = appr.length ? appr.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts"><button style="color:var(--danger);border-color:var(--danger)" data-revoke="${u.id}">Thu hồi</button></div></div>`).join('') : '<div class="empty">Chưa có ai</div>';
  apprBox.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.revoke).update({status:'pending'}).catch(()=>{}); });

  const adminBox = document.getElementById('adminList');
  const admins = allUsers.filter(u=>u.status==='admin');
  adminBox.innerHTML = admins.length ? admins.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts"><button style="color:var(--danger);border-color:var(--danger)" data-removeadmin="${u.id}">Xóa quyền</button></div></div>`).join('') : '<div class="empty">Chưa có admin phụ nào</div>';
  adminBox.querySelectorAll('[data-removeadmin]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.removeadmin).delete().catch(()=>{}); });
}

function bindAdminPanel(){
  const btn = document.getElementById('addAdminBtn');
  if(!btn) return;
  enableFieldNav(
    [document.getElementById('newAdminUser'), document.getElementById('newAdminPass')],
    ()=> btn.click()
  );
  btn.onclick = async ()=>{
    const uname = document.getElementById('newAdminUser').value.trim();
    const pass = document.getElementById('newAdminPass').value.trim();
    if(!uname || !pass) return;
    const key = userKey(uname);
    await db.collection(COL.users).doc(key).set({name: uname, status:'admin', username: uname, password: pass, requestedAt: Date.now()}).catch(()=>{});
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
  };
}

// ===== Thêm acc mới =====
function bindAdd(){ document.getElementById('addFab').onclick = openAddModal; }

function openAddModal(){
  pasteBlob = null;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal">
    <button class="close-x">✕</button>
    <h3>Thêm ACC mới</h3>
    <label>Ảnh (bấm vào khung rồi dán Ctrl+V, hoặc chọn file)</label>
    <div class="dropzone" id="dz" tabindex="0">Bấm vào đây rồi dán ảnh (Ctrl+V) hoặc bấm để chọn file</div>
    <input type="file" id="fileInput" accept="image/*" class="hide">
    <label>Mã số (vd 12/205)</label>
    <input id="codeInput" placeholder="12/205">
    <div id="codeErr" class="fielderr"></div>
    <label>Giá</label>
    <input id="priceInput" placeholder="vd 50.000đ">
    <div id="priceErr" class="fielderr"></div>
    <label>Mô tả / thông tin khác</label>
    <textarea id="descInput" placeholder="Thông tin thêm..."></textarea>
    <div id="descErr" class="fielderr"></div>
    <div class="rowbtn">
      <button id="cancelAdd">Hủy</button>
      <button id="saveAdd" class="primary">Lưu</button>
    </div>
    <button id="goBulk" style="width:100%;margin-top:10px;padding:10px;border:none;background:none;color:var(--sub);text-decoration:underline;font-size:12px">Thêm nhiều ảnh cùng lúc từ máy</button>
  </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dz');
  const fileInput = ov.querySelector('#fileInput');
  enableFieldNav(
    [ov.querySelector('#codeInput'), ov.querySelector('#priceInput'), ov.querySelector('#descInput')],
    ()=> ov.querySelector('#saveAdd').click()
  );
  dz.onclick = ()=> fileInput.click();
  fileInput.onchange = ()=>{ if(fileInput.files[0]){ pasteBlob = fileInput.files[0]; showPreview(dz, pasteBlob); } };
  function handlePaste(e){
    const items = (e.clipboardData||window.clipboardData)?.items;
    if(!items) return;
    for(const it of items){
      if(it.type.indexOf('image')===0){
        pasteBlob = it.getAsFile();
        showPreview(dz, pasteBlob);
        e.preventDefault();
        break;
      }
    }
  }
  document.addEventListener('paste', handlePaste);
  const codeInput = ov.querySelector('#codeInput');
  const codeErr = ov.querySelector('#codeErr');
  const priceInput = ov.querySelector('#priceInput');
  const priceErr = ov.querySelector('#priceErr');
  const descInput = ov.querySelector('#descInput');
  const descErr = ov.querySelector('#descErr');
  codeInput.oninput = ()=>{ codeErr.textContent=''; codeInput.style.borderColor=''; };
  priceInput.oninput = ()=>{ priceErr.textContent=''; priceInput.style.borderColor=''; };
  descInput.oninput = ()=>{ descErr.textContent=''; descInput.style.borderColor=''; };
  ov.querySelector('.close-x').onclick = closeModal;
  ov.querySelector('#cancelAdd').onclick = closeModal;
  ov.querySelector('#goBulk').onclick = ()=>{ closeModal(); openBulkAddModal(); };
  function closeModal(){ document.removeEventListener('paste', handlePaste); ov.remove(); }
  ov.querySelector('#saveAdd').onclick = async ()=>{
    const code = codeInput.value.trim();
    const price = priceInput.value.trim();
    const desc = descInput.value.trim();

    // Bắt buộc điền đủ cả 3 thông tin: mã, giá, mô tả
    codeErr.textContent=''; priceErr.textContent=''; descErr.textContent='';
    codeInput.style.borderColor=''; priceInput.style.borderColor=''; descInput.style.borderColor='';
    let firstMissing = null;
    if(!code){ codeErr.textContent = 'Bắt buộc phải điền mã số.'; codeInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||codeInput; }
    if(!price){ priceErr.textContent = 'Bắt buộc phải điền giá.'; priceInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||priceInput; }
    if(!desc){ descErr.textContent = 'Bắt buộc phải điền mô tả.'; descInput.style.borderColor='var(--danger)'; firstMissing = firstMissing||descInput; }
    if(firstMissing){
      firstMissing.focus();
      showToast({ title:'Thiếu thông tin', message:'Vui lòng điền đủ mã số, giá và mô tả trước khi lưu.', variant:'error' });
      return;
    }

    const dup = findDuplicateByCode(code);
    if(dup){
      codeErr.textContent = 'Mã "'+code+'" đã tồn tại.';
      codeInput.style.borderColor = 'var(--danger)';
      codeInput.focus();
      showToast({
        title: 'Mã đã tồn tại',
        message: 'Không thể thêm — mã "'+code+'" đã được dùng cho một acc khác.',
        variant: 'error',
        account: dup
      });
      return;
    }
    const saveBtn = ov.querySelector('#saveAdd');
    saveBtn.textContent = 'Đang lưu...'; saveBtn.disabled = true;
    let imageUrl = '';
    const id = uid();
    if(pasteBlob){
      try{ imageUrl = await compressToBase64(pasteBlob); }
      catch(e){ console.error('Lỗi xử lý ảnh:', e); }
    }
    const data = {code, price, desc, imageUrl, addedAt: Date.now(), deletedAt: null};
    await db.collection(COL.accounts).doc(id).set(data).catch(e=>console.error(e));
    accounts.push({id, ...data});
    closeModal();
    renderHome(); renderAll();
  };
}

// ===== Thêm nhiều ACC cùng lúc từ nhiều ảnh chọn sẵn trên máy =====
let bulkItems = [];
let bulkActiveIdx = -1;

function openBulkAddModal(){
  bulkItems = [];
  bulkActiveIdx = -1;
  const ov = document.createElement('div'); ov.className='overlay';
  ov.innerHTML = `<div class="modal" style="max-width:640px">
    <button class="close-x">✕</button>
    <h3>Thêm nhiều ACC cùng lúc</h3>
    <input type="file" id="bulkFileInput" accept="image/*" multiple class="hide">
    <button id="bulkPickBtn" style="width:100%;padding:14px;border:2px dashed var(--line);border-radius:10px;background:transparent;color:var(--ink);font-size:14px">Chọn nhiều ảnh từ máy</button>
    <p style="font-size:12px;color:var(--sub);margin:8px 0 0">Chọn xong, bấm vào từng ảnh để nhập mã số và mô tả riêng cho ảnh đó.</p>
    <div id="bulkGrid" class="grid" style="margin-top:14px"></div>
    <div class="rowbtn">
      <button id="bulkCancel">Hủy</button>
      <button id="bulkSaveAll" class="primary">Lưu tất cả</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const bulkFileInput = ov.querySelector('#bulkFileInput');
  ov.querySelector('#bulkPickBtn').onclick = ()=> bulkFileInput.click();
  bulkFileInput.onchange = ()=>{
    bulkItems = Array.from(bulkFileInput.files).map(f=>({file:f, url:URL.createObjectURL(f), code:'', price:'', desc:''}));
    bulkActiveIdx = -1;
    renderBulkGrid(ov);
  };
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.querySelector('#bulkCancel').onclick = ()=>ov.remove();
  ov.querySelector('#bulkSaveAll').onclick = async ()=>{
    if(!bulkItems.length) return;
    const btn = ov.querySelector('#bulkSaveAll');
    btn.disabled = true;
    let skipped = 0;
    for(let i=0;i<bulkItems.length;i++){
      btn.textContent = `Đang lưu ${i+1}/${bulkItems.length}...`;
      const it = bulkItems[i];
      // Bỏ qua ảnh có mã trùng với acc đã có (kể cả những ảnh vừa lưu trong cùng đợt này)
      const dup = findDuplicateByCode(it.code);
      if(dup){
        skipped++;
        showToast({
          title: 'Mã đã tồn tại',
          message: 'Bỏ qua ảnh có mã "'+(it.code||'(chưa có mã)')+'" vì đã trùng.',
          variant: 'error',
          account: dup
        });
        continue;
      }
      let imageUrl = '';
      try{ imageUrl = await compressToBase64(it.file); }catch(e){ console.error(e); }
      const id = uid();
      const data = {code: it.code, price: it.price||'', desc: it.desc, imageUrl, addedAt: Date.now(), deletedAt: null};
      await db.collection(COL.accounts).doc(id).set(data).catch(e=>console.error(e));
      accounts.push({id, ...data});
    }
    ov.remove();
    renderHome(); renderAll();
    if(skipped){
      showToast({ title: 'Hoàn tất', message: `Đã bỏ qua ${skipped} ảnh vì mã bị trùng.`, variant:'error' });
    }
  };
}

function renderBulkGrid(ov){
  const grid = ov.querySelector('#bulkGrid');
  grid.innerHTML = bulkItems.map((it,i)=>{
    if(bulkActiveIdx===i){
      return `<div class="bulkcard editing" data-idx="${i}">
        <img src="${it.url}">
        <input class="bi-code" data-idx="${i}" placeholder="Mã số (vd 12/205)" value="${escapeHtml(it.code)}">
        <input class="bi-price" data-idx="${i}" placeholder="Giá (vd 50.000đ)" value="${escapeHtml(it.price||'')}">
        <textarea class="bi-desc" data-idx="${i}" placeholder="Mô tả / từ khóa...">${escapeHtml(it.desc)}</textarea>
        <button class="bi-done" data-idx="${i}">Xong</button>
      </div>`;
    }
    return `<div class="bulkcard" data-idx="${i}">
      <img src="${it.url}">
      <div class="bi-caption">${it.code ? escapeHtml(it.code) : '<span class="bi-hint">+ Bấm để thêm mã/mô tả</span>'}${it.price?(' · '+escapeHtml(it.price)):''}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.bulkcard:not(.editing)').forEach(el=>{
    el.onclick = ()=>{ bulkActiveIdx = parseInt(el.dataset.idx); renderBulkGrid(ov); };
  });
  function commitEditing(i){
    bulkItems[i].code = grid.querySelector(`.bi-code[data-idx="${i}"]`).value.trim();
    bulkItems[i].price = grid.querySelector(`.bi-price[data-idx="${i}"]`).value.trim();
    bulkItems[i].desc = grid.querySelector(`.bi-desc[data-idx="${i}"]`).value.trim();
    bulkActiveIdx = -1;
    renderBulkGrid(ov);
  }
  grid.querySelectorAll('.bi-done').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); commitEditing(parseInt(btn.dataset.idx)); };
  });
  const editingEl = grid.querySelector('.bulkcard.editing');
  if(editingEl){
    const i = editingEl.dataset.idx;
    enableFieldNav(
      [grid.querySelector(`.bi-code[data-idx="${i}"]`), grid.querySelector(`.bi-price[data-idx="${i}"]`), grid.querySelector(`.bi-desc[data-idx="${i}"]`)],
      ()=> commitEditing(parseInt(i))
    );
  }
}

// Nén và chuyển ảnh thành chuỗi base64 (giới hạn cạnh dài 900px, JPEG chất lượng 0.7)
// để vừa với giới hạn 1MB/tài liệu của Firestore.
function compressToBase64(blob){
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

function showPreview(dz, blob){
  const url = URL.createObjectURL(blob);
  dz.innerHTML = `<img src="${url}">`;
}
