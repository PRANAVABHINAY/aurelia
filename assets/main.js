/* AURELIA site behaviour. Plain JS + GSAP/ScrollTrigger (optional: the page works without them). */
(function () {
  "use strict";
  var root = document.documentElement;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!hasGsap || reduce) root.classList.add("no-anim");
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------- colours */
  var STATE = {
    idle:      { c: [111, 140, 255], spin: 0.0016, pulse: 0.0,  wave: 0.0,  jitter: 0.0 },
    listening: { c: [85, 224, 230],  spin: 0.0030, pulse: 0.0,  wave: 0.07, jitter: 0.0 },
    thinking:  { c: [169, 133, 255], spin: 0.0105, pulse: 0.0,  wave: 0.0,  jitter: 0.02 },
    speaking:  { c: [242, 198, 109], spin: 0.0022, pulse: 0.07, wave: 0.0,  jitter: 0.0 },
    guard:     { c: [240, 166, 74],  spin: 0.0012, pulse: 0.02, wave: 0.0,  jitter: 0.0 }
  };

  /* ---------------------------------------------------------------- neuron sphere */
  function NeuronSphere(canvas, opts) {
    opts = opts || {};
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.n = opts.n || 1000;
    this.radius = opts.radius || 0.42;
    this.interactive = !!opts.interactive;
    this.state = "idle";
    var s = STATE.idle;
    this.cur = { c: s.c.slice(), spin: s.spin, pulse: 0, wave: 0, jitter: 0 };
    this.ay = 0; this.ax = -0.25; this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
    this.t = 0; this.visible = true; this.zoom = 1;
    this.build();
    this.resize();
    var self = this;
    window.addEventListener("resize", function () { self.resize(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; }, { rootMargin: "100px" }).observe(canvas);
    }
    if (this.interactive && finePointer) {
      window.addEventListener("mousemove", function (e) {
        self.tmx = (e.clientX / window.innerWidth - 0.5);
        self.tmy = (e.clientY / window.innerHeight - 0.5);
      });
    }
  }
  NeuronSphere.prototype.build = function () {
    var n = this.n, P = new Float32Array(n * 3), J = new Float32Array(n), G = 2.399963229728653;
    for (var i = 0; i < n; i++) {
      var y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = G * i;
      var jr = 0.965 + Math.random() * 0.07;
      // small random offset so the mesh looks organic, like the original UI
      var x = Math.cos(th) * r + (Math.random() - 0.5) * 0.05, z = Math.sin(th) * r + (Math.random() - 0.5) * 0.05;
      var yy = y + (Math.random() - 0.5) * 0.05, L = Math.sqrt(x * x + yy * yy + z * z);
      P[i * 3] = x / L * jr; P[i * 3 + 1] = yy / L * jr; P[i * 3 + 2] = z / L * jr;
      J[i] = Math.random() * Math.PI * 2;
    }
    // edges to 3 nearest neighbours, de-duplicated
    var seen = {}, E = [];
    for (i = 0; i < n; i++) {
      var best = [[9, -1], [9, -1], [9, -1]];
      for (var j = 0; j < n; j++) {
        if (j === i) continue;
        var dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
        var d = dx * dx + dy * dy + dz * dz;
        if (d < best[2][0]) { best[2] = [d, j]; best.sort(function (a, b) { return a[0] - b[0]; }); }
      }
      for (var k = 0; k < 3; k++) {
        var a = Math.min(i, best[k][1]), b = Math.max(i, best[k][1]), key = a * n + b;
        if (!seen[key]) { seen[key] = 1; E.push(a, b); }
      }
    }
    this.P = P; this.J = J; this.E = new Uint16Array(E);
    this.S = new Float32Array(n * 3); // projected x, y, z
    this.sparks = [];
    for (i = 0; i < 26; i++) this.sparks.push((Math.random() * n) | 0);
  };
  NeuronSphere.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.cv.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width * dpr)); this.h = Math.max(1, Math.round(r.height * dpr));
    this.cv.width = this.w; this.cv.height = this.h; this.dpr = dpr;
  };
  NeuronSphere.prototype.set = function (name) { if (STATE[name]) this.state = name; };
  NeuronSphere.prototype.frame = function (dt) {
    if (!this.visible || document.hidden) return;
    var tgt = STATE[this.state], c = this.cur, f = 1 - Math.pow(0.04, dt);
    for (var i = 0; i < 3; i++) c.c[i] += (tgt.c[i] - c.c[i]) * f;
    c.spin += (tgt.spin - c.spin) * f; c.pulse += (tgt.pulse - c.pulse) * f;
    c.wave += (tgt.wave - c.wave) * f; c.jitter += (tgt.jitter - c.jitter) * f;
    this.t += dt;
    var t = this.t, motion = reduce ? 0.25 : 1;
    this.ay += c.spin * 60 * dt * motion;
    this.mx += (this.tmx - this.mx) * 0.05; this.my += (this.tmy - this.my) * 0.05;
    var ay = this.ay + this.mx * 0.9, ax = this.ax + this.my * 0.6 + Math.sin(t * 0.3) * 0.05 * motion;
    var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    var W = this.w, H = this.h, ctx = this.ctx, R = Math.min(W, H) * this.radius * this.zoom;
    var ox = W / 2, oy = H / 2, P = this.P, S = this.S, J = this.J, n = this.n;
    // speaking: an audio-like envelope; listening: a ripple
    var env = c.pulse * (0.55 + 0.45 * Math.sin(t * 9.0) * Math.sin(t * 3.3 + 1));
    for (i = 0; i < n; i++) {
      var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      var k = 1 + env * Math.sin(J[i] + t * 6) + c.wave * Math.sin(y * 7 - t * 5) + c.jitter * Math.sin(J[i] * 3 + t * 20);
      x *= k; y *= k; z *= k;
      var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      var p = 3 / (3 - z2);
      S[i * 3] = ox + x1 * R * p; S[i * 3 + 1] = oy + y2 * R * p; S[i * 3 + 2] = z2;
    }
    ctx.clearRect(0, 0, W, H);
    var col = "rgba(" + (c.c[0] | 0) + "," + (c.c[1] | 0) + "," + (c.c[2] | 0) + ",";
    // core glow
    var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 1.25);
    g.addColorStop(0, col + (0.20 + env * 1.6) + ")"); g.addColorStop(0.45, col + "0.06)"); g.addColorStop(1, col + "0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // edges, back then front
    var E = this.E, m = E.length;
    ctx.lineWidth = Math.max(1, this.dpr * 0.6);
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (var e = 0; e < m; e += 2) {
        var a = E[e] * 3, b = E[e + 1] * 3, front = (S[a + 2] + S[b + 2]) > 0;
        if (front !== (pass === 1)) continue;
        ctx.moveTo(S[a], S[a + 1]); ctx.lineTo(S[b], S[b + 1]);
      }
      ctx.strokeStyle = col + (pass ? 0.34 : 0.08) + ")";
      ctx.stroke();
    }
    // nodes
    var ds = 1.6 * this.dpr;
    for (pass = 0; pass < 2; pass++) {
      ctx.fillStyle = col + (pass ? 0.95 : 0.3) + ")";
      for (i = 0; i < n; i++) {
        if ((S[i * 3 + 2] > 0) !== (pass === 1)) continue;
        ctx.fillRect(S[i * 3] - ds / 2, S[i * 3 + 1] - ds / 2, ds, ds);
      }
    }
    // sparks
    ctx.fillStyle = "rgba(255,248,230,0.9)";
    for (i = 0; i < this.sparks.length; i++) {
      var q = this.sparks[i] * 3; if (S[q + 2] < 0) continue;
      var tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.beginPath(); ctx.arc(S[q], S[q + 1], (1.2 + tw * 1.8) * this.dpr, 0, 6.283); ctx.fill();
    }
    // centre rings, like the real UI's cursor ring
    ctx.strokeStyle = col + "0.55)"; ctx.lineWidth = 1.2 * this.dpr;
    var rr = R * (0.07 + env * 0.4);
    ctx.beginPath(); ctx.arc(ox, oy, rr, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox, oy, rr * 1.55, 0, 6.283); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
    // orbit
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(-0.35 + this.mx * 0.3);
    ctx.strokeStyle = col + "0.18)"; ctx.lineWidth = this.dpr;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.32, R * 0.3, 0, 0, 6.283); ctx.stroke();
    var oa = t * 0.6; ctx.fillStyle = col + "0.9)";
    ctx.beginPath(); ctx.arc(Math.cos(oa) * R * 1.32, Math.sin(oa) * R * 0.3, 2.6 * this.dpr, 0, 6.283); ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------------- wireframe tray (3D card) */
  function Tray(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.t = 0;
    var b = function (w, d, h, z0) { // box corners
      return [[-w, -d, z0], [w, -d, z0], [w, d, z0], [-w, d, z0], [-w, -d, z0 + h], [w, -d, z0 + h], [w, d, z0 + h], [-w, d, z0 + h]];
    };
    // 212 x 130 x 46 mm tray, wall 4 mm, scaled
    var o = b(1.06, 0.65, 0.46, -0.23), i = b(0.98, 0.57, 0.40, -0.17);
    this.V = o.concat(i);
    var box = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    this.Ed = box.concat(box.filter(function (e) { return !(e[0] > 3 && e[1] > 3); }).map(function (e) { return [e[0] + 8, e[1] + 8]; }))
      .concat([[4, 12], [5, 13], [6, 14], [7, 15]]);
    // drop the inner top face edges (it's open)
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 200 * dpr; canvas.height = 200 * dpr; this.dpr = dpr;
  }
  Tray.prototype.frame = function (dt) {
    this.t += dt * (reduce ? 0.2 : 1);
    var c = this.ctx, W = this.cv.width, H = this.cv.height, a = this.t * 0.5, tilt = 0.55;
    var ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt), s = W * 0.3;
    var pr = this.V.map(function (v) {
      var x = v[0] * ca - v[1] * sa, y = v[0] * sa + v[1] * ca, z = v[2];
      var y2 = y * ct - z * st, z2 = y * st + z * ct;
      return [W / 2 + x * s, H / 2 - z2 * s * 0.9 + y2 * s * 0.35];
    });
    c.clearRect(0, 0, W, H);
    c.strokeStyle = "rgba(242,198,109,0.85)"; c.lineWidth = 1.2 * this.dpr; c.beginPath();
    this.Ed.forEach(function (e) { c.moveTo(pr[e[0]][0], pr[e[0]][1]); c.lineTo(pr[e[1]][0], pr[e[1]][1]); });
    c.stroke();
    c.fillStyle = "rgba(242,198,109,1)";
    pr.forEach(function (p) { c.fillRect(p[0] - 1.5 * 1, p[1] - 1.5, 3, 3); });
  };

  /* ---------------------------------------------------------------- render loop */
  var spheres = [], extras = [];
  var heroCv = $("#heroSphere"), flowCv = $("#flowSphere");
  var hero = heroCv ? new NeuronSphere(heroCv, { n: window.innerWidth < 700 ? 700 : 1150, interactive: true, radius: 0.36 }) : null;
  var flowS = flowCv ? new NeuronSphere(flowCv, { n: 650, radius: 0.33 }) : null;
  if (hero) spheres.push(hero);
  if (flowS) { flowS.set("listening"); spheres.push(flowS); }
  $$(".fcard__mesh").forEach(function (cv) { extras.push(new Tray(cv)); });
  var last = performance.now();
  (function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    spheres.forEach(function (s) { s.frame(dt); });
    extras.forEach(function (x) { x.frame(dt); });
    requestAnimationFrame(loop);
  })(last);

  /* ---------------------------------------------------------------- hero voice demo */
  var voiceText = $("#voiceText"), who = $(".voice__who"), chips = $$(".voice__states .chip");
  function setChip(st) { chips.forEach(function (c) { c.classList.toggle("is-on", c.dataset.state === st); }); }
  function setHeroState(st) { if (hero) hero.set(st); setChip(st); }
  var LINES = [
    { you: "Is the chassis tray printable?", her: "It is, Sir. 212 by 130 by 46 millimetres, about 221 grams of PLA. No overhangs worth losing sleep over." },
    { you: "నమస్కారం", her: "నమస్కారం Sir, all systems nominal." },
    { you: "Delete everything in Downloads.", her: "Downloads is look-only, Sir. I'd need a folder I'm allowed to touch, and your click." },
    { you: "Gaming profile.", her: "Stepping off the GPU. Five gigabytes are yours. Do try to win." },
    { you: "Remind me in 10 minutes to check the print.", her: "Done. I'll tap you on the shoulder at 6:52, Sir." }
  ];
  var li = 0, manual = 0, timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function typeInto(el, text, speed, done) {
    var i = 0, chars = Array.from(text);
    (function step() {
      el.textContent = chars.slice(0, i).join("");
      if (i++ < chars.length) later(step, reduce ? 0 : speed); else if (done) done();
    })();
  }
  function setLang(el, text) { if (/[ఀ-౿]/.test(text)) el.setAttribute("lang", "te"); else el.removeAttribute("lang"); }
  function playLine() {
    if (!voiceText) return;
    if (Date.now() < manual) { later(playLine, 1500); return; }
    var L = LINES[li++ % LINES.length];
    who.textContent = "YOU"; who.style.color = "var(--listen)"; setHeroState("listening"); setLang(voiceText, L.you);
    typeInto(voiceText, L.you, 42, function () {
      later(function () {
        setHeroState("thinking"); voiceText.textContent = "…";
        later(function () {
          who.textContent = "AURELIA"; who.style.color = ""; setHeroState("speaking"); setLang(voiceText, L.her);
          typeInto(voiceText, L.her, 28, function () {
            later(function () { setHeroState("idle"); later(playLine, 2600); }, 900);
          });
        }, 1100);
      }, 500);
    });
  }
  chips.forEach(function (c) {
    c.addEventListener("click", function () { manual = Date.now() + 6000; setHeroState(c.dataset.state); });
  });

  /* ---------------------------------------------------------------- boot + intro */
  var boot = $("#boot"), bootLine = $("#bootLine");
  function intro() {
    if (boot) boot.classList.add("is-done");
    if (hasGsap && !reduce) {
      $$(".hero__title .line").forEach(function (l) { l.innerHTML = "<span>" + l.innerHTML + "</span>"; });
      var tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".hero__title .line > span", { yPercent: 110, duration: 1.3, stagger: 0.09 })
        .from(".hero__eyebrow", { opacity: 0, y: 12, duration: 0.8 }, 0.1)
        .from(".reveal-load", { opacity: 0, y: 24, duration: 1, stagger: 0.08 }, 0.35)
        .from("#heroSphere", { opacity: 0, scale: 0.7, duration: 2.2 }, 0);
    }
    countIn($$(".hero .count"));
    later(playLine, 1600);
  }
  if (boot && !reduce) {
    later(function () { bootLine.textContent = "AURELIA online. Good to see you, Sir."; }, 450);
    later(intro, 1050);
  } else intro();

  /* ---------------------------------------------------------------- counters */
  function countIn(els) {
    els.forEach(function (el) {
      if (el.dataset.done) return; el.dataset.done = 1;
      var to = parseFloat(el.dataset.to), dec = parseInt(el.dataset.dec || "0", 10);
      if (!hasGsap || reduce) { el.textContent = to.toFixed(dec); return; }
      var o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.8, ease: "power3.out", onUpdate: function () { el.textContent = o.v.toFixed(dec); } });
    });
  }
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { countIn([e.target]); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    $$(".count").forEach(function (el) { if (!el.closest(".hero")) cio.observe(el); });
  }

  /* ---------------------------------------------------------------- thesis words */
  var thesis = $("#thesisText");
  if (thesis) {
    var hot = /^(home\.?|graphics|card|language,|rulebook|read\.?|never)$/i;
    thesis.innerHTML = thesis.textContent.split(/\s+/).map(function (w) {
      return '<span class="w' + (hot.test(w) ? " hot" : "") + '">' + w + "</span>";
    }).join(" ");
    if (hasGsap && !reduce) {
      gsap.to("#thesisText .w", { opacity: 1, stagger: 0.05, ease: "none",
        scrollTrigger: { trigger: thesis, start: "top 80%", end: "bottom 45%", scrub: 0.6 } });
    } else $$("#thesisText .w").forEach(function (w) { w.style.opacity = 1; });
  }

  /* ---------------------------------------------------------------- flow (how it works) */
  var steps = $$("#steps .step"), log = $("#flowLog"), flowState = $("#flowState");
  var LOG = [
    ['<span class="t">17:42:01</span> mic   recording… 1.8 s', '<span class="t">17:42:02</span> stt   "Is the chassis tray printable?" · en · <span class="ok">0.7 s</span>'],
    ['<span class="t">17:42:02</span> llm   qwen3:8b → tool print_review(file="chassis_tray.stl")'],
    ['<span class="t">17:42:02</span> gate  kill ✓ registry ✓ schema ✓ channel ✓ paths ✓ domains ✓ outbound ✓ taint ✓', '<span class="t">17:42:02</span> gate  <span class="ok">tier 0 · runs</span> · rate 1/5'],
    ['<span class="t">17:42:03</span> run   print_review · isolated process', '<span class="t">17:42:04</span> done  <span class="ok">212 × 130 × 46 mm · ≈221 g PLA · watertight</span>', '<span class="t">17:42:04</span> wrap  output marked <span class="warn">untrusted</span>'],
    ['<span class="t">17:42:04</span> tts   kokoro bf_emma · streaming', '<span class="her">AURELIA  "It is, Sir. About 221 grams of PLA."</span>']
  ];
  var STEP_LABEL = { listening: "LISTENING", thinking: "THINKING", guard: "POLICY ENGINE", speaking: "SPEAKING" };
  var STEP_COL = { listening: "var(--listen)", thinking: "var(--think)", guard: "var(--amber)", speaking: "var(--gold)" };
  var curStep = -1;
  function showStep(i) {
    if (i === curStep) return; curStep = i;
    steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
    var st = steps[i].dataset.state;
    if (flowS) flowS.set(st);
    flowState.textContent = STEP_LABEL[st]; flowState.style.color = STEP_COL[st];
    var lines = []; for (var k = 0; k <= i; k++) lines = lines.concat(LOG[k]);
    log.innerHTML = lines.slice(-6).join("\n");
  }
  if (steps.length) showStep(0);

  /* ---------------------------------------------------------------- app screenshots */
  var CAPS = {
    confirm: "A delete request waits for a mouse click or Ctrl+Enter. Silence for 15 seconds means no.",
    dark: "Web results arrive marked as untrusted. The amber chip in the top bar says so. VRAM: 5.3 of 8 GB.",
    attach: "An attached .exe is refused before the model ever sees it. A Word report is read and summarised."
  };
  $$(".app__tabs .tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var k = tab.dataset.shot;
      $$(".app__tabs .tab").forEach(function (t) { var on = t === tab; t.classList.toggle("is-on", on); t.setAttribute("aria-selected", on); });
      $$(".frame__shots .shot").forEach(function (s) { s.classList.toggle("is-on", s.dataset.shot === k); });
      $("#shotCap").textContent = CAPS[k];
    });
  });

  /* ---------------------------------------------------------------- policy rail */
  var checks = $$(".checks li"), pGood = $("#pGood"), pBad = $("#pBad"), fGood = $("#fGood"), fBad = $("#fBad");
  var vGood = $("#vGood"), vBad = $("#vBad"), railTrack = $(".rail__track");
  function railAt(p) {
    var g = Math.min(1, p / 0.9), b = Math.min(0.45, p * 0.9);
    pGood.style.left = (g * 100) + "%"; fGood.style.width = (g * 100) + "%";
    pBad.style.left = (b * 100) + "%"; fBad.style.width = (b * 100) + "%";
    checks.forEach(function (c, i) {
      var centre = (i + 0.5) / 10;
      c.classList.toggle("pass", g >= centre);
      if (i === 4) c.classList.toggle("fail", b >= 0.449);
    });
    vBad.classList.toggle("is-on", b >= 0.449);
    vGood.classList.toggle("is-on", g >= 0.999);
    if (railTrack.scrollWidth > railTrack.clientWidth + 4) {
      railTrack.scrollLeft = Math.max(0, g * railTrack.scrollWidth - railTrack.clientWidth * 0.6);
    }
  }
  if (pGood) {
    if (hasGsap && !reduce) {
      ScrollTrigger.create({ trigger: "#rail", start: "top 78%", end: "bottom 40%", scrub: 0.8, onUpdate: function (s) { railAt(s.progress); } });
      railAt(0);
    } else railAt(1);
  }

  /* ---------------------------------------------------------------- confirm card demo */
  var ccTimer = $("#ccTimer"), ccBar = $("#ccBar"), ccResult = $("#ccResult"), ccLeft = 15, ccLive = false, ccInt = null;
  function ccStart() {
    ccLeft = 15; ccLive = true; ccResult.className = "confirm__result mono";
    ccResult.textContent = 'Only a mouse click or Ctrl+Enter can approve. A spoken "yes" does not count.';
    clearInterval(ccInt);
    ccInt = setInterval(function () {
      ccLeft -= 0.1;
      if (ccLeft <= 0) { ccEnd("bad", "No answer in 15 seconds, so the answer is no. Nothing changed."); return; }
      ccTimer.textContent = "closes in " + Math.ceil(ccLeft) + " s · no answer = no";
      ccBar.style.transform = "scaleX(" + (ccLeft / 15) + ")";
    }, 100);
  }
  function ccEnd(kind, msg) {
    ccLive = false; clearInterval(ccInt);
    ccResult.className = "confirm__result mono " + kind; ccResult.textContent = msg;
    ccTimer.textContent = "closed"; ccBar.style.transform = "scaleX(0)";
    setTimeout(ccStart, 4200);
  }
  if (ccTimer) {
    $("#ccYes").addEventListener("click", function () { if (ccLive) ccEnd("good", "Confirmed by click. Moved to the recycle folder, restorable for 7 days. Logged."); });
    $("#ccNo").addEventListener("click", function () { if (ccLive) ccEnd("bad", "Cancelled. Nothing changed."); });
    $("#ccVoice").addEventListener("click", function () {
      if (!ccLive) return;
      ccResult.className = "confirm__result mono bad";
      ccResult.textContent = 'Heard "yes". Voice can\'t approve a Tier 2 action until voice ID ships. Still waiting for a click.';
    });
    if ("IntersectionObserver" in window) {
      var started = false;
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && !started) { started = true; ccStart(); } }, { threshold: 0.5 }).observe($("#confirmDemo"));
    } else ccStart();
  }

  /* ---------------------------------------------------------------- GSAP scenes */
  if (hasGsap && !reduce) {
    // hero sphere drifts away as you scroll
    gsap.set("#heroSphere", { y: 0, yPercent: -52 });
    gsap.to("#heroSphere", { scale: 1.25, opacity: 0.15, yPercent: -40, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

    var mm = gsap.matchMedia();
    mm.add("(min-width: 960px)", function () {
      // pinned flow
      ScrollTrigger.create({
        trigger: ".flow", start: "top top", end: "+=260%", pin: ".flow__pin", pinSpacing: true,
        onUpdate: function (s) { showStep(Math.min(4, Math.floor(s.progress * 5))); }
      });
      // horizontal features
      var sec = $(".features"), track = $("#hTrack");
      sec.classList.add("is-horizontal");
      var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tw = gsap.to(track, { x: function () { return -dist(); }, ease: "none",
        scrollTrigger: { trigger: ".features", start: "top top", end: function () { return "+=" + dist(); },
          pin: ".features__pin", scrub: 0.8, invalidateOnRefresh: true } });
      return function () { sec.classList.remove("is-horizontal"); gsap.set(track, { x: 0 }); tw.kill(); };
    });
    mm.add("(max-width: 959px)", function () {
      // no pinning on small screens: step through on a timer while visible
      root.classList.add("no-pin");
      var i = 0, iv = null;
      var st = ScrollTrigger.create({ trigger: ".flow", start: "top 70%", end: "bottom 30%",
        onToggle: function (s) { clearInterval(iv); if (s.isActive) iv = setInterval(function () { showStep(++i % 5); }, 2200); } });
      return function () { clearInterval(iv); st.kill(); root.classList.remove("no-pin"); };
    });

    // screenshot frame tilts flat
    gsap.fromTo("#appFrame", { rotateX: 24, scale: 0.88, y: 60 }, { rotateX: 0, scale: 1, y: 0, ease: "none",
      scrollTrigger: { trigger: ".app__stage", start: "top 95%", end: "top 25%", scrub: 0.8 } });

    // VRAM bar fills
    var vn = $("#vramNum");
    gsap.from(".gpu__bar .seg", { scaleX: 0, duration: 1.2, stagger: 0.25, ease: "expo.out",
      scrollTrigger: { trigger: "#gpu", start: "top 75%", once: true,
        onEnter: function () { var o = { v: 0 }; gsap.to(o, { v: 7.2, duration: 1.9, ease: "power3.out", onUpdate: function () { vn.textContent = o.v.toFixed(1); } }); } } });

    // giant Telugu drifts
    gsap.fromTo(".telugu__giant span", { x: "8vw" }, { x: "-60vw", ease: "none",
      scrollTrigger: { trigger: ".telugu", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.set(".telugu__giant span", { display: "inline-block" });

    // roadmap line
    gsap.to("#tlFill", { scaleY: 1, ease: "none", scrollTrigger: { trigger: "#timeline", start: "top 65%", end: "bottom 60%", scrub: true } });
    $$("#timeline li").forEach(function (li) {
      ScrollTrigger.create({ trigger: li, start: "top 62%", toggleClass: { targets: li, className: "lit" } });
    });

    // generic reveals (only for things below the first screen)
    var sel = ".app__head > *, .sec__head > *, .vram__head > *, .tier, .ccard, .threat, .never li, .gpu, .win, .telugu__grid > div > *, .bubble, .lang, .compare .eyebrow, .compare .h2, .table-scroll, .who .eyebrow, .who .h2, .who__card, .pricing .eyebrow, .pricing .h2, .pricing .lede, .plan, .roadmap__intro > *, .founder__id > *, .cv, .status, .cta > *, .flow__copy .eyebrow, .flow__copy .h2, .features__head > *";
    var items = $$(sel).filter(function (el) { return el.getBoundingClientRect().top > window.innerHeight; });
    gsap.set(items, { opacity: 0, y: 46 });
    ScrollTrigger.batch(items, { start: "top 90%", once: true,
      onEnter: function (b) { gsap.to(b, { opacity: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.07, overwrite: true }); } });
    // safety net: if anything is still hidden after load + scroll to bottom, show it
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });

    // progress bar
    gsap.to("#progressBar", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
  } else {
    // no GSAP: simple progress bar
    var pb = $("#progressBar");
    window.addEventListener("scroll", function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      pb.style.transform = "scaleX(" + (h > 0 ? window.scrollY / h : 0) + ")";
    }, { passive: true });
    $$(".gpu__bar .seg"); var vn2 = $("#vramNum"); if (vn2) vn2.textContent = "7.2";
    if (!hasGsap) root.classList.add("no-pin");
  }

  /* ---------------------------------------------------------------- nav */
  var nav = $("#nav"), lastY = window.scrollY;
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 30);
    nav.classList.toggle("is-hidden", y > 700 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove("is-hidden");
    lastY = y;
  }, { passive: true });
  var links = $$(".nav__links a");
  if ("IntersectionObserver" in window) {
    var nio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["how", "features", "security", "telugu", "founder"].forEach(function (id) { var el = document.getElementById(id); if (el) nio.observe(el); });
  }

  /* ---------------------------------------------------------------- cursor, magnetic, tilt */
  if (finePointer && !reduce) {
    var cur = $("#cursor"), cx = 0, cy = 0, tx = 0, ty = 0;
    window.addEventListener("mousemove", function (e) { tx = e.clientX; ty = e.clientY; cur.classList.add("is-on"); });
    document.addEventListener("mouseleave", function () { cur.classList.remove("is-on"); });
    (function follow() {
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cur.style.transform = "translate(" + cx + "px," + cy + "px)";
      requestAnimationFrame(follow);
    })();
    $$("a, button, .tilt").forEach(function (el) {
      el.addEventListener("mouseenter", function () { cur.classList.add("is-hover"); });
      el.addEventListener("mouseleave", function () { cur.classList.remove("is-hover"); });
    });
    $$(".magnetic").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.25) + "px," + ((e.clientY - r.top - r.height / 2) * 0.35) + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
    $$(".tilt").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", px * 100 + "%"); el.style.setProperty("--my", py * 100 + "%");
        el.style.transform = "perspective(900px) rotateY(" + ((px - 0.5) * 8) + "deg) rotateX(" + ((0.5 - py) * 8) + "deg) translateZ(0)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------------- copy buttons */
  $$(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var txt = b.dataset.copy, ok = function () { b.textContent = "Copied"; b.classList.add("done"); setTimeout(function () { b.textContent = "Copy"; b.classList.remove("done"); }, 1600); };
      var fallback = function () {
        var el = b.previousElementSibling, r = document.createRange(); r.selectNodeContents(el);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected";
        setTimeout(function () { b.textContent = "Copy"; }, 1600);
      };
      try { navigator.clipboard.writeText(txt).then(ok, fallback); } catch (e) { fallback(); }
    });
  });
})();
