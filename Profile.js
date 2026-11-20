(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tx = 0, ty = 0;
  window.addEventListener('pointermove', function (e) {
    tx = e.clientX / window.innerWidth - 0.5;
    ty = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  // VEGA orb: particle sphere plus jagged lightning tendrils with forks.
  function createOrb(canvas, opt) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, R = 1, S = 1, cx = 0, cy = 0;
    var COLORS = [[56, 214, 255], [86, 150, 255], [139, 107, 255], [190, 125, 255], [255, 255, 255]];
    var CUM = [0.34, 0.6, 0.8, 0.92, 1];
    function pick() { var r = Math.random(); for (var i = 0; i < CUM.length; i++) { if (r <= CUM[i]) return COLORS[i]; } return COLORS[0]; }
    function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

    var pts = [], i;
    for (i = 0; i < opt.particles; i++) {
      var y = 1 - (i + 0.5) / opt.particles * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push({ x: Math.cos(th) * rr, y: y, z: Math.sin(th) * rr, k: 0.9 + Math.random() * 0.2, c: rgb(pick()) });
    }
    var tend = [], order = [0, 2, 1, 4];
    for (i = 0; i < opt.tendrils; i++) {
      var col = COLORS[order[i % 4]];
      tend.push({
        th: Math.random() * 6.283, ph: 0.45 + Math.random() * 2.2,
        ws: (Math.random() * 0.0004 + 0.00008) * (Math.random() < 0.5 ? -1 : 1),
        len: 1.25 + Math.random() * 0.55, off: Math.random() * 6.28,
        col: rgb(col), paths: [], last: -999, gap: 70 + Math.random() * 70
      });
    }

    var rcy = 1, rsy = 0, rcx = 1, rsx = 0, out = [0, 0, 0];
    function proj(x, y, z) {
      var x1 = x * rcy + z * rsy, z1 = -x * rsy + z * rcy;
      var y1 = y * rcx - z1 * rsx, z2 = y * rsx + z1 * rcx;
      var p = 1 / (1 - z2 * 0.3);
      out[0] = cx + x1 * R * p; out[1] = cy + y1 * R * p; out[2] = z2;
    }
    function jit(a) { return (Math.random() - 0.5) * 2 * a; }
    function build(td, t) {
      var dx = Math.sin(td.ph) * Math.cos(td.th + td.ws * t), dy = Math.cos(td.ph), dz = Math.sin(td.ph) * Math.sin(td.th + td.ws * t);
      var ax = -dz, az = dx, al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      var bx = dy * az, by = dz * ax - dx * az, bz = -dy * ax;
      var segs = 11, main = [], f, k, amp, ja, jb;
      for (k = 0; k <= segs; k++) {
        f = k / segs; amp = 0.11 * Math.sin(Math.PI * f) + 0.02; ja = jit(amp); jb = jit(amp);
        main.push([dx * td.len * f + ax * ja + bx * jb, dy * td.len * f + by * jb, dz * td.len * f + az * ja + bz * jb]);
      }
      var paths = [{ pts: main, w: 1.25 }];
      var forks = [3 + Math.floor(Math.random() * 2), 6 + Math.floor(Math.random() * 3)];
      forks.forEach(function (fk) {
        var s = main[fk], fx = dx + jit(0.7), fy = dy + jit(0.7), fz = dz + jit(0.7), fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        var br = [s], m, g;
        for (m = 1; m <= 4; m++) { g = m / 4; br.push([s[0] + fx * td.len * 0.3 * g + jit(0.05), s[1] + fy * td.len * 0.3 * g + jit(0.05), s[2] + fz * td.len * 0.3 * g + jit(0.05)]); }
        paths.push({ pts: br, w: 0.7 });
      });
      td.paths = paths;
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.25; S = R / 80;
    }

    var px = 0, py = 0;
    function draw(t) {
      if (!W) return;
      px += (tx - px) * 0.05; py += (ty - py) * 0.05;
      var ry = t * 0.00016 + px * 0.9, rx = 0.32 + py * 0.5;
      rcy = Math.cos(ry); rsy = Math.sin(ry); rcx = Math.cos(rx); rsx = Math.sin(rx);
      var pulse = 1 + 0.02 * Math.sin(t * 0.0022);
      var Rbase = R; R = Rbase * pulse;

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2);
      g.addColorStop(0, 'rgba(140,210,255,.38)'); g.addColorStop(0.3, 'rgba(100,120,255,.17)'); g.addColorStop(1, 'rgba(60,40,160,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      var n = pts.length, j, p, d, sz;
      for (j = 0; j < n; j++) {
        p = pts[j]; proj(p.x * p.k, p.y * p.k, p.z * p.k); d = (out[2] + 1) / 2;
        sz = Math.max(0.6, (0.7 + 1.4 * d) * S);
        ctx.globalAlpha = 0.22 + 0.78 * d; ctx.fillStyle = p.c;
        ctx.fillRect(out[0] - sz / 2, out[1] - sz / 2, sz, sz);
      }

      var q, a, b, path, flick;
      for (q = 0; q < tend.length; q++) {
        a = tend[q];
        if (t - a.last > a.gap) { build(a, t); a.last = t; }
        flick = 0.5 + 0.3 * Math.sin(t * 0.004 + a.off) + Math.random() * 0.15;
        ctx.strokeStyle = a.col; ctx.shadowColor = a.col; ctx.shadowBlur = 9 * S;
        for (b = 0; b < a.paths.length; b++) {
          path = a.paths[b];
          ctx.globalAlpha = Math.min(1, flick) * (b ? 0.75 : 1);
          ctx.lineWidth = Math.max(0.5, path.w * S);
          ctx.beginPath();
          for (j = 0; j < path.pts.length; j++) {
            proj(path.pts[j][0], path.pts[j][1], path.pts[j][2]);
            if (j) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
          }
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;

      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
      core.addColorStop(0, 'rgba(255,255,255,.9)'); core.addColorStop(0.4, 'rgba(160,220,255,.35)'); core.addColorStop(1, 'rgba(100,120,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = core; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
      R = Rbase;
    }

    var vis = true;
    function frame(t) { if (vis) draw(t); requestAnimationFrame(frame); }
    resize();
    if (window.ResizeObserver) { new ResizeObserver(function () { resize(); if (reduce) draw(1200); }).observe(canvas); }
    else { window.addEventListener('resize', function () { resize(); if (reduce) draw(1200); }); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }).observe(canvas);
    }
    if (reduce) { draw(1200); } else { requestAnimationFrame(frame); }
  }

  createOrb(document.getElementById('orb'), { particles: 650, tendrils: 11 });
  createOrb(document.getElementById('orb2'), { particles: 260, tendrils: 7 });

  // Photo previews: files are read in the browser only.
  document.querySelectorAll('.photo input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var box = inp.closest('.photo');
        var old = box.querySelector('img');
        if (old) old.remove();
        var img = document.createElement('img');
        img.alt = 'Your photo: ' + f.name;
        img.src = r.result;
        box.prepend(img);
        box.classList.add('filled');
        var lab = box.querySelector('label');
        if (!lab.querySelector('.swap')) { lab.insertAdjacentHTML('beforeend', '<span class="swap">Change</span>'); }
      };
      r.readAsDataURL(f);
    });
  });

  // Copy buttons
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-copy');
      var done = function () { b.classList.add('done'); b.title = 'Copied'; setTimeout(function () { b.classList.remove('done'); b.title = 'Copy'; }, 1500); };
      var fail = function () { b.title = 'Copy was blocked. Select the text instead.'; };
      try { navigator.clipboard.writeText(t).then(done, fail); }
      catch (err) { fail(); }
    });
  });

  // Highlight the section in view
  var links = document.querySelectorAll('.index nav a');
  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = map[e.target.id]; if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.sheet').forEach(function (s) { io.observe(s); });
  }
})();
