/* ===== Thanh đầu trang: 80% màn hình, thon dài, luôn dính trên cùng =====
   - Ở đầu trang: thanh dài 80% màn hình, căn giữa, có các nút trang ở giữa.
   - Khi lướt xuống: thu lại thành duy nhất nút ☰ nhỏ ở góc trái.
   - Bấm ☰: danh sách các trang (và nút Sáng/Tối, Thoát…) xổ xuống bên dưới.
   - Cửa sổ hẹp: thu nhỏ icon -> ẩn tên trang -> đưa Sáng/Tối, Thoát vào ☰ (icon trang vẫn hiện); điện thoại (≤560px): chỉ còn ☰ xổ xuống.
   Chuyển động mượt: đo kích thước MỘT lần lúc không có hiệu ứng (class "measuring"), rồi mới cho chạy hiệu ứng từ trạng thái đầu -> cuối,
   không đo lại giữa chừng, nên không bị nhảy/giật. */
(function(){
  'use strict';
  var bar = document.getElementById('topbar'); if(!bar) return;
  var btn = document.getElementById('menuBtn'), nav = bar.querySelector('nav'), logo = bar.querySelector('.brand-logo');
  var mq = window.matchMedia('(max-width:560px)');
  var mini = false, open = false, forced = false, animating = false, animTimer = 0, timer = 0, lastN = -1;
  var STEPS = [[], ['notitle'], ['slim'], ['slim','notitle']];

  function setOpen(v){
    open = !!v;
    bar.classList.toggle('open', open);
    if(btn){ btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu các trang'); }
  }
  function visibleItems(){ return nav ? [].slice.call(nav.children).filter(function(e){ return e.offsetParent !== null; }) : []; }

  // Các nút có vừa trong thanh không?
  function fits(){
    var items = visibleItems(); if(!items.length) return true;
    var cs = getComputedStyle(nav), gap = parseFloat(cs.columnGap || cs.gap) || 0, need = gap * (items.length - 1);
    items.forEach(function(e){ need += e.offsetWidth + (e.classList.contains('dk-sep') ? 8 : 0); });
    return need <= nav.clientWidth + 0.5;
  }
  // Thử lần lượt: icon nhỏ dần (40->30px) -> ẩn tên trang -> nút phụ vào ☰ -> (cuối) gom hết vào ☰. Trả về true nếu phải gom hết.
  function fit(){
    if(bar.offsetWidth === 0) return null;           // trang chưa hiện (đang ở màn đăng nhập)
    bar.classList.remove('compact');
    var ok = false, i, bs;
    for(i = 0; i < STEPS.length && !ok; i++){
      bar.classList.remove('notitle','slim');
      STEPS[i].forEach(function(c){ bar.classList.add(c); });
      for(bs = 40; bs >= 30; bs -= 2){
        bar.style.setProperty('--bs', bs + 'px');
        if(fits()){ ok = true; break; }
      }
    }
    if(!ok){ bar.classList.remove('notitle','slim'); bar.style.removeProperty('--bs'); }
    return !ok;
  }
  // Chốt chiều rộng (px) của dạng "☰ + tên" để chuyển động có điểm đầu/cuối rõ ràng
  function setCw(){
    bar.style.removeProperty('--cw');
    if(bar.classList.contains('compact') && !bar.classList.contains('mini')) bar.style.setProperty('--cw', bar.offsetWidth + 'px');
  }
  function startAnim(){
    animating = true; bar.classList.add('anim'); clearTimeout(animTimer);
    animTimer = setTimeout(function(){ animating = false; bar.classList.remove('anim'); onScroll(); }, 430);
  }

  function collapse(){
    mini = true; forced = false; setOpen(false);
    bar.classList.remove('notitle','slim'); bar.style.removeProperty('--bs'); bar.style.removeProperty('--cw');
    bar.classList.add('mini','compact');
    startAnim();
  }
  function expand(){
    setOpen(false);
    bar.classList.add('measuring');                  // tắt hiệu ứng để đo tức thì ở kích thước đầy đủ
    bar.classList.remove('mini'); mini = false;
    var compact;
    if(mq.matches){ forced = false; bar.classList.remove('notitle','slim'); bar.style.removeProperty('--bs'); compact = true; }
    else { var f = fit(); if(f !== null) forced = f; compact = forced; }
    bar.classList.toggle('compact', compact); setCw();
    var fin = { nt: bar.classList.contains('notitle'), sl: bar.classList.contains('slim'), bs: bar.style.getPropertyValue('--bs'), cw: bar.style.getPropertyValue('--cw') };
    // quay lại dạng ☰ (điểm bắt đầu), bật lại hiệu ứng, rồi chạy tới trạng thái cuối
    bar.classList.remove('notitle','slim'); bar.style.removeProperty('--bs'); bar.style.removeProperty('--cw');
    bar.classList.add('mini','compact'); void bar.offsetWidth;
    bar.classList.remove('measuring'); void bar.offsetWidth;
    if(fin.nt) bar.classList.add('notitle');
    if(fin.sl) bar.classList.add('slim');
    if(fin.bs) bar.style.setProperty('--bs', fin.bs);
    if(fin.cw) bar.style.setProperty('--cw', fin.cw);
    bar.classList.toggle('compact', compact); bar.classList.remove('mini');
    startAnim();
  }

  // Đo/áp lại theo kích thước cửa sổ (không chạy khi đang có chuyển động)
  function apply(){
    if(animating){ later(150); return; }
    if(logo) bar.classList.toggle('nologo', getComputedStyle(logo).backgroundImage === 'none');
    if(mini){ forced = false; return; }
    bar.classList.add('measuring');
    var compact;
    if(mq.matches){ forced = false; bar.classList.remove('notitle','slim'); bar.style.removeProperty('--bs'); compact = true; }
    else { var f = fit(); if(f !== null) forced = f; compact = forced; }
    bar.classList.toggle('compact', compact); setCw();
    void bar.offsetWidth; bar.classList.remove('measuring');
    if(!compact && !bar.classList.contains('slim')) setOpen(false);
  }
  function later(ms){ clearTimeout(timer); timer = setTimeout(apply, ms); }

  function onScroll(){
    if(animating) return;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if(!mini && y > 80) collapse(); else if(mini && y < 24) expand();
  }

  if(btn) btn.addEventListener('click', function(e){ e.stopPropagation(); setOpen(!open); });
  document.addEventListener('click', function(e){ if(open && !bar.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && open){ setOpen(false); if(btn) btn.focus(); } });
  // Chọn trang / bấm kính lúp trong danh sách xổ xuống -> tự đóng lại
  bar.addEventListener('click', function(e){
    if(open && e.target.closest && e.target.closest('button[data-tab],.dk-sb')) setOpen(false);
  });

  var ticking = false;   // gộp sự kiện cuộn: mỗi khung hình xử lý 1 lần
  window.addEventListener('scroll', function(){ if(ticking) return; ticking = true; requestAnimationFrame(function(){ ticking = false; onScroll(); }); }, { passive:true });
  window.addEventListener('resize', function(){ later(100); });
  if(mq.addEventListener) mq.addEventListener('change', function(){ later(0); }); else if(mq.addListener) mq.addListener(function(){ later(0); });

  // Chỉ đo lại khi thanh vừa hiện ra (sau đăng nhập) hoặc số nút hiển thị đổi (vd. admin thấy thêm nút) — không đo mỗi lần đổi tab
  var wasHidden = bar.offsetWidth === 0;
  if(window.ResizeObserver) new ResizeObserver(function(){
    var h = bar.offsetWidth === 0;
    if(wasHidden && !h) later(60);
    wasHidden = h;
  }).observe(bar);
  if(nav && window.MutationObserver) new MutationObserver(function(){
    var n = visibleItems().length;
    if(n !== lastN){ lastN = n; later(60); }
  }).observe(nav, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });

  apply(); onScroll();
})();
