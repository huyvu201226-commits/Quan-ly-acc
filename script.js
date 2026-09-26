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
  if(!v) return;
  localStorage.setItem('acc_myname', v);
  checkAndEnter(v);
};
document.getElementById('recheckBtn').onclick = ()=> checkAndEnter(myName);
document.getElementById('logoutBtn').onclick = ()=>{
  localStorage.removeItem('acc_myname');
  location.reload();
};

if(myName) checkAndEnter(myName);

async function checkAndEnter(name){
  myName = name;
  document.getElementById('login').classList.add('hide');
  const key = userKey(name);
  const isAdminName = name.toLowerCase().trim() === ADMIN_NAME.toLowerCase().trim();
  let snap;
  try{ snap = await db.collection(COL.users).doc(key).get(); }catch(e){ snap = null; }
  if(!snap || !snap.exists){
    myRole = isAdminName ? 'admin' : 'pending';
    await db.collection(COL.users).doc(key).set({name, status: myRole, requestedAt: Date.now()}).catch(()=>{});
  } else {
    myRole = snap.data().status || 'pending';
    if(isAdminName && myRole!=='admin'){
      myRole = 'admin';
      await db.collection(COL.users).doc(key).update({status:'admin'}).catch(()=>{});
    }
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
    if(myRole==='admin') renderAdmin();
  });
}

async function enterApp(){
  document.getElementById('app').classList.remove('hide');
  document.getElementById('whoAmI').textContent = 'Xin chào, '+myName+(myRole==='admin'?' (Admin)':'');
  if(myRole==='admin') document.getElementById('navAdmin').classList.remove('hide');
  await recordLogin(myName);
  startPresence();
  await loadData();
  bindTabs();
  bindAdd();
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
  if(myRole!=='admin') return;
  const pendBox = document.getElementById('pendingUsers');
  const apprBox = document.getElementById('approvedUsers');
  if(!pendBox) return;
  const pend = allUsers.filter(u=>u.status==='pending');
  const appr = allUsers.filter(u=>u.status==='approved'||u.status==='admin');
  pendBox.innerHTML = pend.length ? pend.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)}</span>
      <div class="acts">
        <button style="color:var(--ok);border-color:var(--ok)" data-approve="${u.id}">Duyệt</button>
        <button style="color:var(--danger);border-color:var(--danger)" data-reject="${u.id}">Từ chối</button>
      </div></div>`).join('') : '<div class="empty">Không có yêu cầu nào</div>';
  apprBox.innerHTML = appr.length ? appr.map(u=>`
    <div class="userrow"><span class="n">${escapeHtml(u.name)} ${u.status==='admin'?'👑':''}</span>
      <div class="acts">${u.status==='admin' ? '' : `<button style="color:var(--danger);border-color:var(--danger)" data-revoke="${u.id}">Thu hồi</button>`}</div></div>`).join('') : '<div class="empty">Chưa có ai</div>';
  pendBox.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.approve).update({status:'approved'}).catch(()=>{}); });
  pendBox.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.reject).delete().catch(()=>{}); });
  apprBox.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{ await db.collection(COL.users).doc(b.dataset.revoke).update({status:'pending'}).catch(()=>{}); });
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
