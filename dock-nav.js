/* ===== Thanh menu kiểu Apple (dock) =====
   - Biến thanh menu chữ thành các nút icon bo tròn, nút đang chọn có chấm nhỏ bên dưới.
   - Rê chuột: nút phóng to dần theo khoảng cách (như dock macOS) + nhãn nổi phía trên.
   - Nút kính lúp: bung ô tìm kiếm nhanh ngay dưới thanh menu (Ctrl+K), gõ là tự sang Trang chủ và lọc acc.
   Không đổi logic cũ: các nút vẫn là <button data-tab="..."> nên script.js chạy như trước. */
(function(){
  'use strict';
  var I = {
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-5.5h4v5.5h3.5a1 1 0 0 0 1-1V10"/>',
    all:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    trash:'<path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="M6.2 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v5.5M14 11v5.5"/>',
    history:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    admin:'<path d="M12 3.5 5 6.2v5.3c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6.2z"/><path d="m9.3 12 2 2 3.6-3.8"/>',
    markup:'<path d="M3.5 16.5 9.5 10.5l3.5 3.5 7.5-7.5"/><path d="M15 6.5h5.5V12"/>',
    remind:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    theme:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.5-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.8" r="1"/><circle cx="15.2" cy="8.8" r="1"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>'
  };
  function svg(k){ return '<svg class="dk-ico" viewBox="0 0 24 24" aria-hidden="true">'+(I[k]||I.home)+'</svg>'; }
  window.DockIcons = { svg: svg };

  function build(){
    var nav = document.querySelector('#topbar nav');
    if(!nav || nav.classList.contains('dock')) return;
    nav.classList.add('dock');

    // 1) Đổi chữ -> icon (giữ nguyên chính nút để các sự kiện cũ vẫn chạy)
    [].slice.call(nav.querySelectorAll('button[data-tab]')).forEach(function(b){
      var m = /^(.*?)(?:\s*\((\d+)\))?$/.exec(b.textContent.trim()) || [];
      var label = (m[1] || b.textContent).trim();
      b.setAttribute('aria-label', label);
      b.setAttribute('data-label', label);
      if(m[2]) b.setAttribute('data-badge', m[2]);
      b.innerHTML = svg(b.getAttribute('data-tab')) + '<span class="dk-lbl">' + label + (m[2] ? ' (' + m[2] + ')' : '') + '</span>';
    });

    // 2) Vạch ngăn + nút kính lúp (dùng <span role=button> để bindTabs của script.js không đụng tới)
    var sep = document.createElement('span'); sep.className = 'dk-sep'; sep.setAttribute('aria-hidden','true');
    var sb = document.createElement('span');
    sb.className = 'dk-sb'; sb.setAttribute('role','button'); sb.tabIndex = 0;
    sb.setAttribute('aria-label','Tìm kiếm nhanh'); sb.setAttribute('data-label','Tìm kiếm nhanh (Ctrl+K)');
    sb.innerHTML = svg('search');
    nav.appendChild(sep); nav.appendChild(sb);

    // 3) Ô tìm kiếm bung ra dưới thanh menu
    var spot = document.createElement('div');
    spot.id = 'dockSearch'; spot.className = 'dk-spot';
    spot.innerHTML = '<div class="dk-spot-in">' + svg('search') +
      '<input type="text" placeholder="Tìm theo mã x/x (vd 12/205) hoặc mô tả…" autocomplete="off" spellcheck="false" aria-label="Tìm kiếm nhanh">' +
      '<button type="button" class="dk-x" aria-label="Xóa / đóng">' + svg('x') + '</button></div>';
    document.getElementById('app').appendChild(spot);
    var inp = spot.querySelector('input'), xbtn = spot.querySelector('.dk-x');

    function mainInput(){ return document.getElementById('searchInput'); }
    function goHome(){
      var h = nav.querySelector('button[data-tab="home"]'), t = document.getElementById('tab-home');
      if(h && t && t.classList.contains('hide')) h.click();
    }
    function pushValue(){
      var s = mainInput(); if(!s) return;
      goHome();
      s.value = inp.value;
      s.dispatchEvent(new Event('input', { bubbles:true }));
    }
    function openSpot(){
      var s = mainInput(); if(s && s.value !== inp.value) inp.value = s.value;
      spot.classList.add('open'); sb.classList.add('on');
      setTimeout(function(){ inp.focus(); inp.select(); }, 60);
    }
    function closeSpot(){ spot.classList.remove('open'); sb.classList.remove('on'); inp.blur(); }
    function toggleSpot(){ spot.classList.contains('open') ? closeSpot() : openSpot(); }

    sb.addEventListener('click', toggleSpot);
    sb.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleSpot(); } });
    inp.addEventListener('input', pushValue);
    inp.addEventListener('keydown', function(e){ if(e.key==='Escape'){ e.preventDefault(); closeSpot(); } });
    xbtn.addEventListener('click', function(){
      if(inp.value){ inp.value = ''; pushValue(); inp.focus(); } else closeSpot();
    });
    document.addEventListener('keydown', function(e){
      if((e.ctrlKey || e.metaKey) && (e.key==='k' || e.key==='K')){
        var app = document.getElementById('app');
        if(!app || app.classList.contains('hide')) return;
        e.preventDefault(); toggleSpot();
      }
    });
    var ms = mainInput();
    if(ms) ms.addEventListener('input', function(){ if(inp.value !== ms.value) inp.value = ms.value; });

    // 4) Nhãn nổi
    var bar = document.getElementById('topbar');
    var tip = document.createElement('div'); tip.className = 'dk-tip below'; tip.setAttribute('role','tooltip');
    document.body.appendChild(tip);
    var tipTimer = null;
    function showTip(el){
      if(bar && bar.classList.contains('compact')) return;
      var t = el.getAttribute('data-label') || '';
      var n = el.getAttribute('data-badge'); if(n) t += ' (' + n + ')';
      tip.textContent = t;
      var r = el.getBoundingClientRect(), nr = (bar || nav).getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = nr.bottom + 'px';
      tip.classList.add('on');
    }
    function hideTip(){ clearTimeout(tipTimer); tip.classList.remove('on'); }
    function items(){ return [].slice.call(nav.querySelectorAll('button[data-tab],.dk-sb')).filter(function(e){ return e.offsetParent !== null; }); }

    // 5) Phóng to theo vị trí chuột (chỉ chuột, không áp cho cảm ứng)
    var raf = 0, px = 0;
    function mag(){
      raf = 0;
      if(bar && bar.classList.contains('compact')) return;
      items().forEach(function(el){
        var r = el.getBoundingClientRect(), cx = r.left + r.width / 2;
        var d = Math.abs(px - cx), k = Math.max(0, 1 - d / 120);
        var s = 1 + 0.34 * k * k;
        el.style.setProperty('--s', s.toFixed(3));
        el.style.setProperty('--y', (-(s - 1) * 22).toFixed(1) + 'px');
      });
    }
    function resetMag(){
      items().forEach(function(el){ el.style.removeProperty('--s'); el.style.removeProperty('--y'); });
    }
    nav.addEventListener('pointermove', function(e){
      if(e.pointerType !== 'mouse') return;
      px = e.clientX; if(!raf) raf = requestAnimationFrame(mag);
      var el = e.target.closest && e.target.closest('button[data-tab],.dk-sb');
      if(el && nav.contains(el)) showTip(el); else hideTip();
    });
    nav.addEventListener('pointerleave', function(e){
      if(e.pointerType && e.pointerType !== 'mouse') return;
      hideTip(); resetMag();
    });
    nav.addEventListener('pointerdown', function(e){
      var el = e.target.closest && e.target.closest('button[data-tab],.dk-sb');
      if(el && e.pointerType !== 'mouse'){ showTip(el); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 1100); }
    });
    nav.addEventListener('focusin', function(e){
      var el = e.target.closest && e.target.closest('button[data-tab],.dk-sb');
      if(el && el.matches(':focus-visible')) showTip(el);
    });
    nav.addEventListener('focusout', hideTip);
    nav.addEventListener('scroll', hideTip, { passive:true });
    window.addEventListener('resize', hideTip);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
