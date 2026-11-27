// ===== Nút đổi giao diện sáng / tối =====
// Bấm nút: giao diện mới lan tròn ra từ chính vị trí nút. Lưu lựa chọn vào localStorage ('acc_mode').
// Trình duyệt không hỗ trợ View Transitions hoặc người dùng bật "giảm chuyển động" thì đổi ngay, không hiệu ứng.
(function(){
  'use strict';
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  if(!btn) return;

  function apply(mode){
    root.setAttribute('data-theme', mode);
    try{ localStorage.setItem('acc_mode', mode); }catch(e){}
  }

  btn.addEventListener('click', function(){
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!document.startViewTransition || reduce){ apply(next); return; }

    var r = btn.getBoundingClientRect();
    var x = r.left + r.width/2, y = r.top + r.height/2;
    var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    var t = document.startViewTransition(function(){ apply(next); });
    t.ready.then(function(){
      root.animate(
        { clipPath: ['circle(0px at '+x+'px '+y+'px)', 'circle('+radius+'px at '+x+'px '+y+'px)'] },
        { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function(){});
  });
})();
