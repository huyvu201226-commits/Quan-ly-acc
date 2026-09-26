// ===== Khởi tạo Firebase =====
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function highlight(text, kw){
  const esc = escapeHtml(text);
  if(!kw || !text) return esc;
  const kwe = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return esc.replace(new RegExp('('+kwe+')','ig'), '<mark>$1</mark>');
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
  await recordLogin(myName);
  startPresence();
  await loadData();
  bindTabs();
  bindAdd();
  bindAdminPanel();
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
  try{
    const snap = await db.collection(COL.accounts).get();
    accounts = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }catch(e){ accounts = []; }
  try{
    const snap = await db.collection(COL.logins).orderBy('at','desc').limit(100).get();
    logins = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }catch(e){ logins = []; }
  await purgeOld();
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
      <div class="desc">${descHtml}</div>
      <div class="meta">Thêm: ${fmtDate(a.addedAt)}${a.deletedAt?('<br>Xóa: '+fmtDate(a.deletedAt)):''}</div>
    </div>
    <div class="actions">
      ${opts.trash ? `<button class="ok" data-restore="${a.id}">Khôi phục</button>` : `<button class="del" data-del="${a.id}">Xóa</button>`}
    </div>
  </div>`;
}

function attachCardEvents(container){
  container.querySelectorAll('.zoomtrig').forEach(img=> img.onclick = ()=> openZoom(img.dataset.id));
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
    <p style="font-size:14px">${escapeHtml(a.desc||'')}</p>
    <div class="meta" style="font-size:12px;color:var(--sub)">Thêm lúc: ${fmtDate(a.addedAt)}</div>
  </div>`;
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.onclick = e=>{ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ===== Render các trang =====
function renderHome(){
  const kw = document.getElementById('searchInput').value.trim();
  const active = accounts.filter(a=>!a.deletedAt);
  let results;
  if(!kw){ results = [...active].sort((a,b)=>b.addedAt-a.addedAt).slice(0,30); }
  else{ results = active.filter(a => (a.code||'').toLowerCase().includes(kw.toLowerCase()) || (a.desc||'').toLowerCase().includes(kw.toLowerCase())); }
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
  const groups = {};
  active.forEach(a=>{ const k=monthKey(a.addedAt); (groups[k]=groups[k]||[]).push(a); });
  let html = '';
  Object.keys(groups).sort().reverse().forEach(k=>{
    html += `<div class="month-h">Tháng ${k}</div><div class="grid">${groups[k].map(a=>cardHtml(a,'')).join('')}</div>`;
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
    <div class="userrow"><span class="n">${escapeHtml(u.name)} 🛡</span>
      <div class="acts"><button style="color:var(--danger);border-color:var(--danger)" data-removeadmin="${u.id}">Xóa quyền</button></div></div>`).join('') : '<div class="empty">Chưa có admin phụ nào</div>';
  adminBox.querySelectorAll('[data-removeadmin]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.removeadmin).delete().catch(()=>{}); });
}

function bindAdminPanel(){
  const btn = document.getElementById('addAdminBtn');
  if(!btn) return;
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
    <label>Mô tả / thông tin khác</label>
    <textarea id="descInput" placeholder="Thông tin thêm..."></textarea>
    <div class="rowbtn">
      <button id="cancelAdd">Hủy</button>
      <button id="saveAdd" class="primary">Lưu</button>
    </div>
    <button id="goBulk" style="width:100%;margin-top:10px;padding:10px;border:none;background:none;color:var(--sub);text-decoration:underline;font-size:12px">📦 Thêm nhiều ảnh cùng lúc từ máy</button>
  </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dz');
  const fileInput = ov.querySelector('#fileInput');
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
  ov.querySelector('.close-x').onclick = closeModal;
  ov.querySelector('#cancelAdd').onclick = closeModal;
  ov.querySelector('#goBulk').onclick = ()=>{ closeModal(); openBulkAddModal(); };
  function closeModal(){ document.removeEventListener('paste', handlePaste); ov.remove(); }
  ov.querySelector('#saveAdd').onclick = async ()=>{
    const saveBtn = ov.querySelector('#saveAdd');
    saveBtn.textContent = 'Đang lưu...'; saveBtn.disabled = true;
    const code = ov.querySelector('#codeInput').value.trim();
    const desc = ov.querySelector('#descInput').value.trim();
    let imageUrl = '';
    const id = uid();
    if(pasteBlob){
      try{ imageUrl = await compressToBase64(pasteBlob); }
      catch(e){ console.error('Lỗi xử lý ảnh:', e); }
    }
    const data = {code, desc, imageUrl, addedAt: Date.now(), deletedAt: null};
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
    <button id="bulkPickBtn" style="width:100%;padding:14px;border:2px dashed var(--line);border-radius:10px;background:transparent;color:var(--ink);font-size:14px">📁 Chọn nhiều ảnh từ máy</button>
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
    bulkItems = Array.from(bulkFileInput.files).map(f=>({file:f, url:URL.createObjectURL(f), code:'', desc:''}));
    bulkActiveIdx = -1;
    renderBulkGrid(ov);
  };
  ov.querySelector('.close-x').onclick = ()=>ov.remove();
  ov.querySelector('#bulkCancel').onclick = ()=>ov.remove();
  ov.querySelector('#bulkSaveAll').onclick = async ()=>{
    if(!bulkItems.length) return;
    const btn = ov.querySelector('#bulkSaveAll');
    btn.disabled = true;
    for(let i=0;i<bulkItems.length;i++){
      btn.textContent = `Đang lưu ${i+1}/${bulkItems.length}...`;
      const it = bulkItems[i];
      let imageUrl = '';
      try{ imageUrl = await compressToBase64(it.file); }catch(e){ console.error(e); }
      const id = uid();
      const data = {code: it.code, desc: it.desc, imageUrl, addedAt: Date.now(), deletedAt: null};
      await db.collection(COL.accounts).doc(id).set(data).catch(e=>console.error(e));
      accounts.push({id, ...data});
    }
    ov.remove();
    renderHome(); renderAll();
  };
}

function renderBulkGrid(ov){
  const grid = ov.querySelector('#bulkGrid');
  grid.innerHTML = bulkItems.map((it,i)=>{
    if(bulkActiveIdx===i){
      return `<div class="bulkcard editing" data-idx="${i}">
        <img src="${it.url}">
        <input class="bi-code" data-idx="${i}" placeholder="Mã số (vd 12/205)" value="${escapeHtml(it.code)}">
        <textarea class="bi-desc" data-idx="${i}" placeholder="Mô tả / từ khóa...">${escapeHtml(it.desc)}</textarea>
        <button class="bi-done" data-idx="${i}">Xong</button>
      </div>`;
    }
    return `<div class="bulkcard" data-idx="${i}">
      <img src="${it.url}">
      <div class="bi-caption">${it.code ? escapeHtml(it.code) : '<span class="bi-hint">+ Bấm để thêm mã/mô tả</span>'}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.bulkcard:not(.editing)').forEach(el=>{
    el.onclick = ()=>{ bulkActiveIdx = parseInt(el.dataset.idx); renderBulkGrid(ov); };
  });
  grid.querySelectorAll('.bi-done').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      const i = parseInt(btn.dataset.idx);
      bulkItems[i].code = grid.querySelector(`.bi-code[data-idx="${i}"]`).value.trim();
      bulkItems[i].desc = grid.querySelector(`.bi-desc[data-idx="${i}"]`).value.trim();
      bulkActiveIdx = -1;
      renderBulkGrid(ov);
    };
  });
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
