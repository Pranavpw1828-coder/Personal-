(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var tx = 0, ty = 0;
  addEventListener('pointermove', function (e) { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  var COLORS = [[56, 214, 255], [86, 150, 255], [139, 107, 255], [190, 125, 255], [255, 255, 255]];
  var CUM = [0.34, 0.6, 0.8, 0.92, 1];
  var COLS = COLORS.map(function (c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; });
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Fibonacci sphere; sorted by colour so fillStyle changes are rare.
  function sphere(n) {
    var a = [], i, y, rr, th, k, r, ci;
    for (i = 0; i < n; i++) {
      y = 1 - (i + 0.5) / n * 2; rr = Math.sqrt(1 - y * y); th = i * 2.399963; k = 0.9 + Math.random() * 0.2;
      r = Math.random(); ci = 0; while (ci < 4 && r > CUM[ci]) ci++;
      a.push({ x: Math.cos(th) * rr * k, y: y * k, z: Math.sin(th) * rr * k, c: ci });
    }
    a.sort(function (p, q) { return p.c - q.c; });
    return a;
  }

  var orbs = [], orbsOn = false, lowQ = false, emaCost = 0, lastOrb = 0, bootDraw = null;

  /* ---------- VEGA orb (no shadowBlur, cached glow sprites, 2-pass glow strokes) ---------- */
  function createOrb(canvas, opt) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var pts = sphere(opt.particles), tend = [], order = [0, 2, 1, 4], i;
    for (i = 0; i < opt.tendrils; i++) {
      tend.push({ th: Math.random() * 6.283, ph: 0.45 + Math.random() * 2.2, ws: (Math.random() * 0.0004 + 0.00008) * (Math.random() < 0.5 ? -1 : 1),
        len: 1.25 + Math.random() * 0.55, off: Math.random() * 6.28, col: COLS[order[i % 4]], paths: [], last: -999, gap: 80 + Math.random() * 80 });
    }
    var W = 0, H = 0, R = 1, S = 1, cx = 0, cy = 0, glow = null, core = null, px = 0, py = 0;
    var rcy = 1, rsy = 0, rcx = 1, rsx = 0, out = [0, 0, 0];
    var api = { vis: true, draw: draw };

    function proj(x, y, z, Rn) {
      var x1 = x * rcy + z * rsy, z1 = -x * rsy + z * rcy, y1 = y * rcx - z1 * rsx, z2 = y * rsx + z1 * rcx, p = 1 / (1 - z2 * 0.3);
      out[0] = cx + x1 * Rn * p; out[1] = cy + y1 * Rn * p; out[2] = z2;
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
      [3 + Math.floor(Math.random() * 2), 6 + Math.floor(Math.random() * 3)].forEach(function (fk) {
        var s = main[fk], fx = dx + jit(0.7), fy = dy + jit(0.7), fz = dz + jit(0.7), fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        var br = [s], m, g;
        for (m = 1; m <= 4; m++) { g = m / 4; br.push([s[0] + fx * td.len * 0.3 * g + jit(0.05), s[1] + fy * td.len * 0.3 * g + jit(0.05), s[2] + fz * td.len * 0.3 * g + jit(0.05)]); }
        paths.push({ pts: br, w: 0.7 });
      });
      td.paths = paths;
    }
    function sprites() {
      var gs = Math.ceil(R * 4 * DPR), cs = Math.ceil(R * 2 * DPR), g, gr;
      glow = document.createElement('canvas'); glow.width = glow.height = gs; g = glow.getContext('2d');
      gr = g.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
      gr.addColorStop(0, 'rgba(140,210,255,.38)'); gr.addColorStop(0.3, 'rgba(100,120,255,.17)'); gr.addColorStop(1, 'rgba(60,40,160,0)');
      g.fillStyle = gr; g.fillRect(0, 0, gs, gs);
      core = document.createElement('canvas'); core.width = core.height = cs; g = core.getContext('2d');
      gr = g.createRadialGradient(cs / 2, cs / 2, 0, cs / 2, cs / 2, cs * 0.225);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(160,220,255,.35)'); gr.addColorStop(1, 'rgba(100,120,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, cs, cs);
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.25; S = R / 80;
      sprites();
      if (reduce) draw(1200);
    }
    function draw(t) {
      if (!W || !glow) return;
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      var ry = t * 0.00016 + px * 0.9, rx = 0.32 + py * 0.5;
      rcy = Math.cos(ry); rsy = Math.sin(ry); rcx = Math.cos(rx); rsx = Math.sin(rx);
      var Rn = R * (1 + 0.02 * Math.sin(t * 0.0022));

      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(glow, cx - R * 2, cy - R * 2, R * 4, R * 4);

      ctx.globalCompositeOperation = 'lighter';
      var step = lowQ ? 2 : 1, n = pts.length, j, p, d, sz, last = -1;
      for (j = 0; j < n; j += step) {
        p = pts[j]; proj(p.x, p.y, p.z, Rn); d = (out[2] + 1) / 2;
        sz = Math.max(0.6, (0.7 + 1.4 * d) * S) * step;
        ctx.globalAlpha = 0.22 + 0.78 * d;
        if (p.c !== last) { ctx.fillStyle = COLS[p.c]; last = p.c; }
        ctx.fillRect(out[0] - sz / 2, out[1] - sz / 2, sz, sz);
      }

      var q, a, b, path, flick, al;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (q = 0; q < tend.length; q++) {
        a = tend[q];
        if (t - a.last > a.gap) { build(a, t); a.last = t; }
        flick = Math.min(1, 0.5 + 0.3 * Math.sin(t * 0.004 + a.off) + Math.random() * 0.15);
        ctx.strokeStyle = a.col;
        for (b = 0; b < a.paths.length; b++) {
          path = a.paths[b]; al = flick * (b ? 0.75 : 1);
          ctx.beginPath();
          for (j = 0; j < path.pts.length; j++) {
            proj(path.pts[j][0], path.pts[j][1], path.pts[j][2], Rn);
            if (j) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
          }
          if (!lowQ) { ctx.globalAlpha = al * 0.22; ctx.lineWidth = Math.max(1.5, path.w * S * 4); ctx.stroke(); }
          ctx.globalAlpha = al; ctx.lineWidth = Math.max(0.5, path.w * S); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(core, cx - Rn, cy - Rn, Rn * 2, Rn * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { api.vis = es[0].isIntersecting; }).observe(canvas);
    orbs.push(api);
  }

  /* ---------- Boot: circuit V draws itself, then dissolves into the orb ---------- */
  function startBoot() {
    var el = document.getElementById('boot'), cv = document.getElementById('bootc');
    var pctEl = document.getElementById('bootpct'), stEl = document.getElementById('bootst'), skip = document.getElementById('bootskip');
    var ctx = cv.getContext('2d'), N = 650, i, done = false, revealed = false, t0 = 0, lastPct = -1, lastSt = '';
    var P = [[10, 26], [10, 4], [23, 4], [28, 9], [28, 14], [23, 19], [10, 19]], NP = P.length;
    var W, H, sc, pp, seg, cum, tot, lg, ccx, ccy, R, S;
    var sx = [], sy = [], ex = [], ey = [], ed = [], ec = [], stag = [];

    function setup() {
      W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      sc = Math.min(W * 0.5, 360) / 30;
      var ox = W / 2 - 19 * sc, oy = H / 2 - 15 * sc;
      pp = P.map(function (p) { return [ox + p[0] * sc, oy + p[1] * sc]; });
      seg = []; cum = [0]; tot = 0;
      for (i = 1; i < NP; i++) { var l = Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]); seg.push(l); tot += l; cum.push(tot); }
      lg = ctx.createLinearGradient(pp[1][0], pp[1][1], pp[4][0], pp[0][1]);
      lg.addColorStop(0, '#38D6FF'); lg.addColorStop(1, '#8B6BFF');
      var d, k, f, smp = [];
      for (i = 0; i < N; i++) {
        d = i / (N - 1) * tot; k = 0; while (k < NP - 2 && d > seg[k]) { d -= seg[k]; k++; }
        f = seg[k] ? d / seg[k] : 0;
        smp.push([pp[k][0] + (pp[k + 1][0] - pp[k][0]) * f, pp[k][1] + (pp[k + 1][1] - pp[k][1]) * f]);
      }
      smp.sort(function (a, b) { return a[0] - b[0]; });
      for (i = 0; i < N; i++) { sx[i] = smp[i][0]; sy[i] = smp[i][1]; }
      // Target = where the hero orb sits (falls back to screen centre if it is off screen)
      var hb = document.querySelector('.orbbox').getBoundingClientRect();
      ccx = hb.left + hb.width / 2; ccy = hb.top + hb.height / 2;
      if (ccx < 0 || ccx > W || ccy < 0 || ccy > H) { ccx = W / 2; ccy = H / 2; }
      R = (Math.min(hb.width, hb.height) * 0.25) || 100; S = R / 80;
      var sp = sphere(N), cr = Math.cos(0.32), sr = Math.sin(0.32), tg = [];
      sp.forEach(function (p) {
        var y1 = p.y * cr - p.z * sr, z2 = p.y * sr + p.z * cr, pr = 1 / (1 - z2 * 0.3);
        tg.push({ x: ccx + p.x * R * pr, y: ccy + y1 * R * pr, d: (z2 + 1) / 2, c: p.c });
      });
      tg.sort(function (a, b) { return a.x - b.x; });
      for (i = 0; i < N; i++) { ex[i] = tg[i].x; ey[i] = tg[i].y; ed[i] = tg[i].d; ec[i] = tg[i].c; stag[i] = Math.random(); }
    }

    function finish() {
      if (done) return; done = true; bootDraw = null; orbsOn = true;
      root.classList.remove('booting', 'reveal'); el.style.display = 'none';
    }
    function reveal() {
      if (revealed) return; revealed = true; orbsOn = true;
      root.classList.add('reveal');
      setTimeout(finish, 560);
    }
    skip.addEventListener('click', function () { reveal(); });
    setTimeout(function () { reveal(); }, 4200); // safety net if animation frames are throttled

    window.scrollTo(0, 0);
    setup();
    addEventListener('resize', function () { if (!done) setup(); });

    bootDraw = function (now) {
      if (done) return;
      if (!t0) t0 = now;
      var t = now - t0, k, m, x, y;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);

      var dp = clamp(t / 1100, 0, 1), len = ease(dp) * tot;
      var lineA = t < 1100 ? 1 : clamp(1 - (t - 1100) / 450, 0, 1);
      if (lineA > 0) {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]);
        var hx = pp[0][0], hy = pp[0][1];
        for (k = 0; k < NP - 1; k++) {
          var take = Math.min(seg[k], len - cum[k]); if (take <= 0) break;
          var f = take / seg[k]; hx = pp[k][0] + (pp[k + 1][0] - pp[k][0]) * f; hy = pp[k][1] + (pp[k + 1][1] - pp[k][1]) * f;
          ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = lg;
        ctx.globalAlpha = 0.22 * lineA; ctx.lineWidth = sc * 1.1; ctx.stroke();
        ctx.globalAlpha = lineA; ctx.lineWidth = Math.max(2, sc * 0.28); ctx.stroke();
        // nodes pop in as the line reaches them
        for (k = 0; k < NP; k++) {
          if (len + 0.5 < cum[k]) continue;
          var big = (k === 0 || k === 1 || k === NP - 1);
          ctx.globalAlpha = lineA; ctx.fillStyle = big ? (k === 1 ? '#8B6BFF' : '#38D6FF') : '#E7EEFB';
          ctx.beginPath(); ctx.arc(pp[k][0], pp[k][1], big ? sc * 0.34 : sc * 0.2, 0, 6.2832); ctx.fill();
        }
        if (dp < 1) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, sc * 0.3, 0, 6.2832); ctx.fill(); }
      }

      if (t > 1000) {
        var pa = clamp((t - 1000) / 250, 0, 1);
        // soft glow builds as the orb forms
        var ga = clamp((t - 1500) / 600, 0, 1);
        if (ga > 0) {
          var gr = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, R * 2);
          gr.addColorStop(0, 'rgba(140,210,255,.38)'); gr.addColorStop(0.3, 'rgba(100,120,255,.17)'); gr.addColorStop(1, 'rgba(60,40,160,0)');
          ctx.globalAlpha = ga; ctx.fillStyle = gr; ctx.fillRect(ccx - R * 2, ccy - R * 2, R * 4, R * 4);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < N; i++) {
          var lt = clamp((t - 1250 - stag[i] * 260) / 620, 0, 1); m = ease(lt);
          x = sx[i] + (ex[i] - sx[i]) * m; y = sy[i] + (ey[i] - sy[i]) * m;
          var sz0 = sc * 0.22, sz1 = Math.max(0.6, (0.7 + 1.4 * ed[i]) * S), sz = sz0 + (sz1 - sz0) * m;
          var a0 = 0.7, a1 = 0.22 + 0.78 * ed[i];
          ctx.globalAlpha = (a0 + (a1 - a0) * m) * pa;
          ctx.fillStyle = COLS[ec[i]];
          ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      var pc = Math.min(100, Math.round(t / 2000 * 100));
      if (pc !== lastPct) { lastPct = pc; pctEl.textContent = pc + '%'; }
      var st = t < 1100 ? 'Drawing circuit' : t < 1900 ? 'Compiling orb' : 'Online';
      if (st !== lastSt) { lastSt = st; stEl.textContent = st; }

      if (t >= 1900) reveal();
    };
  }

  /* ---------- Init ---------- */
  var booting = root.classList.contains('booting');
  createOrb(document.getElementById('orb'), { particles: 650, tendrils: 11 });
  createOrb(document.getElementById('orb2'), { particles: 220, tendrils: 6 });

  if (reduce) {
    orbs.forEach(function (o) { o.draw(1200); });
  } else {
    if (booting) { startBoot(); } else { orbsOn = true; }
    (function loop(t) {
      requestAnimationFrame(loop);
      if (document.hidden) return;
      if (bootDraw) bootDraw(t);
      if (orbsOn && t - lastOrb >= 33) {
        lastOrb = t;
        var s = performance.now(), j;
        for (j = 0; j < orbs.length; j++) if (orbs[j].vis) orbs[j].draw(t);
        emaCost = emaCost * 0.9 + (performance.now() - s) * 0.1;
        if (emaCost > 9) lowQ = true; else if (emaCost < 5) lowQ = false;
      }
    })(0);
  }

  /* Photo previews: files are read in the browser only. */
  document.querySelectorAll('.photo input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var box = inp.closest('.photo'), old = box.querySelector('img'); if (old) old.remove();
        var img = document.createElement('img'); img.alt = 'Your photo: ' + f.name; img.src = r.result; box.prepend(img);
        box.classList.add('filled');
        var lab = box.querySelector('label');
        if (!lab.querySelector('.swap')) lab.insertAdjacentHTML('beforeend', '<span class="swap">Change</span>');
      };
      r.readAsDataURL(f);
    });
  });

  /* Copy buttons */
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-copy');
      var ok = function () { b.classList.add('done'); b.title = 'Copied'; setTimeout(function () { b.classList.remove('done'); b.title = 'Copy'; }, 1500); };
      var bad = function () { b.title = 'Copy was blocked. Select the text instead.'; };
      try { navigator.clipboard.writeText(t).then(ok, bad); } catch (err) { bad(); }
    });
  });

  /* Highlight the section in view */
  var links = document.querySelectorAll('.index nav a'), map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove('on'); }); var a = map[e.target.id]; if (a) a.classList.add('on'); }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.sheet').forEach(function (s) { io.observe(s); });
  }
})();
