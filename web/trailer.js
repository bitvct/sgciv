/* sgciv trailer: a 30-second timeline rendered from the live map.
   ?trailer          plays it in the page (click to replay)
   ?trailer&record   waits for video/record.mjs to call TRAILER.frame(t) for each frame */
"use strict";
(function () {
  const REC = new URLSearchParams(location.search).has("record");
  const tr = document.createElement("div");
  tr.id = "tr";
  tr.innerHTML = `<div class="vig"></div><div class="capwrap"></div><div class="cap"></div><div class="lcard"></div><div class="chips"></div><div class="ccard"></div><div class="title"></div><div class="black"></div>`;
  document.body.appendChild(tr);
  const el = (c) => tr.querySelector("." + c);
  const E = { vig: el("vig"), capwrap: el("capwrap"), cap: el("cap"), lcard: el("lcard"), chips: el("chips"), ccard: el("ccard"), title: el("title"), black: el("black") };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const fadeIO = (u, a = 0.12, b = 0.12) => Math.min(clamp01(u / a), clamp01((1 - u) / b));
  const P = (lon, lat) => lonlat2xy(lon, lat);
  const zr = (rpx) => rpx / R;

  // ---------------------------------------------------------------- data for captions
  let FIT, QT, DT, POWER, LCACHE = {};
  function prep() {
    fitView(); FIT = { ...S.cam };
    S.userMoved = true;
    QT = cityById.QT; DT = cityById.DT;
    const pw = S.D.sites.filter((s) => s.k === "power" && hexCity[s.h] >= 0 && !isWater(s.h));
    POWER = { n: pw.length, gw: pw.reduce((a, s) => a + (s.v || 0), 0) / 1000 };
    // train paths: every rail segment with its cumulative length (world metres)
    for (const ln of S.D.lines) ln._segs = ln.segs.map((seg) => {
      const cum = [0]; for (let k = 1; k < seg.length; k++) cum.push(cum[k - 1] + Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]));
      return { seg, cum, len: cum[cum.length - 1] };
    });
  }
  function setLensFast(l) {
    S.lens = l;
    if (!LCACHE[l]) { buildColors(); LCACHE[l] = colorCache; }
    colorCache = LCACHE[l];
  }

  // ---------------------------------------------------------------- overlays
  const person = (col, glow) => `<svg viewBox="0 0 16 22"><circle cx="8" cy="5" r="3.6" fill="${col}"/><path d="M2 21v-6.5C2 11 4.6 9.6 8 9.6s6 1.4 6 4.9V21z" fill="${col}"/>${glow ? "" : ""}</svg>`;
  function capHTML(kick, ttl, ttlZh, sub, zh, src) {
    return `<div class="kick">${kick}</div><div class="ttl">${ttl}${ttlZh ? `<small>${ttlZh}</small>` : ""}</div><div class="sub">${sub}</div>${zh ? `<div class="zh">${zh}</div>` : ""}<div class="src">${src}</div>`;
  }
  const LENS_CARD = {
    income: () => ({ ic: "$", t: "Income", zh: "收入", d: "Median monthly household income from work", ramp: ["#1f2d4d", "#24577f", "#2a8a8c", "#69b85a", "#e3d35a", "#f6a13c"], ends: ["S$6,000", "S$14,000", "S$22,000+"], src: "Income: SingStat General Household Survey 2025" }),
    language: () => ({ ic: "💬", t: "Home language", zh: "家庭用语", d: "Language most over-represented at home, vs the national mix", cats: true, src: "Home language: SingStat General Household Survey 2025" }),
    population: () => ({ ic: "👥", t: "Population", zh: "人口", d: "Estimated residents per 600 m hex", ramp: ["#1a1733", "#45206a", "#8b2d74", "#cd4c55", "#f28c3a", "#fbd65b"], ends: ["1", "70", "4,500+"], src: "Population: GHS 2025, spread by URA residential zoning" }),
  };
  function lcardHTML(l) {
    const c = LENS_CARD[l]();
    let h = `<div class="h"><div class="ic">${c.ic}</div><div class="t">${c.t}<small>${c.zh}</small></div></div><div class="d">${c.d}</div>`;
    if (c.ramp) h += `<div class="ramp" style="background:linear-gradient(90deg,${c.ramp.join(",")})"></div><div class="ends">${c.ends.map((e) => `<span>${e}</span>`).join("")}</div>`;
    if (c.cats) {
      const present = new Set(S.D.cities.map((x) => cityLensValue(x, "language")).filter(Boolean).map((v) => v.k));
      h += `<div class="cats">${CAT_KEYS.language.filter((k) => present.has(k)).map((k) => `<div class="cat"><i style="background:${rgbs(catColor("language", k))}"></i>${CAT_LABEL.language(k)} · ${t(LANG.find((x) => x[0] === k)[1]) && I18N.zh[LANG.find((x) => x[0] === k)[1]]}</div>`).join("")}</div>`;
    }
    return { h, src: c.src };
  }
  function chipsHTML(n) {
    const nat = S.D.national;
    const open = S.D.lines.filter((l) => l.status === "open" && l.key !== "Sentosa");
    const mrt = open.filter((l) => l.type === "subway").length, lrt = open.length - mrt;
    const chips = [
      ["🚇", `${mrt} MRT + ${lrt} LRT lines · 地铁与轻轨`, "URA Master Plan 2025 rail layer · OpenStreetMap routes"],
      ["⚓", `${(nat.teu_k / 1000).toFixed(1)}M containers (TEU), ${nat.teu_year}`, "Port of Singapore · Maritime and Port Authority"],
      ["✈️", `${(nat.changi_pax / 1e6).toFixed(1)}M air passengers, ${nat.changi_year}`, "Changi Airport · Civil Aviation Authority of Singapore"],
      ["⚡", `${POWER.n} power sites · ${POWER.gw.toFixed(1)} GW mapped`, "OpenStreetMap · Jurong Island to Senoko"],
    ];
    return chips.map((c, i) => `<div class="chip" data-i="${i}"><div class="ic">${c[0]}</div><div><b>${c[1]}</b><span>${c[2]}</span></div></div>`).join("");
  }
  function ccardHTML() {
    const c = QT, nw = NAT.wind, w = c.wind;
    const sh = (w.Services_InformationandCommunications1 + w.Services_ProfessionalServices) / w.Total;
    const ns = (nw.Services_InformationandCommunications1 + nw.Services_ProfessionalServices) / nw.Total;
    const figs = (k, col) => `<div class="figs">${[...Array(20)].map((_, i) => person(i < k ? col : "#3a4660")).join("")}</div>`;
    const ds = c.districts.filter((d) => d.kind === "jobs").sort((a, b) => b.lq - a.lq).slice(0, 2);
    const phys = c.districts.filter((d) => d.kind === "map").slice(0, 1);
    return `<div class="top"><div><h2>${c.name.toUpperCase()}</h2><div class="zh">${c.zh}</div><div class="reg">${c.region} · planning area · one-north, NUS, Pasir Panjang</div></div><div class="badge">${t("title_" + c.title).toUpperCase()}</div></div>
      <div class="nums"><div><b>${fmt(c.pop)}</b><span>people</span></div><div><b>S$${fmt(c.gdp * 1e6)}</b><span>GDP (est.)</span></div><div><b>S$${fmt(c.x.incMed)}</b><span>HH income / mo</span></div></div>
      <hr><div class="k">Jobs · workforce · 就业</div><div class="glow">Glowing: coders, engineers &amp; consultants</div>
      <div class="row"><span>${c.name}</span><b>1 in ${Math.round(1 / sh)} jobs</b></div>${figs(Math.round(sh * 20), "#63b2f2")}
      <div class="row"><span>Singapore</span><b>1 in ${Math.round(1 / ns)} jobs</b></div>${figs(Math.round(ns * 20), "#63b2f2")}
      <hr><div class="k">Districts · 区域专长</div>
      ${ds.map((d) => `<div class="dist"><div class="di">${DIST_ICON[d.d]}</div><div><b>${t("dist_" + d.d)}</b><span>×${d.lq.toFixed(1)} the national share of jobs · ${fmt(d.jobs)} jobs</span></div></div>`).join("")}
      ${phys.map((d) => `<div class="dist"><div class="di">${DIST_ICON[d.d]}</div><div><b>${t("dist_" + d.d)}</b><span>${t("distd_" + d.d)}</span></div></div>`).join("")}
      <div class="src">GHS 2025 (employed residents by planning area of workplace) · SingStat GDP 2025 · URA Master Plan 2025</div>`;
  }
  function titleHTML(end) {
    return `<div class="emb">★</div><h1>SINGAPORE</h1><div class="zh1">新加坡</div><div class="line"></div>
      <div class="tag">as a strategy game — built from real public data</div><div class="tagzh">用真实公开数据绘制的策略游戏地图</div>
      ${end ? `<div class="more">${Object.keys(S.D.sources).length + 3} public datasets · every number traceable · 每个数字都有出处</div><div class="url">bitvct.github.io/sgciv</div>` : ""}`;
  }
  let lastKey = {};
  const setHTML = (k, html) => { if (lastKey[k] !== html) { E[k].innerHTML = html; lastKey[k] = html; } };
  const show = (k, o, dy = 0) => { E[k].style.opacity = o; E[k].style.transform = dy ? `translateY(${dy}px)` : ""; E[k].style.display = o > 0.001 ? "" : "none"; };

  // ---------------------------------------------------------------- shots
  // Each shot: [t0, t1], state(u) -> {cam, lens, sel, banners, res, fx}, overlay(u, t)
  const camPath = (a, b, ez = ease) => (u) => {
    const k = ez(u);
    const ax = typeof a === "function" ? a() : a, bx = typeof b === "function" ? b() : b;
    return { x: ax.x + (bx.x - ax.x) * k, y: ax.y + (bx.y - ax.y) * k, z: Math.exp(Math.log(ax.z) + (Math.log(bx.z) - Math.log(ax.z)) * k) };
  };
  const at = (lon, lat, rpx) => () => { const [x, y] = P(lon, lat); return { x, y, z: zr(rpx) }; };
  const fitAt = (k, dx = 0, dy = 0) => () => ({ x: FIT.x + dx, y: FIT.y + dy, z: FIT.z * k });
  const leftOf = (id, rpx, shift) => () => { const c = cityById[id], z = zr(rpx); return { x: CX[c.seat] + shift / z, y: CY[c.seat] - 400, z }; };

  const SHOTS = [
    { id: "title", t0: 0, t1: 4.2, cam: camPath(fitAt(0.93, 1500, 300), fitAt(1.0, -800, 0), (u) => u), lens: "terrain", banners: 0, res: false, labels: false, wonders: false, dim: 0.5,
      overlay(u) { setHTML("title", titleHTML(false)); show("title", fadeIO(u, 0.22, 0.14), (1 - easeOut(u / 0.3)) * 18); show("vig", 1); } },
    { id: "terrain", t0: 4.2, t1: 7.9, cam: camPath(at(103.768, 1.392, 19), at(103.832, 1.362, 25), (u) => u), lens: "terrain", banners: 1, res: true,
      overlay(u) { setHTML("cap", capHTML("Terrain · 地形", "Every hex from real data", "", "Zoning, habitats and elevation paint the map", "分区、生境与高程绘制每一个六边形", "URA Master Plan 2025 · NParks Coastal Habitat Map 2018 · SRTM 30 m")); show("cap", fadeIO(u, 0.15, 0.12), (1 - easeOut(u / 0.2)) * 14); show("capwrap", fadeIO(u, 0.1, 0.1)); } },
    { id: "cities", t0: 7.9, t1: 11.7, cam: camPath(at(103.825, 1.318, 13), at(103.851, 1.286, 25)), lens: "terrain", banners: 1, res: false,
      overlay(u) {
        const fin = DT.wind.Services_FinancialandInsuranceServices / DT.wind.Total, nfin = NAT.wind.Services_FinancialandInsuranceServices / NAT.wind.Total;
        setHTML("cap", capHTML("Cities · 市镇", "Downtown Core", "市中心", `S$${fmt(DT.gdp * 1e6)} GDP (est.) · 1 in ${Math.round(1 / fin)} jobs in finance (SG: 1 in ${Math.round(1 / nfin)})`, "55 个规划区就是 55 座城市，GDP 按就业地点分摊", `SingStat GDP at current prices ${NAT.gdp_year} · General Household Survey 2025, by planning area of workplace`));
        show("cap", fadeIO(u, 0.15, 0.12), (1 - easeOut(u / 0.2)) * 14); show("capwrap", fadeIO(u, 0.1, 0.1));
      } },
    { id: "lenses", t0: 11.7, t1: 16.9, cam: camPath(fitAt(1.04, 0, 200), fitAt(1.1, 300, 200), (u) => u), lensSeq: ["income", "language", "population"], banners: 0, res: false, labels: false, wonders: false,
      overlay(u) {
        const i = Math.min(2, Math.floor(u * 3));
        const lc = lcardHTML(this.lensSeq[i]);
        setHTML("lcard", lc.h); const ku = u * 3 - i; show("lcard", Math.min(clamp01(ku / 0.12), i === 2 ? clamp01((1 - u) / 0.04) : clamp01((1 - ku) / 0.08)));
        setHTML("cap", capHTML("Lenses · 视图", "14 lenses", "", "Colour the map by income, age, faith, home language…", "收入、年龄、宗教、家庭用语……一键换色", lc.src));
        show("cap", fadeIO(u, 0.08, 0.06)); show("capwrap", fadeIO(u, 0.06, 0.06));
      } },
    { id: "transit", t0: 16.9, t1: 21.1, cam: camPath(at(103.70, 1.352, 7.2), at(103.835, 1.338, 8.2), (u) => u), lens: "transit", banners: 0, res: false, trains: true,
      overlay(u) {
        setHTML("chips", chipsHTML());
        E.chips.querySelectorAll(".chip").forEach((c, i) => { const k = clamp01((u - 0.06 - i * 0.14) / 0.08); c.style.opacity = Math.min(k, clamp01((1 - u) / 0.06)); c.style.transform = `translateX(${(1 - easeOut(k)) * -24}px)`; });
        show("chips", 1);
      } },
    { id: "city", t0: 21.1, t1: 25.1, cam: camPath(leftOf("QT", 15, 250), leftOf("QT", 19, 250)), lens: "terrain", banners: 1, res: true, sel: "QT", cityGlow: true,
      overlay(u) { setHTML("ccard", ccardHTML()); show("ccard", fadeIO(u, 0.1, 0.08), (1 - easeOut(u / 0.15)) * 16); } },
    { id: "wonders", t0: 25.1, t1: 28.0, cam: camPath(fitAt(1.55, -600, 1300), fitAt(1.75, 300, 1500), (u) => u), lens: "terrain", banners: 0, res: false, wonderGlow: true,
      overlay(u) {
        setHTML("cap", capHTML("Wonders · 奇观", "10 wonders, by published rules", "", "UNESCO Botanic Gardens · hawker culture · QS top-20 universities", "按公开规则评选：世界遗产、非遗小贩文化、QS 前 20 大学、樟宜机场", "UNESCO lists · QS World University Rankings 2026 · CAAS · MPA · STB · NEA"));
        show("cap", fadeIO(u, 0.15, 0.12), (1 - easeOut(u / 0.2)) * 14); show("capwrap", fadeIO(u, 0.1, 0.1));
      } },
    { id: "end", t0: 28.0, t1: 31.0, cam: camPath(fitAt(1.0, 600, 0), fitAt(0.95, -400, 0), (u) => u), lens: "terrain", banners: 0, res: false, labels: false, wonders: false, dim: 0.55,
      overlay(u) { setHTML("title", titleHTML(true)); show("title", clamp01(u / 0.2), (1 - easeOut(u / 0.3)) * 18); show("vig", 1); } },
  ];
  const DUR = SHOTS[SHOTS.length - 1].t1;
  const XF = 0.5; // cross-dissolve seconds

  // ---------------------------------------------------------------- per-frame render
  let FX = {};
  function applyShot(s, t) {
    const u = (t - s.t0) / (s.t1 - s.t0);
    S.cam = s.cam(u);
    let lens = s.lens;
    if (s.lensSeq) lens = s.lensSeq[Math.min(s.lensSeq.length - 1, Math.max(0, Math.floor(clamp01(u) * s.lensSeq.length)))];
    setLensFast(lens);
    S.sel = s.sel ? cityById[s.sel] : null;
    S.showRes = s.res; S.showLabels = s.labels !== false; S.noWonders = s.wonders === false;
    FX = { trains: s.trains, cityGlow: s.cityGlow, wonderGlow: s.wonderGlow, dim: s.dim, t, sel: S.sel };
    return u;
  }
  const snap = document.createElement("canvas"), sctx = snap.getContext("2d");
  function grab() { snap.width = cv.width; snap.height = cv.height; sctx.drawImage(cv, 0, 0); }
  function blendSnap(alpha) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(snap, 0, 0); ctx.restore(); }

  function renderShot(s, t) {
    const u = applyShot(s, t);
    // lens cross-fade inside the lenses shot
    if (s.lensSeq) {
      const n = s.lensSeq.length, f = clamp01(u) * n, i = Math.floor(f), w = 0.12;
      if (i > 0 && i < n && f - i < w) {
        setLensFast(s.lensSeq[i - 1]); render(); grab();
        setLensFast(s.lensSeq[i]); render(); blendSnap(1 - (f - i) / w);
        return u;
      }
    }
    render();
    return u;
  }

  window.TRAILER = {
    duration: DUR, fps: 30,
    frame(t) {
      for (const k of ["title", "cap", "capwrap", "lcard", "chips", "ccard", "vig"]) show(k, 0);
      const i = SHOTS.findIndex((s) => t >= s.t0 && t < s.t1), si = i < 0 ? SHOTS.length - 1 : i, s = SHOTS[si];
      const prev = SHOTS[si - 1];
      const k = prev ? clamp01((t - s.t0) / XF) : 1;
      if (prev && k < 1) { renderShot(prev, t); grab(); }
      const u = renderShot(s, t);
      if (prev && k < 1) blendSnap(1 - ease(k));
      // banners follow the current shot (fade in with the dissolve)
      $("#banners").style.opacity = s.banners ? ease(k) * fadeIO(u, 0.0001, 0.08) : 0;
      $("#banners").style.display = s.banners ? "" : "none";
      s.overlay.call(s, clamp01(u), t);
      // fade from / to black
      E.black.style.opacity = Math.max(clamp01(1 - t / 0.7), clamp01((t - (DUR - 0.7)) / 0.7));
    },
  };

  // overlays drawn on the map canvas after each render
  window.afterRender = (c, rpx) => {
    if (!FX.t && FX.t !== 0) return;
    const t = FX.t;
    c.save();
    if (FX.cityGlow && FX.sel) {
      c.globalCompositeOperation = "lighter";
      c.fillStyle = `rgba(255,205,110,${0.08 + 0.05 * Math.sin(t * 4)})`;
      c.beginPath(); for (const h of FX.sel.hexes) { const [sx, sy] = w2s(CX[h], CY[h]); hexPath(sx, sy, rpx); } c.fill();
    }
    if (FX.trains) {
      c.globalCompositeOperation = "lighter";
      const r = Math.max(4, rpx * 0.55), spacing = 2400, speed = 1300;
      for (const ln of S.D.lines) {
        if (ln.status !== "open") continue;
        const col = hex2rgb(ln.color);
        for (const sg of ln._segs) {
          if (sg.len < 300) continue;
          const off = (hash(Math.round(sg.seg[0][0] + sg.seg[0][1])) % 1000);
          for (let d = (t * speed + off) % spacing; d < sg.len; d += spacing) {
            let k = 1; while (k < sg.cum.length - 1 && sg.cum[k] < d) k++;
            const a = sg.seg[k - 1], b = sg.seg[k], f = (d - sg.cum[k - 1]) / ((sg.cum[k] - sg.cum[k - 1]) || 1);
            const [x, y] = w2s(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
            const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
            g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.35, `rgba(${col[0]},${col[1]},${col[2]},0.8)`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
            c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, 7); c.fill();
          }
        }
      }
    }
    if (FX.wonderGlow) {
      c.globalCompositeOperation = "lighter";
      S.D.wonders.forEach((w, i) => {
        if (w.h == null) return;
        const [x, y] = w2s(CX[w.h], CY[w.h]), p = 0.5 + 0.5 * Math.sin(t * 3 + i);
        const rr = 22 + 10 * p, g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, "rgba(255,220,130,0.55)"); g.addColorStop(1, "rgba(255,200,90,0)");
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill();
      });
    }
    if (FX.dim) { c.globalCompositeOperation = "source-over"; c.fillStyle = `rgba(6,10,20,${FX.dim})`; c.fillRect(0, 0, S.W, S.H); }
    c.restore();
  };

  // ---------------------------------------------------------------- boot
  function ready() { return S.D && colorCache && document.fonts.status === "loaded"; }
  async function start() {
    while (!ready()) await new Promise((r) => setTimeout(r, 50));
    await document.fonts.ready;
    prep();
    // warm the lens colour caches so the first frames are not slow
    for (const l of ["terrain", "income", "language", "population", "transit"]) setLensFast(l);
    window.TRAILER.ready = true;
    if (REC) return;
    let t0 = performance.now();
    const loop = (now) => { let t = (now - t0) / 1000; if (t > DUR) { t0 = now; t = 0; } window.TRAILER.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    document.addEventListener("click", () => (t0 = performance.now()));
  }
  start();
})();
