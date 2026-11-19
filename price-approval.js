// ===== DUYỆT GIÁ ACC (price-approval.js) — module chạy ĐỘC LẬP =====
// "Duyệt giá" = quyết định mức GIÁ TĂNG của acc. Acc nào chưa quyết (ô giá tăng để mặc định "Không tăng", chưa ai xác nhận)
// hoặc có giá tăng đang chờ duyệt thì là "CHƯA DUYỆT GIÁ". Module này (không sửa logic thêm/sửa/xóa/lưu của script.js, chỉ "bọc" ngoài):
//   1) Acc chưa duyệt giá -> thẻ in VÀNG + viền khung đậm + thanh "Chưa duyệt giá" kèm ô chọn mức tăng và nút Duyệt (Admin tổng).
//      Duyệt = chọn 1 mức tăng, hoặc để "Không tăng" rồi bấm Duyệt (= đã xem, chốt không tăng). Áp dụng cho TẤT CẢ acc trước đó.
//   2) Tab "Acc đã thêm": mỗi ngày tách 2 nhóm — "🟡 Chưa duyệt giá" xếp trước, "✓ Đã duyệt giá" xếp sau.
//   3) Tab "Lịch sử": mỗi ngày có bao nhiêu acc chưa duyệt giá; bấm để chạy tới nhóm acc đó, hoặc "Bỏ qua". Có số đếm + thông báo nổi.
//   4) Khi duyệt chỉ ghi các trường riêng (priceApproval, priceApprovedBy, priceApprovedAt + markup khi chọn mức tăng) bằng update() từng phần.
// Xóa file này + dòng <script> trong index.html là web trở về như cũ.
(function(){
  'use strict';
  if(typeof window === 'undefined' || typeof document === 'undefined') return;

  var PA_LEGACY_PENDING = true;             // true: acc chưa từng được duyệt (kể cả acc cũ, để mặc định "Không tăng") đều là "chưa duyệt giá"; false: chỉ tính acc nhập Word / giá tăng chờ duyệt
  var SKIP_KEY = 'acc_pa_skip_v1';          // nhớ ngày đã "Bỏ qua" (trên từng máy)
  var canApprove = function(){ return typeof myRole !== 'undefined' && myRole === 'superadmin'; };

  var esc = function(s){ return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };

  // ---------- 1. Acc nào chưa duyệt giá ----------
  function isPending(a){
    if(!a || !isLive(a)) return false;
    if(a.markup) return a.markupStatus === 'pending';           // có giá tăng: chờ duyệt thì vàng, đã duyệt thì thôi
    if(a.priceApproval === 'approved') return false;            // đã chốt "Không tăng"
    if(a.priceApproval === 'pending') return true;              // nhập từ Word
    return PA_LEGACY_PENDING;                                   // để mặc định, chưa ai duyệt
  }
  function pendingByDay(){
    var m = new Map();
    accounts.forEach(function(a){
      if(!isPending(a)) return;
      var k = dayKey(a.addedAt || 0), g = m.get(k);
      if(g) g.list.push(a); else m.set(k, { key: k, ts: a.addedAt || 0, list: [a] });
    });
    return Array.from(m.values()).sort(function(x, y){ return y.ts - x.ts; });
  }
  function loadSkip(){ try{ return JSON.parse(localStorage.getItem(SKIP_KEY) || '{}') || {}; }catch(e){ return {}; } }
  function saveSkip(o){ try{ localStorage.setItem(SKIP_KEY, JSON.stringify(o)); }catch(e){} }
  // Ngày đã bỏ qua sẽ hiện lại nếu có thêm acc chưa duyệt trong ngày đó.
  function visibleDays(){
    var skip = loadSkip(), all = pendingByDay();
    var shown = all.filter(function(d){ return !(skip[d.key] >= d.list.length); });
    return { shown: shown, hidden: all.length - shown.length };
  }

  // ---------- 2. CSS (tự chèn, không đụng style.css) ----------
  function injectCss(){
    if(document.getElementById('paCss')) return;
    var st = document.createElement('style'); st.id = 'paCss';
    st.textContent = [
      '.card.pa-pending{background:color-mix(in srgb,#ffd43b 42%,var(--card))!important;border:4px solid #f2a900!important;box-shadow:0 0 0 3px rgba(255,212,59,.55),var(--shadow-1,none)!important}',
      ':root[data-theme="dark"] .card.pa-pending{background:color-mix(in srgb,#ffd43b 24%,var(--card))!important;border-color:#ffd43b!important}',
      '.pa-bar{display:flex;gap:6px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 10px;background:#ffd43b;color:#3d2e00;font-size:11px;font-weight:800;line-height:1.3}',
      '.pa-bar .pa-sel{max-width:100%;padding:3px 6px;font-size:11px;border:1.5px solid #3d2e00;border-radius:8px;background:#fff;color:#3d2e00}',
      '.pa-bar .pa-ok{border:1.5px solid #3d2e00;background:#fff;color:#3d2e00;border-radius:99px;padding:3px 10px;font-size:11px;font-weight:800;cursor:pointer}',
      '.pa-bar .pa-ok:hover{background:#3d2e00;color:#ffd43b}',
      '.pa-group-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 8px;padding:8px 12px;border:3px solid #f2a900;border-radius:var(--r-m,10px);background:color-mix(in srgb,#ffd43b 38%,var(--card));color:var(--ink);font-weight:800;font-size:13px;scroll-margin-top:90px}',
      '.pa-group-h button{border:1.5px solid currentColor;background:transparent;color:inherit;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:800;cursor:pointer}',
      '.pa-group-h button:hover{background:#3d2e00;color:#ffd43b}',
      '.pa-ok-h{margin:14px 0 8px 2px;font-family:var(--ff-mono);font-size:11.5px;font-weight:700;color:var(--ok)}',
      '.pa-group-h.flash,.pa-flash{animation:paFlash 1.2s ease 3}',
      '@keyframes paFlash{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 8px rgba(255,212,59,.8)}}',
      '#paBox{margin-bottom:6px}',
      '.pa-day{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin-bottom:8px;border:3px solid #f2a900;border-radius:var(--r-m,10px);background:color-mix(in srgb,#ffd43b 30%,var(--card));cursor:pointer}',
      '.pa-day.today{background:color-mix(in srgb,#ffd43b 48%,var(--card))}',
      '.pa-day:hover{box-shadow:var(--shadow-2,0 4px 14px rgba(0,0,0,.18))}',
      '.pa-thumbs{display:flex;gap:4px;flex:none}',
      '.pa-thumbs img{width:44px;height:44px;object-fit:cover;border-radius:6px;border:2px solid #f2a900}',
      '.pa-thumbs span{display:flex;align-items:center;font-size:12px;font-weight:800;padding:0 4px}',
      '.pa-info{flex:1 1 160px;min-width:0;font-size:13px;line-height:1.45}',
      '.pa-info b{font-size:13.5px}',
      '.pa-acts{display:flex;gap:6px;flex-wrap:wrap}',
      '.pa-acts button,.pa-unskip{border:1.5px solid var(--line);border-radius:99px;background:var(--card);color:var(--ink);padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer}',
      '.pa-acts button:hover,.pa-unskip:hover{border-color:var(--edit);color:var(--edit)}',
      '.pa-acts button.go{background:#ffd43b;border-color:#3d2e00;color:#3d2e00}',
      '.pa-acts button.ok{color:var(--ok);border-color:var(--ok)}',
      '.pa-unskip{margin:2px 0 10px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- 3. Thẻ acc: in vàng + khung + nút Duyệt giá (bọc cardHtml, không sửa script.js) ----------
  var _cardHtml = window.cardHtml;
  if(typeof _cardHtml === 'function'){
    window.cardHtml = function(a, kw, opts){
      var h = _cardHtml.apply(this, arguments);
      try{
        if(isViewer() || (opts && opts.trash) || !isPending(a)) return h;
        h = h.replace('<div class="card', '<div class="card pa-pending');
        var saving = a._pending || a._failed;
        var sel = '';
        if(canApprove() && !saving){
          var opts = (typeof markupOptionsHtml === 'function') ? markupOptionsHtml(a.markup || null, 'Không tăng') : '<option value="">Không tăng</option>';
          sel = '<select class="pa-sel" title="Chọn mức giá tăng (hoặc Không tăng) rồi bấm Duyệt">' + opts + '</select>' +
                '<button type="button" class="pa-ok" data-pa-act="approve" data-id="' + esc(a.id) + '">✓ Duyệt</button>';
        }
        var bar = '<div class="pa-bar"><span>🟡 Chưa duyệt giá' + (a.markup ? ' (+' + (typeof fmtMoney === 'function' ? fmtMoney(a.markup) : a.markup) + ' chờ duyệt)' : ' · mặc định không tăng') + '</span>' + sel + '</div>';
        h = h.indexOf('<div class="actions">') >= 0 ? h.replace('<div class="actions">', bar + '<div class="actions">') : h.replace(/<\/div>\s*$/, bar + '</div>');
      }catch(e){ console.error('price-approval cardHtml:', e); }
      return h;
    };
  }

  // ---------- 4. Tab "Acc đã thêm": mỗi ngày tách nhóm "Chưa duyệt giá" riêng, đặt trước nhóm đã duyệt ----------
  function mk(tag, cls){ var e = document.createElement(tag); e.className = cls; return e; }
  function groupAll(){
    if(isViewer()) return;
    var wrap = document.getElementById('tab-all');
    if(!wrap || wrap.classList.contains('hide')) return;
    var ap = canApprove();
    wrap.querySelectorAll('.day-h').forEach(function(h){
      var grid = h.nextElementSibling;
      if(!grid || !grid.classList.contains('grid') || grid.dataset.pa) return;
      grid.dataset.pa = '1';                                   // đã xử lý (làm lại nhiều lần vẫn an toàn)
      var cards = Array.prototype.slice.call(grid.children).filter(function(c){ return c.classList && c.classList.contains('card'); });
      var pend = cards.filter(function(c){ return c.classList.contains('pa-pending'); });
      if(!pend.length) return;
      var a0 = accounts.find(function(x){ return x.id === pend[0].dataset.id; });
      var dk = dayKey(a0 ? a0.addedAt : 0);
      var ph = mk('div', 'pa-group-h'); ph.dataset.day = dk;
      ph.innerHTML = '🟡 Chưa duyệt giá · <b>' + pend.length + '</b> acc' + (ap ? ' <button type="button" data-pa-act="dayok" data-key="' + dk + '">✓ Duyệt cả nhóm</button>' : '');
      var pg = mk('div', 'grid'); pg.dataset.pa = '1';
      pend.forEach(function(c){ pg.appendChild(c); });
      grid.before(ph, pg);
      var rest = cards.length - pend.length;
      if(rest > 0){ var oh = mk('div', 'pa-ok-h'); oh.textContent = '✓ Đã duyệt giá · ' + rest + ' acc'; grid.before(oh); }
      else grid.remove();
      h.textContent = h.textContent + ' · 🟡 ' + pend.length + ' chưa duyệt giá';
    });
  }
  var _renderAll = window.renderAll;
  if(typeof _renderAll === 'function'){
    window.renderAll = function(){
      var r = _renderAll.apply(this, arguments);
      try{ groupAll(); }catch(e){ console.error('price-approval renderAll:', e); }
      return r;
    };
  }

  // ---------- 5. Duyệt giá ----------
  function toast(o){ if(typeof showToast === 'function') showToast(o); }
  function refresh(){
    try{ if(typeof rerenderAll === 'function') rerenderAll(); }catch(e){}
    try{ renderPaBox(); }catch(e){}
    try{ updateHistoryBadge(); }catch(e){}
  }
  // vals (tùy chọn): {id: mứcTăng} — không có thì giữ mức đang chờ duyệt, hoặc "Không tăng"
  async function approve(list, vals){
    if(!canApprove()) return;
    vals = vals || {};
    list = list.filter(function(a){ return a && isPending(a) && !a._pending && !a._failed; });
    if(!list.length) return;
    var now = Date.now(), jobs = list.map(function(a){
      var upd = { priceApproval: 'approved', priceApprovedBy: myName, priceApprovedAt: now };
      var v = (a.id in vals) ? (parseInt(vals[a.id]) || 0) : ((a.markup && a.markupStatus === 'pending') ? a.markup : 0);
      if(v){ upd.markup = v; upd.markupStatus = 'approved'; upd.markupBy = a.markupBy || myName; upd.approvedBy = myName; }   // chọn mức tăng -> đã duyệt luôn
      else { upd.markup = null; upd.markupStatus = null; upd.markupBy = null; upd.approvedBy = null; }                         // "Không tăng" đã được xác nhận
      var prev = {}; Object.keys(upd).forEach(function(k){ prev[k] = a[k]; });
      Object.assign(a, upd);                                  // hiện ngay (lạc quan), lỗi mạng thì trả lại
      return { a: a, upd: upd, prev: prev };
    });
    refresh();
    var fail = 0;
    for(var i = 0; i < jobs.length; i += 8){
      await Promise.all(jobs.slice(i, i + 8).map(async function(j){
        try{ await Loader.silent(function(){ return accCol(j.a).doc(j.a.id).update(j.upd); }); }
        catch(e){ console.error(e); fail++; Object.assign(j.a, j.prev); }
      }));
    }
    if(fail){ refresh(); toast({ title: 'Có ' + fail + ' acc chưa duyệt được', message: 'Lỗi mạng hoặc hết hạn mức — các acc đó vẫn đang ở trạng thái chưa duyệt, thử lại sau.', variant: 'error' }); }
    else toast({ title: 'Đã duyệt giá ' + jobs.length + ' acc', message: '' });
  }

  // ---------- 6. Đi tới khu vực acc chưa duyệt của 1 ngày ----------
  function goToDay(dk){
    if(typeof switchTab === 'function') switchTab('all');
    var live = accounts.filter(isLive).sort(function(x, y){ return y.addedAt - x.addedAt; }), last = -1;
    live.forEach(function(a, i){ if(dayKey(a.addedAt) === dk) last = i; });
    if(last >= allLimit){ allLimit = last + 1; renderAll(); }
    setTimeout(function(){
      var h = document.querySelector('#tab-all .pa-group-h[data-day="' + dk + '"]');
      if(!h){ toast({ title: 'Không thấy nhóm acc này', message: 'Các acc đó có thể đã được duyệt hoặc chưa tải xong.', variant: 'error' }); return; }
      h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash');
      if(h.scrollIntoView) h.scrollIntoView({ block: 'start', behavior: 'smooth' });
      var nx = h.nextElementSibling; if(nx){ nx.querySelectorAll('.card').forEach(function(c){ c.classList.add('pa-flash'); setTimeout(function(){ c.classList.remove('pa-flash'); }, 4000); }); }
    }, 150);
  }

  // ---------- 7. Lịch sử: khu "Chưa duyệt giá" theo ngày ----------
  function ensureBox(){
    var b = document.getElementById('paBox');
    if(!b){
      var nb = document.getElementById('notifBox'); if(!nb || !nb.parentNode) return null;
      b = document.createElement('div'); b.id = 'paBox'; nb.parentNode.insertBefore(b, nb);
    }
    return b;
  }
  function renderPaBox(){
    if(!isStaff()) return;
    var tab = document.getElementById('tab-history');
    if(!tab || tab.classList.contains('hide')) return;
    var box = ensureBox(); if(!box) return;
    injectCss();
    var v = visibleDays(), today = dayKey(Date.now()), ap = canApprove();
    var total = v.shown.reduce(function(s, d){ return s + d.list.length; }, 0);
    var h = '<div class="section-h">🟡 Chưa duyệt giá (' + total + ')</div>';
    if(!v.shown.length) h += '<div class="empty small">' + (v.hidden ? 'Các ngày còn acc chưa duyệt đều đang được bạn bỏ qua.' : 'Không có acc nào đang chờ duyệt giá.') + '</div>';
    v.shown.forEach(function(d){
      var th = d.list.slice(0, 6).map(function(a){ return a.imageUrl ? '<img src="' + a.imageUrl + '" loading="lazy" decoding="async" alt="">' : ''; }).join('');
      if(d.list.length > 6) th += '<span>+' + (d.list.length - 6) + '</span>';
      h += '<div class="pa-day' + (d.key === today ? ' today' : '') + '" data-pa-act="go" data-key="' + d.key + '" tabindex="0" title="Bấm để chạy tới các acc này">' +
        '<div class="pa-thumbs">' + th + '</div>' +
        '<div class="pa-info"><b>' + (d.key === today ? 'Hôm nay · ' : '') + esc(dayLabel(d.ts)) + '</b><div>🟡 <b>' + d.list.length + '</b> acc chưa duyệt giá</div></div>' +
        '<div class="pa-acts"><button type="button" class="go" data-pa-act="go" data-key="' + d.key + '">Đi tới duyệt →</button>' +
        (ap ? '<button type="button" class="ok" data-pa-act="dayok" data-key="' + d.key + '">✓ Duyệt hết</button>' : '') +
        '<button type="button" data-pa-act="skip" data-key="' + d.key + '">Bỏ qua</button></div></div>';
    });
    if(v.hidden) h += '<button type="button" class="pa-unskip" data-pa-act="unskip">Hiện lại ' + v.hidden + ' ngày đã bỏ qua</button>';
    if(box._html !== h){ box._html = h; box.innerHTML = h; }
  }
  var _renderHistory = window.renderHistory;
  if(typeof _renderHistory === 'function'){
    window.renderHistory = function(){
      var r = _renderHistory.apply(this, arguments);
      try{ renderPaBox(); }catch(e){ console.error('price-approval renderHistory:', e); }
      return r;
    };
  }
  // Nút Lịch sử: cộng thêm số ngày/acc chưa duyệt (chưa bỏ qua) vào số đếm cũ.
  var _uhb = window.updateHistoryBadge;
  if(typeof _uhb === 'function'){
    window.updateHistoryBadge = function(){
      var r = _uhb.apply(this, arguments);
      try{
        if(isStaff()){
          var b = document.getElementById('navHistory');
          if(b){
            var n = visibleDays().shown.reduce(function(s, d){ return s + d.list.length; }, 0);
            setNavLabel(b, 'Lịch sử', expiringList().length + getDupMap().size + n);
          }
        }
      }catch(e){}
      return r;
    };
  }

  // ---------- 8. Thông báo nổi: hôm nay có acc chưa duyệt giá ----------
  function maybeToast(){
    if(!isStaff()) return;
    var app = document.getElementById('app'); if(!app || app.classList.contains('hide')) return;
    var today = dayKey(Date.now()), skip = loadSkip();
    var n = accounts.filter(function(a){ return isPending(a) && dayKey(a.addedAt || 0) === today; }).length;
    if(!n || n <= (skip[today] || 0)) return;
    var key = 'acc_pa_toast_' + today, last = 0;
    try{ last = parseInt(sessionStorage.getItem(key) || '0', 10) || 0; }catch(e){}
    if(n <= last) return;
    try{ sessionStorage.setItem(key, String(n)); }catch(e){}
    toast({ title: '🟡 Hôm nay có ' + n + ' acc chưa duyệt giá', message: 'Bấm vào đây để chạy tới các acc đó và duyệt giá (hoặc vào Lịch sử → Bỏ qua).', onClick: function(){ goToDay(today); } });
  }

  // ---------- 9. Sự kiện (bắt ở pha capture để không bị các sự kiện click của thẻ chặn / kích hoạt nhầm) ----------
  function onAct(act, key, el, ev){
    if(act === 'approve'){ var a = accounts.find(function(x){ return x.id === el.dataset.id; }); if(a){ var bs = el.closest('.pa-bar'), se = bs && bs.querySelector('.pa-sel'), vv = {}; if(se) vv[a.id] = se.value; approve([a], vv); } return; }
    if(act === 'go'){ goToDay(key); return; }
    if(act === 'skip'){
      var d = pendingByDay().find(function(x){ return x.key === key; }), s = loadSkip();
      if(d){ s[key] = d.list.length; saveSkip(s); }
      renderPaBox(); updateHistoryBadge(); return;
    }
    if(act === 'unskip'){ saveSkip({}); renderPaBox(); updateHistoryBadge(); return; }
    if(act === 'dayok'){
      var day = pendingByDay().find(function(x){ return x.key === key; }); if(!day) return;
      var run = function(){ approve(day.list); };
      if(typeof openConfirmModal === 'function'){
        openConfirmModal({ title: 'Duyệt cả nhóm', message: 'Duyệt ' + day.list.length + ' acc ngày ' + dayLabel(day.ts).replace('Ngày ', '') + '? Acc đang chờ duyệt giá tăng sẽ được duyệt đúng mức đã đề xuất, các acc còn lại được chốt "Không tăng".', confirmLabel: 'Duyệt', danger: false }).then(function(ok){ if(ok) run(); });
      } else run();
    }
  }
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-pa-act]') : null;
    if(!el) return;
    // bấm nút con trong hàng ngày: để nút xử lý, không cho hàng xử lý thêm lần nữa
    e.preventDefault(); e.stopPropagation();
    onAct(el.dataset.paAct, el.dataset.key, el, e);
  }, true);
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var el = e.target && e.target.closest ? e.target.closest('.pa-day[data-pa-act]') : null;
    if(el && e.target === el){ e.preventDefault(); onAct('go', el.dataset.key, el, e); }
  }, true);

  // Dữ liệu acc đổi (script.js bắn 'acc:changed') -> vẽ lại khu Lịch sử + số đếm + thông báo, gom lại để nhẹ máy.
  var tmr = null;
  document.addEventListener('acc:changed', function(){
    clearTimeout(tmr);
    tmr = setTimeout(function(){ try{ renderPaBox(); updateHistoryBadge(); maybeToast(); }catch(e){ console.error(e); } }, 250);
  });
  injectCss();

  // API nhỏ để các module khác (vd word-import.js) dùng nếu cần
  window.PriceApproval = { isPending: isPending, pendingByDay: pendingByDay, approve: approve, goToDay: goToDay };
})();
