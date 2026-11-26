/* sgciv — Singapore as a strategy game. Every tile, town and number comes from public data. */
"use strict";

// ------------------------------------------------------------------ state & i18n
const S = {
  D: null, lang: "en", lens: "terrain", showRes: true, showLabels: true,
  cam: { x: 0, y: 0, z: 0.02 }, W: 0, H: 0, dpr: 1,
  hover: -1, sel: null, tab: "citizens", almanac: "about",
};
const $ = (s) => document.querySelector(s);
const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
const zh = () => S.lang === "zh";
const nm = (o) => (zh() && o.zh ? o.zh : o.name || o.n);

function fmt(n, d = 1) {
  if (n == null || isNaN(n)) return "–";
  const a = Math.abs(n);
  if (zh()) {
    if (a >= 1e8) return (n / 1e8).toFixed(d).replace(/\.0$/, "") + "亿";
    if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e6 ? 0 : d).replace(/\.0$/, "") + "万";
    return Math.round(n).toLocaleString("zh-CN");
  }
  if (a >= 1e12) return (n / 1e12).toFixed(d).replace(/\.0$/, "") + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(d).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(d).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(0) + "K";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString("en");
}
const money = (sgd, d = 1) => "S$" + fmt(sgd, d);
const pct = (x, d = 0) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d) + "%");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------------ colours
function hex2rgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
const rgbs = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c, k) => (k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
function ramp(stops) {
  const cs = stops.map(hex2rgb);
  return (x) => {
    x = Math.max(0, Math.min(1, x)) * (cs.length - 1);
    const i = Math.min(cs.length - 2, Math.floor(x));
    return mix(cs[i], cs[i + 1], x - i);
  };
}
const RAMP_SEQ = ramp(["#1f2d4d", "#24577f", "#2a8a8c", "#69b85a", "#e3d35a", "#f6a13c"]);
const RAMP_HEAT = ramp(["#1a1733", "#45206a", "#8b2d74", "#cd4c55", "#f28c3a", "#fbd65b"]);
const RAMP_ELEV = ramp(["#3f7b4a", "#8aa957", "#d2c272", "#b8875a", "#8c6a55", "#e9e4dc"]);
const CSS_RAMP = (stops) => `linear-gradient(90deg, ${stops.join(",")})`;

const TERRAIN_COL = {
  ocean: "#1c4a74", coast: "#3a7fa6", reservoir: "#4a9bc2", urban: "#bcae92", industrial: "#8f8a7c", rainforest: "#2f6a38",
  parkland: "#86ad55", mangrove: "#4e7a55", farmland: "#c9b45c", reclaimed: "#ddcc9c", foreign: "#5d6a5c",
};
const LU_COL = {
  res: "#e8b45a", com: "#e0525b", bpk: "#c45bd4", ind: "#8a7f9c", port: "#5d6e8f", mil: "#6b7a52", open: "#9cc77a", park: "#4fa35c",
  beach: "#f2e2a8", reserve: "#d8cfb8", agri: "#c3b04e", water: "#4a9bc2", edu: "#5fa8e8", civic: "#61c2b8", road: "#9a9aa0",
};
const REGION_COL = { "Central Region": "#f2c14e", "East Region": "#ef8a62", "North Region": "#7fc8a9", "North-East Region": "#a596f2", "West Region": "#67a9e0" };
const GROUP_COLS = ["#f2c14e", "#57b26b", "#e2685b", "#5aa7e6", "#b985ef", "#ef9e4c", "#6fd3c4", "#d9d2bf", "#8a96ad"];

// ------------------------------------------------------------------ data definitions
const ETH = ["Chinese", "Malays", "Indians", "Others"];
const REL = ["NoReligion", "Buddhism", "Taoism1", "Islam", "Hinduism", "Sikhism", "Christianity_Catholic", "Christianity_OtherChristians", "OtherReligions"];
const LANG = [["English_Total", "la_English"], ["Mandarin_Total1", "la_Mandarin"], ["ChineseDialects_Total1", "la_ChineseDialects"], ["Malay_Total1", "la_Malay"], ["IndianLanguages_Total", "la_Tamil"], ["OtherLanguages_Total1", "la_Others"]];
const OCC = ["Legislators_SeniorOfficialsandManagers", "Professionals", "AssociateProfessionalsandTechnicians", "ClericalSupportWorkers", "ServiceandSalesWorkers", "CraftsmenandRelatedTradesWorkers", "PlantandMachineOperatorsandAssemblers", "Cleaners_LabourersandRelatedWorkers", "Others1"];
const QUAL = ["BelowSecondary", "Secondary", "Post_Secondary_Non_Tertiary", "PolytechnicDiploma", "ProfessionalQualificationandOtherDiploma", "University"];
const DWELL = ["hdb12", "hdb3", "hdb4", "hdb5", "condo", "landed", "other"];
const IND = ["Manufacturing", "Construction", "Services_WholesaleandRetailTrade", "Services_TransportationandStorage", "Services_AccommodationandFoodServices",
  "Services_InformationandCommunications1", "Services_FinancialandInsuranceServices", "Services_RealEstateServices", "Services_ProfessionalServices",
  "Services_AdministrativeandSupportServices", "Services_PublicAdministrationandEducation", "Services_HealthandSocialServices",
  "Services_Arts_SportsandRecreation", "Services_OtherCommunity_SocialandPersonalServices", "Others2"];
const IND_DISTRICT = {
  Services_FinancialandInsuranceServices: "commercial", Services_InformationandCommunications1: "campus", Services_ProfessionalServices: "campus",
  Manufacturing: "industrial", Services_TransportationandStorage: "logistics", Services_AccommodationandFoodServices: "entertainment",
  Services_Arts_SportsandRecreation: "theater", Services_PublicAdministrationandEducation: "government", Services_HealthandSocialServices: "hospital",
  Services_WholesaleandRetailTrade: "market", Construction: "builders",
};
const DIST_ICON = {
  commercial: "💰", campus: "🔬", industrial: "🏭", harbor: "⚓", aerodrome: "✈️", logistics: "📦", entertainment: "🍽️", theater: "🎭",
  government: "🏛️", hospital: "⚕️", market: "⚖️", builders: "🏗️", encampment: "🛡️", preserve: "🌳", reservoir: "💧", neighborhood: "🏘️", farm: "🌾", capital: "★",
};
// Airfields (published locations) -> Aerodrome district for the planning area that holds them
const AIRFIELDS = [[103.9893, 1.3592, "Changi Airport"], [103.8679, 1.4170, "Seletar Airport"], [103.9100, 1.3604, "Paya Lebar Air Base"],
  [103.7090, 1.3870, "Tengah Air Base"], [103.8210, 1.4250, "Sembawang Air Base"]];
const SITE_ICON = {
  monument: "🏛️", historic: "📜", hawker: "🍜", hotel: "🏨", attraction: "⭐", library: "📚", cc: "🏠", power: "⚡", worship: "🛐", university: "🎓", peak: "⛰️",
};
const WONDER_ICON = { garden: "🌺", hawker: "🍜", airport: "✈️", port: "⚓", university: "🎓", hotel: "🏨", peak: "⛰️", forest: "🌳", wetland: "🦩" };
const REL_ICON = { christian: "✝", muslim: "☪", buddhist: "☸", taoist: "☯", hindu: "ॐ", sikh: "☬", jewish: "✡", chinese_folk: "☯" };
const COMMUTE = [
  ["c_rail", ["Rail_MRT_LRT_Only"]], ["c_railbus", ["Rail_MRT_LRT_andPublicBusOnly", "CombinationofRail_MRT_LRT_and_orPublicBus_withOtherModes"]],
  ["c_bus", ["PublicBusOnly"]], ["c_car", ["CarOnly"]], ["c_taxi", ["Taxi_PrivateHireCarOnly"]],
  ["c_other", ["PrivateCharteredBus_VanOnly", "Lorry_PickupOnly", "Motorcycle_ScooterOnly", "Others"]], ["c_none", ["NoTransportRequired"]],
];

const LENSES = [
  { id: "terrain", g: "g_base", ic: "⛰" }, { id: "landuse", g: "g_base", ic: "🗺" }, { id: "elevation", g: "g_base", ic: "📈" },
  { id: "population", g: "g_people", ic: "👥" }, { id: "age", g: "g_people", ic: "⏳" }, { id: "ethnicity", g: "g_people", ic: "🧑‍🤝‍🧑" },
  { id: "income", g: "g_prosperity", ic: "$" }, { id: "jobs", g: "g_prosperity", ic: "💼" }, { id: "degrees", g: "g_prosperity", ic: "🎓" },
  { id: "housing", g: "g_daily", ic: "🏢" }, { id: "commute", g: "g_daily", ic: "🚆" }, { id: "transit", g: "g_daily", ic: "🚇" },
  { id: "faith", g: "g_faith", ic: "🛐" }, { id: "language", g: "g_faith", ic: "💬" },
];

// ------------------------------------------------------------------ geometry
let M, H, N, CX, CY, R;
const SQ3 = Math.sqrt(3);
const CORNERS = [...Array(6)].map((_, k) => { const a = Math.PI / 180 * (60 * k - 30); return [Math.cos(a), Math.sin(a)]; });
function nbrs(i) {
  const c = i % M.cols, r = (i / M.cols) | 0, out = [];
  const d = r & 1 ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  for (const [dc, dr] of d) { const cc = c + dc, rr = r + dr; if (cc >= 0 && cc < M.cols && rr >= 0 && rr < M.rows) out.push(rr * M.cols + cc); }
  return out;
}
function hexAt(x, y) {
  const q = (SQ3 / 3 * (x - M.x0) - 1 / 3 * (y - M.y0)) / R, rr = (2 / 3 * (y - M.y0)) / R;
  let cx = q, cz = rr, cy = -cx - cz, rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const col = rx + ((rz - (rz & 1)) >> 1);
  if (col < 0 || col >= M.cols || rz < 0 || rz >= M.rows) return -1;
  return rz * M.cols + col;
}
const lonlat2xy = (lon, lat) => [(lon - M.lon0) * M.kx, -(lat - M.lat0) * M.ky];
const isWater = (i) => H.t[i] <= 1 || H.t[i] === T.reservoir;
let T = {};

// ------------------------------------------------------------------ derived data
const cityById = {}, cityByPa = [];
let hexCity, sitesByHex, stationHexes, catchment, borders, coastSegs, regionSegs, NAT;

function medianFromBins(obj, keys, parse) {
  let tot = 0; const bins = keys.map((k) => { const v = obj[k] || 0; tot += v; return [parse(k), v]; });
  if (tot <= 0) return null;
  let acc = 0;
  for (const [[lo, hi], v] of bins) { if (acc + v >= tot / 2) return lo + (hi - lo) * ((tot / 2 - acc) / (v || 1)); acc += v; }
  return null;
}
const parseAge = (k) => { const m = k.match(/(\d+)_(\d+)/); return m ? [+m[1], +m[2] + 1] : [90, 100]; };
const parseInc = (k) => {
  if (k.startsWith("Below")) return [0, 1000];
  if (k.includes("andOver")) { const lo = +k.split("andOver")[0].replace(/_/g, ""); return [lo, lo * 1.3]; }
  const p = k.split("_"); const lo = +(p[0] + p[1]), hi = +(p[2] + p[3]) + 1; return [lo, hi];
};

function derive(c) {
  // c may be a city or the national object (same shape)
  const o = {};
  const age = c.age || Object.fromEntries(Object.entries(c.pop || {}).filter(([k]) => k.startsWith("Total_") && k !== "Total_Total").map(([k, v]) => [k.replace("Total_", ""), v]));
  o.ageMed = medianFromBins(age, Object.keys(age), parseAge);
  const ab = { a_child: 0, a_young: 0, a_mid: 0, a_old: 0 };
  for (const [k, v] of Object.entries(age)) { const lo = parseAge(k)[0]; ab[lo < 15 ? "a_child" : lo < 35 ? "a_young" : lo < 65 ? "a_mid" : "a_old"] += v; }
  o.ageBands = ab;
  if (c.hhinc) {
    const ks = Object.keys(c.hhinc).filter((k) => k !== "Total" && k !== "NoEmployedPerson");
    o.incMed = medianFromBins(c.hhinc, ks, parseInc);
  }
  if (c.qual && c.qual.Total) o.degree = c.qual.University / c.qual.Total;
  if (c.dwell) { const tot = DWELL.reduce((s, k) => s + (c.dwell[k] || 0), 0); o.hdb = tot ? (c.dwell.hdb12 + c.dwell.hdb3 + c.dwell.hdb4 + c.dwell.hdb5) / tot : null; o.dwellTot = tot; }
  if (c.tr && c.tr.Total) {
    const rail = (c.tr.Rail_MRT_LRT_Only || 0) + (c.tr.Rail_MRT_LRT_andPublicBusOnly || 0) + (c.tr.CombinationofRail_MRT_LRT_and_orPublicBus_withOtherModes || 0);
    o.rail = rail / (c.tr.Total - (c.tr.NoTransportRequired || 0));
  }
  if (c.lab && c.lab.LabourForce_Total_Total) o.unemp = c.lab.LabourForce_Unemployed_Total / c.lab.LabourForce_Total_Total;
  return o;
}

function lqTop(cityObj, natObj, keys, minShare = 0.02) {
  if (!cityObj) return null;
  const ct = keys.reduce((s, k) => s + (cityObj[k] || 0), 0), nt = keys.reduce((s, k) => s + (natObj[k] || 0), 0);
  if (!ct) return null;
  let best = null;
  for (const k of keys) {
    const cs = (cityObj[k] || 0) / ct, ns = (natObj[k] || 0) / nt;
    if (cs < minShare || !ns) continue;
    const lq = cs / ns;
    if (!best || lq > best.lq) best = { k, lq, share: cs };
  }
  return best;
}

function prepare() {
  const D = S.D;
  M = D.meta; H = D.hexes; R = M.R; N = M.cols * M.rows;
  M.terrains.forEach((k, i) => (T[k] = i));
  CX = new Float32Array(N); CY = new Float32Array(N);
  for (let i = 0; i < N; i++) { const c = i % M.cols, r = (i / M.cols) | 0; CX[i] = M.x0 + SQ3 * R * (c + 0.5 * (r & 1)); CY[i] = M.y0 + 1.5 * R * r; }
  // national
  const n = D.national;
  NAT = { ...n, eth: Object.fromEntries(ETH.map((k) => [k, n.eth[k + "_Total"]])), dwell: {
    hdb12: n.dwell.HDBDwellings_HDB1_and2_RoomFlats1, hdb3: n.dwell.HDBDwellings_HDB3_RoomFlats, hdb4: n.dwell.HDBDwellings_HDB4_RoomFlats,
    hdb5: n.dwell.HDBDwellings_HDB5_RoomandExecutiveFlats, condo: n.dwell.CondominiumandOtherApartments, landed: n.dwell.LandedProperties, other: n.dwell.Others } };
  NAT.popTotal = n.pop.Total_Total;
  NAT.x = derive(NAT);
  // cities
  hexCity = new Int16Array(N).fill(-1);
  D.cities.forEach((c, ci) => {
    cityById[c.id] = c; c.ci = ci;
    const pi = D.pas.findIndex((p) => p.code === c.id); cityByPa[pi] = c;
    c.x = derive(c);
    for (const h of c.hexes) hexCity[h] = ci;
  });
  for (let i = 0; i < N; i++) if (hexCity[i] < 0 && H.pa[i] >= 0 && cityByPa[H.pa[i]]) hexCity[i] = cityByPa[H.pa[i]].ci;
  // sites by hex
  sitesByHex = new Map();
  for (const s of D.sites) { if (!sitesByHex.has(s.h)) sitesByHex.set(s.h, []); sitesByHex.get(s.h).push(s); }
  // stations & catchment (~800 m)
  stationHexes = new Map();
  catchment = new Uint8Array(N);
  for (const st of D.stations) {
    const h = hexAt(st.x, st.y); st.h = h;
    if (h >= 0) { if (!stationHexes.has(h)) stationHexes.set(h, []); stationHexes.get(h).push(st); }
    const r0 = 800;
    for (let i = 0; i < N; i++) { const dx = CX[i] - st.x, dy = CY[i] - st.y; if (dx * dx + dy * dy < r0 * r0) catchment[i] = 1; }
  }
  // borders: planning-area, region and coastline edges
  borders = []; regionSegs = []; coastSegs = [];
  const region = (i) => (H.pa[i] >= 0 ? D.pas[H.pa[i]].region : null);
  for (let i = 0; i < N; i++) {
    const land = !isWater(i) && H.t[i] !== T.foreign;
    const nb = nbrs(i);
    for (const j of nb) {
      if (j < i) continue;
      const landJ = !isWater(j) && H.t[j] !== T.foreign;
      const seg = edgeBetween(i, j);
      if (!seg) continue;
      if (land && landJ && H.pa[i] !== H.pa[j] && H.pa[i] >= 0 && H.pa[j] >= 0) (region(i) !== region(j) ? regionSegs : borders).push(seg);
      else if (land !== landJ && H.t[i] !== T.foreign && H.t[j] !== T.foreign) coastSegs.push(seg);
    }
  }
  // districts, yields, titles, ranks
  for (const c of D.cities) computeCity(c);
  rankCities();
}
function edgeBetween(i, j) {
  const mx = (CX[i] + CX[j]) / 2, my = (CY[i] + CY[j]) / 2, dx = CX[j] - CX[i], dy = CY[j] - CY[i], L = Math.hypot(dx, dy);
  const px = -dy / L, py = dx / L, h = R / 2;
  return [mx + px * h, my + py * h, mx - px * h, my - py * h];
}

function computeCity(c) {
  const nat = NAT.wind;
  c.districts = [];
  if (c.wind && c.wind.Total) {
    const seen = {};
    for (const [col, d] of Object.entries(IND_DISTRICT)) {
      const jobs = c.wind[col] || 0, lq = (jobs / c.wind.Total) / ((nat[col] || 1) / nat.Total);
      if (lq >= 1.5 && jobs >= 1000) {
        if (seen[d]) { seen[d].jobs += jobs; seen[d].lq = Math.max(seen[d].lq, lq); seen[d].cols.push(col); continue; }
        seen[d] = { d, lq, jobs, cols: [col], kind: "jobs" };
        c.districts.push(seen[d]);
      }
    }
  }
  // physical districts from the map
  const lu = {}; let nat_ = 0, res_ = 0, mil = 0, agri = 0;
  for (const h of c.hexes) {
    const L = H.lu[h]; if (L) M.lu_keys.forEach((k, ki) => (lu[k] = (lu[k] || 0) + L[ki]));
    if (H.flags[h] & 3) nat_++;
    if (H.t[h] === T.reservoir) res_++;
  }
  mil = lu.mil || 0; agri = lu.agri || 0;
  const phys = (d, extra) => c.districts.push({ d, kind: "map", ...extra });
  const air = AIRFIELDS.filter(([lon, lat]) => { const [x, y] = lonlat2xy(lon, lat), h = hexAt(x, y); return h >= 0 && hexCity[h] === c.ci; });
  if (air.length) phys("aerodrome", { what: air.map((a) => a[2]).join(", ") });
  const portHexes = c.hexes.filter((h) => H.lu[h] && H.lu[h][M.lu_keys.indexOf("port")] >= 8 && nbrs(h).some((j) => H.t[j] <= 1));
  if (portHexes.length >= 3 && !air.length) phys("harbor", { hexes: portHexes.length });
  if (mil >= 40) phys("encampment", { samples: mil });
  if (nat_ >= 6) phys("preserve", { hexes: nat_ });
  if (res_ >= 4) phys("reservoir", { hexes: res_ });
  if (agri >= 30) phys("farm", { samples: agri });
  if (c.x.hdb != null && c.x.hdb >= 0.7 && c.pop >= 50000) phys("neighborhood", { share: c.x.hdb });
  // title
  const byLq = c.districts.filter((d) => d.kind === "jobs").sort((a, b) => b.lq - a.lq);
  const physOrder = ["aerodrome", "harbor", "neighborhood", "preserve", "reservoir", "encampment", "farm"];
  const has = (d) => c.districts.some((x) => x.d === d);
  if (c.id === "DT") c.title = "capital";
  else if (byLq.length && byLq[0].d !== "logistics") c.title = byLq[0].d;
  else if (has("aerodrome")) c.title = "aerodrome";
  else if (has("harbor")) c.title = "harbor";
  else if (byLq.length) c.title = byLq[0].d;
  else c.title = physOrder.find((p) => c.districts.some((d) => d.d === p)) || null;
  c.icon = c.title ? DIST_ICON[c.title] : null;
  // yields (where the work is done)
  const w = c.wind || {};
  c.y = {
    food: w.Services_AccommodationandFoodServices || 0,
    prod: (w.Manufacturing || 0) + (w.Construction || 0),
    gold: (c.gdp || 0) * 1e6,
    sci: (w.Services_InformationandCommunications1 || 0) + (w.Services_ProfessionalServices || 0),
    cult: w.Services_Arts_SportsandRecreation || 0,
  };
}
function rankCities() {
  const cs = S.D.cities;
  const rk = (key, f) => { const arr = cs.filter((c) => f(c) > 0).sort((a, b) => f(b) - f(a)); arr.forEach((c, i) => ((c.rank = c.rank || {}), (c.rank[key] = i + 1))); return arr.length; };
  S.rankN = {
    pop: rk("pop", (c) => c.pop), gdp: rk("gdp", (c) => c.gdp), jobs: rk("jobs", (c) => c.jobs),
    growth: rk("growth", (c) => (c.pop20 > 5000 ? c.pop / c.pop20 : 0)),
    food: rk("food", (c) => c.y.food), prod: rk("prod", (c) => c.y.prod), gold: rk("gold", (c) => c.y.gold), sci: rk("sci", (c) => c.y.sci), cult: rk("cult", (c) => c.y.cult),
  };
}

// ------------------------------------------------------------------ lens colouring
const lensCache = {};
function cityLensValue(c, lens) {
  if (!c) return null;
  switch (lens) {
    case "income": return c.x.incMed;
    case "age": return c.pop >= 1000 ? c.x.ageMed : null;
    case "degrees": return c.x.degree;
    case "housing": return c.pop >= 1000 ? c.x.hdb : null;
    case "commute": return c.x.rail;
    case "ethnicity": return c.pop >= 1000 && c.eth ? lqTop(c.eth, NAT.eth, ETH) : null;
    case "faith": return c.rel ? lqTop(c.rel, NAT.rel, REL) : null;
    case "language": return c.lang ? lqTop(c.lang, NAT.lang, LANG.map((l) => l[0])) : null;
  }
  return null;
}
const LENS_RANGE = { income: [6000, 22000], age: [32, 48], degrees: [0.2, 0.65], housing: [0, 1], commute: [0.3, 0.65] };
const CAT_KEYS = { ethnicity: ETH, faith: REL, language: LANG.map((l) => l[0]) };
const CAT_LABEL = { ethnicity: (k) => t("e_" + k), faith: (k) => t("r_" + k), language: (k) => t(LANG.find((l) => l[0] === k)[1]) };
function catColor(lens, k) { return hex2rgb(GROUP_COLS[CAT_KEYS[lens].indexOf(k) % GROUP_COLS.length]); }

function hexColor(i) {
  const tt = H.t[i];
  const base = hex2rgb(TERRAIN_COL[M.terrains[tt]]);
  const noise = (Math.round(((hash(i) % 1000) / 1000 - 0.5) * 6) / 6) * 0.06;
  const L = S.lens;
  if (tt === T.foreign) return shade(base, -0.1 + noise);
  if (tt <= 1) {
    if (L === "terrain" || L === "elevation" || L === "transit") return shade(base, noise * 0.6);
    return shade(base, -0.25 + noise * 0.5);
  }
  if (L === "terrain") {
    let k = noise;
    const e = H.elev[i];
    if (e) { const nb = nbrs(i)[2]; const de = e - (H.elev[nb] || e); k += Math.max(-0.22, Math.min(0.22, de * 0.012)); }
    return shade(base, k);
  }
  if (tt === T.reservoir && L !== "landuse") return shade(base, -0.15);
  const muted = shade(mix(base, [60, 66, 80], 0.75), -0.35);
  if (L === "transit") return catchment[i] ? shade(base, 0.05 + noise) : shade(mix(base, [40, 48, 64], 0.6), -0.3);
  if (L === "population") { const p = H.pop[i]; return p > 0 ? RAMP_HEAT(Math.log10(p) / Math.log10(4500)) : muted; }
  if (L === "jobs") { const p = H.jobs[i]; return p > 0 ? RAMP_HEAT(Math.log10(p) / Math.log10(9000)) : muted; }
  if (L === "elevation") return RAMP_ELEV(Math.min(1, (H.elev[i] || 0) / 120));
  if (L === "landuse") {
    const lu = H.lu[i]; if (!lu) return muted;
    let bi = -1, bv = 0; lu.forEach((v, k) => { if (v > bv) { bv = v; bi = k; } });
    return bi < 0 ? muted : shade(hex2rgb(LU_COL[M.lu_keys[bi]]), noise);
  }
  const c = S.D.cities[hexCity[i]];
  const v = cityLensValue(c, L);
  if (v == null) return mix(muted, [90, 90, 90], 0.2);
  if (CAT_KEYS[L]) { const col = catColor(L, v.k); const k = Math.min(1, (v.lq - 1) / 1.5); return mix([70, 74, 88], col, 0.35 + 0.65 * Math.max(0, k)); }
  const [a, b] = LENS_RANGE[L];
  return shade(RAMP_SEQ((v - a) / (b - a)), noise);
}
function hash(i) { let x = (i + 1) * 2654435761; x ^= x >>> 13; x = Math.imul(x, 1274126177); x ^= x >>> 16; return x >>> 0; }
let colorCache = null;
const q8 = (c) => [Math.round(c[0] / 3) * 3, Math.round(c[1] / 3) * 3, Math.round(c[2] / 3) * 3];
function buildColors() { colorCache = new Array(N); for (let i = 0; i < N; i++) colorCache[i] = rgbs(q8(hexColor(i))); }

// ------------------------------------------------------------------ rendering
const cv = $("#map"), ctx = cv.getContext("2d");
let raf = 0;
const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };
const w2s = (x, y) => [(x - S.cam.x) * S.cam.z + S.W / 2, (y - S.cam.y) * S.cam.z + S.H / 2];
const s2w = (sx, sy) => [(sx - S.W / 2) / S.cam.z + S.cam.x, (sy - S.H / 2) / S.cam.z + S.cam.y];

function resize() {
  S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = innerWidth; S.H = innerHeight;
  cv.width = S.W * S.dpr; cv.height = S.H * S.dpr; redraw();
}

function render() {
  raf = 0;
  const { W: Wd, H: Hd, cam } = S;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.fillStyle = "#1c4a74"; ctx.fillRect(0, 0, Wd, Hd);
  const rpx = R * cam.z;
  const [wx0, wy0] = s2w(-rpx * 2, -rpx * 2), [wx1, wy1] = s2w(Wd + rpx * 2, Hd + rpx * 2);
  const r0 = Math.max(0, Math.floor((wy0 - M.y0) / (1.5 * R)) - 1), r1 = Math.min(M.rows - 1, Math.ceil((wy1 - M.y0) / (1.5 * R)) + 1);
  const c0 = Math.max(0, Math.floor((wx0 - M.x0) / (SQ3 * R)) - 1), c1 = Math.min(M.cols - 1, Math.ceil((wx1 - M.x0) / (SQ3 * R)) + 1);
  const vis = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) vis.push(r * M.cols + c);
  const sel = S.sel;
  // hex fills, batched by colour (one path per colour)
  const rr = rpx + 0.6;
  const groups = new Map();
  for (const i of vis) { const c = colorCache[i]; let g = groups.get(c); if (!g) groups.set(c, (g = [])); g.push(i); }
  const ox = S.W / 2 - cam.x * cam.z, oy = S.H / 2 - cam.y * cam.z;
  const cx6 = CORNERS.map((c) => c[0] * rr), cy6 = CORNERS.map((c) => c[1] * rr);
  for (const [col, arr] of groups) {
    ctx.beginPath();
    for (const i of arr) {
      const sx = CX[i] * cam.z + ox, sy = CY[i] * cam.z + oy;
      ctx.moveTo(sx + cx6[0], sy + cy6[0]);
      for (let k = 1; k < 6; k++) ctx.lineTo(sx + cx6[k], sy + cy6[k]);
    }
    ctx.fillStyle = col; ctx.fill();
  }
  // grid lines when zoomed
  if (rpx > 9) {
    ctx.strokeStyle = "rgba(0,0,0,0.13)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const i of vis) {
      if (H.t[i] === T.ocean) continue;
      const [sx, sy] = w2s(CX[i], CY[i]);
      for (let k = 0; k < 6; k++) { const px = sx + CORNERS[k][0] * rpx, py = sy + CORNERS[k][1] * rpx; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath();
    }
    ctx.stroke();
  }
  // terrain glyphs
  if (S.lens === "terrain" && rpx > 7 && vis.length < 9000) for (const i of vis) glyph(i, rpx);
  // fog over neighbours
  // coastline, borders
  drawSegs(coastSegs, "rgba(240,232,205,0.55)", Math.max(1, rpx * 0.12));
  drawSegs(borders, "rgba(20,16,10,0.55)", Math.max(0.8, rpx * 0.07), rpx > 6 ? [rpx * 0.35, rpx * 0.25] : null);
  drawSegs(regionSegs, "rgba(250,236,200,0.75)", Math.max(1.3, rpx * 0.13));
  // selection highlight
  if (sel) {
    ctx.fillStyle = "rgba(5,10,20,0.35)";
    ctx.beginPath();
    for (const i of vis) { if (hexCity[i] === sel.ci) continue; if (H.t[i] <= 1) continue; const [sx, sy] = w2s(CX[i], CY[i]); hexPath(sx, sy, rr); }
    ctx.fill();
    ctx.strokeStyle = "#f0d58e"; ctx.lineWidth = Math.max(2, rpx * 0.16);
    ctx.beginPath();
    for (const h of sel.hexes) for (const j of nbrs(h)) if (hexCity[j] !== sel.ci) { const s = edgeBetween(h, j); const a = w2s(s[0], s[1]), b = w2s(s[2], s[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
  // rail
  drawRail(rpx);
  // hover
  if (S.hover >= 0) {
    const [sx, sy] = w2s(CX[S.hover], CY[S.hover]);
    ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 2; ctx.beginPath(); hexPath(sx, sy, rpx); ctx.stroke();
  }
  // labels & icons
  if (S.showLabels) drawLabels(rpx);
  if (S.showRes) drawSites(rpx, vis);
  drawWonders(rpx);
  placeBanners(rpx);
  drawMinimapView();
}
function hexPath(sx, sy, r) { for (let k = 0; k < 6; k++) { const px = sx + CORNERS[k][0] * r, py = sy + CORNERS[k][1] * r; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
function drawSegs(segs, col, w, dash) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath();
  const pad = 50;
  for (const s of segs) {
    const a = w2s(s[0], s[1]); if (a[0] < -pad || a[0] > S.W + pad || a[1] < -pad || a[1] > S.H + pad) continue;
    const b = w2s(s[2], s[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke(); ctx.setLineDash([]);
}

function glyph(i, rpx) {
  const tt = M.terrains[H.t[i]];
  const [sx, sy] = w2s(CX[i], CY[i]);
  const h = hash(i), s = rpx;
  const rnd = (k) => ((hash(h + k * 7919) % 1000) / 1000 - 0.5);
  ctx.save();
  if (tt === "urban") {
    const lu = H.lu[i] || [], com = (lu[1] || 0) + (lu[2] || 0), res = lu[0] || 0;
    const n = 2 + Math.min(3, Math.round((com + res) / 6));
    for (let k = 0; k < n; k++) {
      const bx = sx + rnd(k) * s * 1.1, by = sy + rnd(k + 9) * s * 0.9 + s * 0.15;
      const bw = s * (0.16 + 0.06 * Math.abs(rnd(k + 3))), bh = s * (com > res ? 0.45 + Math.abs(rnd(k + 5)) * 0.5 : 0.22 + Math.abs(rnd(k + 5)) * 0.3);
      ctx.fillStyle = com > res ? "#d9dde3" : "#ece2cc"; ctx.fillRect(bx - bw / 2, by - bh, bw, bh);
      ctx.fillStyle = com > res ? "#7f8ea3" : "#a8957a"; ctx.fillRect(bx + bw / 2 - bw * 0.35, by - bh, bw * 0.35, bh);
      ctx.fillStyle = com > res ? "#99c3e8" : "#c06a4e"; ctx.fillRect(bx - bw / 2, by - bh - s * 0.04, bw, s * 0.05);
    }
  } else if (tt === "industrial") {
    ctx.fillStyle = "#b9b4a6"; ctx.strokeStyle = "#5c584e"; ctx.lineWidth = 1;
    const bx = sx - s * 0.4, by = sy + s * 0.25, bw = s * 0.8;
    ctx.beginPath(); ctx.moveTo(bx, by);
    for (let k = 0; k < 3; k++) { ctx.lineTo(bx + bw * (k / 3), by - s * 0.32); ctx.lineTo(bx + bw * ((k + 1) / 3), by - s * 0.18); }
    ctx.lineTo(bx + bw, by); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6f6a60"; ctx.fillRect(sx + s * 0.22, sy - s * 0.55, s * 0.09, s * 0.4);
  } else if (tt === "rainforest" || tt === "mangrove") {
    const n = tt === "rainforest" ? 5 : 4;
    for (let k = 0; k < n; k++) {
      const x = sx + rnd(k) * s * 1.2, y = sy + rnd(k + 11) * s * 1.0;
      ctx.fillStyle = tt === "rainforest" ? (k % 2 ? "#1f4f29" : "#28603a") : "#3b6448";
      ctx.beginPath(); ctx.arc(x, y, s * (0.2 + Math.abs(rnd(k + 2)) * 0.1), 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(160,210,120,0.25)"; ctx.beginPath(); ctx.arc(x - s * 0.05, y - s * 0.06, s * 0.09, 0, 7); ctx.fill();
      if (tt === "mangrove") { ctx.strokeStyle = "#2c4b37"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - s * 0.1, y + s * 0.25); ctx.lineTo(x, y + s * 0.1); ctx.lineTo(x + s * 0.1, y + s * 0.25); ctx.stroke(); }
    }
  } else if (tt === "parkland") {
    ctx.strokeStyle = "#5e8a3a"; ctx.lineWidth = Math.max(1, s * 0.05);
    for (let k = 0; k < 4; k++) { const x = sx + rnd(k) * s * 1.2, y = sy + rnd(k + 4) * s; ctx.beginPath(); ctx.moveTo(x - s * 0.08, y); ctx.lineTo(x - s * 0.02, y - s * 0.14); ctx.moveTo(x + s * 0.06, y); ctx.lineTo(x + s * 0.02, y - s * 0.16); ctx.stroke(); }
    ctx.fillStyle = "#3e7a3a"; ctx.beginPath(); ctx.arc(sx + rnd(9) * s * 0.6, sy + rnd(10) * s * 0.5, s * 0.17, 0, 7); ctx.fill();
  } else if (tt === "farmland") {
    ctx.strokeStyle = "rgba(110,90,30,0.45)"; ctx.lineWidth = Math.max(1, s * 0.05);
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(sx - s * 0.6, sy + k * s * 0.22); ctx.lineTo(sx + s * 0.6, sy + k * s * 0.22 - s * 0.15); ctx.stroke(); }
  } else if (tt === "reclaimed") {
    ctx.fillStyle = "rgba(150,130,90,0.5)";
    for (let k = 0; k < 7; k++) ctx.fillRect(sx + rnd(k) * s * 1.3, sy + rnd(k + 20) * s * 1.1, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
  } else if (tt === "reservoir" || (tt === "coast" && h % 3 === 0) || (tt === "ocean" && h % 5 === 0)) {
    ctx.strokeStyle = "rgba(200,230,255,0.35)"; ctx.lineWidth = Math.max(1, s * 0.05);
    const x = sx + rnd(1) * s * 0.6, y = sy + rnd(2) * s * 0.6;
    ctx.beginPath(); ctx.moveTo(x - s * 0.25, y); ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.1, x, y); ctx.quadraticCurveTo(x + s * 0.12, y + s * 0.1, x + s * 0.25, y); ctx.stroke();
  }
  // hills
  if (H.elev[i] >= 45 && tt !== "reservoir") {
    ctx.fillStyle = "rgba(90,70,40,0.35)"; ctx.strokeStyle = "rgba(60,45,25,0.6)"; ctx.lineWidth = 1;
    const k = Math.min(1.6, H.elev[i] / 80);
    ctx.beginPath(); ctx.moveTo(sx - s * 0.55, sy + s * 0.35); ctx.quadraticCurveTo(sx - s * 0.2, sy - s * 0.35 * k, sx + s * 0.1, sy + s * 0.35); ctx.fill(); ctx.stroke();
  }
  // coral & nature flags
  if (H.flags[i] & 4) { ctx.fillStyle = "#f08a8a"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(sx + rnd(k + 30) * s, sy + rnd(k + 31) * s, s * 0.06, 0, 7); ctx.fill(); } }
  ctx.restore();
}

function drawRail(rpx) {
  const strong = S.lens === "transit";
  if (!strong && rpx < 1.2) return;
  const w = strong ? Math.max(2, rpx * 0.22) : Math.max(1.2, rpx * 0.12);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const pass of [0, 1]) {
    for (const ln of S.D.lines) {
      ctx.strokeStyle = pass ? ln.color : "rgba(10,14,24,0.55)";
      ctx.lineWidth = pass ? w : w + 2.2;
      ctx.globalAlpha = strong ? 1 : 0.85;
      ctx.setLineDash(ln.status === "construction" ? [w * 2, w * 1.5] : []);
      ctx.beginPath();
      for (const seg of ln.segs) { seg.forEach((p, k) => { const [x, y] = w2s(p[0], p[1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (rpx > 4.5 || strong) {
    const r = Math.max(2, Math.min(5, rpx * 0.22));
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a2234"; ctx.lineWidth = 1.5;
    for (const st of S.D.stations) {
      const [x, y] = w2s(st.x, st.y); if (x < -10 || y < -10 || x > S.W + 10 || y > S.H + 10) continue;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (rpx > 18 || (strong && rpx > 9)) {
      const fs = Math.min(12, 8 + rpx * 0.08);
      ctx.font = `600 ${fs}px Inter, "Noto Sans SC", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const boxes = [];
      for (const st of S.D.stations) {
        const [x, y] = w2s(st.x, st.y); if (x < -50 || y < -10 || x > S.W + 10 || y > S.H + 10) continue;
        const label = zh() && st.zh ? st.zh : st.n;
        const w = ctx.measureText(label).width, b = [x + r + 1, y - fs / 2 - 1, x + r + 5 + w, y + fs / 2 + 1];
        if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
        boxes.push(b);
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,14,24,0.8)"; ctx.strokeText(label, x + r + 3, y); ctx.fillStyle = "#f4f0e4"; ctx.fillText(label, x + r + 3, y);
      }
    }
  }
}

const SEA_LABELS = [
  { en: "Straits of Johor", zh: "柔佛海峡", ll: [103.735, 1.457], size: 1 },
  { en: "Singapore Strait", zh: "新加坡海峡", ll: [103.88, 1.205], size: 1.4 },
  { en: "MALAYSIA · JOHOR", zh: "马来西亚 · 柔佛", ll: [103.80, 1.535], size: 1.1, land: 1 },
  { en: "INDONESIA · BATAM", zh: "印度尼西亚 · 巴淡", ll: [104.02, 1.105], size: 1.1, land: 1 },
];
let regionLabelPos = null;
function drawLabels(rpx) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const L of SEA_LABELS) {
    const [x, y] = w2s(...lonlat2xy(...L.ll));
    ctx.font = `${L.land ? 700 : "italic 500"} ${Math.round(Math.max(11, Math.min(22, rpx * 1.4)) * L.size)}px ${L.land ? "Cinzel" : "Georgia"}, "Noto Serif SC", serif`;
    ctx.fillStyle = L.land ? "rgba(230,225,205,0.55)" : "rgba(190,220,245,0.55)";
    ctx.fillText(zh() ? L.zh : L.en, x, y);
  }
  if (!regionLabelPos) {
    regionLabelPos = {};
    for (const c of S.D.cities) { const k = c.region; const p = (regionLabelPos[k] = regionLabelPos[k] || { x: 0, y: 0, n: 0, zh: c.region_zh }); for (const h of c.hexes) { p.x += CX[h]; p.y += CY[h]; p.n++; } }
  }
  if (rpx < 9) {
    ctx.font = `700 ${Math.round(Math.max(14, Math.min(30, rpx * 4)))}px Cinzel, "Noto Serif SC", serif`;
    for (const [k, p] of Object.entries(regionLabelPos)) {
      const [x, y] = w2s(p.x / p.n, p.y / p.n + 900);
      const label = zh() ? p.zh : k.replace(" Region", "").toUpperCase();
      ctx.fillStyle = "rgba(25,20,10,0.35)"; ctx.fillText(spaced(label), x + 1.5, y + 1.5);
      ctx.fillStyle = "rgba(255,248,225,0.55)"; ctx.fillText(spaced(label), x, y);
    }
  }
}
const spaced = (s) => (zh() ? s.split("").join(" ") : s.split("").join(" "));

function badge(x, y, r, icon, ring) {
  ctx.fillStyle = "rgba(14,20,34,0.88)"; ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.font = `${Math.round(r * 1.15)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff"; ctx.fillText(icon, x, y + r * 0.05);
}
function drawSites(rpx, vis) {
  const lensFaith = S.lens === "faith";
  const show = (k) => {
    if (k === "power") return rpx > 2.2;
    if (k === "university") return rpx > 7;
    if (k === "monument") return rpx > 11;
    if (k === "hawker" || k === "attraction") return rpx > 16;
    if (k === "historic" || k === "peak") return rpx > 24;
    if (k === "worship") return lensFaith ? rpx > 5 : rpx > 55;
    if (k === "library" || k === "cc") return rpx > 40;
    if (k === "hotel") return rpx > 60;
    return false;
  };
  const r = Math.max(6, Math.min(12, rpx * 0.38));
  const placed = new Set();
  const order = ["power", "university", "monument", "attraction", "hawker", "historic", "peak", "worship", "library", "cc", "hotel"];
  for (const k of order) {
    if (!show(k)) continue;
    for (const s of S.D.sites) {
      if (s.k !== k || placed.has(s.h)) continue;
      const [x, y] = w2s(CX[s.h], CY[s.h]);
      if (x < -20 || y < -20 || x > S.W + 20 || y > S.H + 20) continue;
      placed.add(s.h);
      const icon = k === "worship" ? REL_ICON[s.rel] || "🛐" : SITE_ICON[k];
      const ox = rpx > 10 ? rpx * 0.45 : 0, oy = rpx > 10 ? -rpx * 0.35 : 0;
      badge(x + ox, y + oy, r, icon, k === "power" ? "#f4cc4c" : k === "worship" ? "#e8e2c8" : "#8aa0c8");
      if (k === "power" && s.v && rpx > 4) {
        ctx.font = `700 ${Math.round(r * 0.9)}px Inter, sans-serif`; ctx.textAlign = "left";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,14,24,0.85)"; const txt = s.v >= 1000 ? (s.v / 1000).toFixed(1) + " GW" : s.v + " MW";
        ctx.strokeText(txt, x + ox + r + 3, y + oy); ctx.fillStyle = "#f4cc4c"; ctx.fillText(txt, x + ox + r + 3, y + oy);
      }
    }
  }
}
function drawWonders(rpx) {
  const r = Math.max(8, Math.min(16, rpx * 0.5));
  for (const w of S.D.wonders) {
    if (w.h == null) continue;
    const [x, y] = w2s(CX[w.h], CY[w.h]);
    if (x < -40 || y < -40 || x > S.W + 40 || y > S.H + 40) continue;
    ctx.save();
    ctx.shadowColor = "rgba(244,204,76,0.8)"; ctx.shadowBlur = 10;
    badge(x, y, r, WONDER_ICON[w.icon] || "★", "#f4cc4c");
    ctx.restore();
    if (rpx > 3.5) {
      ctx.font = `700 ${Math.round(Math.max(10, Math.min(13, rpx * 0.5)))}px Cinzel, "Noto Serif SC", serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const label = zh() ? w.zh : w.n;
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(20,14,4,0.85)"; ctx.strokeText(label, x, y + r + 3); ctx.fillStyle = "#f6dc93"; ctx.fillText(label, x, y + r + 3);
    }
  }
}

// ------------------------------------------------------------------ city banners (DOM)
const bannerEls = new Map();
function buildBanners() {
  const host = $("#banners"); host.innerHTML = ""; bannerEls.clear();
  for (const c of S.D.cities) {
    const el = document.createElement("div");
    el.className = "banner";
    const col = REGION_COL[c.region] || "#ccc";
    const show = c.pop >= 1000 ? fmt(c.pop) : "";
    el.innerHTML = `${show ? `<span class="pop" style="background:${col}">${show}</span>` : `<span class="pop" style="background:${col};opacity:.6">·</span>`}` +
      `<span class="nm">${esc(zh() ? c.zh : c.name.toUpperCase())}${c.id === "DT" ? '<span class="cap">★</span>' : ""}</span>` +
      (c.icon && c.id !== "DT" ? `<span class="dist" title="${esc(t("dist_" + c.title))}">${c.icon}</span>` : "");
    el.onclick = (e) => { e.stopPropagation(); openCity(c, true); };
    el.onmouseenter = () => { S.hoverCity = c; };
    el.onmouseleave = () => { S.hoverCity = null; };
    host.appendChild(el);
    bannerEls.set(c.id, { el, c, w: 0 });
  }
}
function placeBanners(rpx) {
  const imp = (c) => c.pop + c.jobs * 0.8;
  const list = [...bannerEls.values()].sort((a, b) => imp(b.c) - imp(a.c));
  const boxes = [];
  const small = rpx < 5;
  for (const b of list) {
    const c = b.c;
    const [x, y] = w2s(CX[c.seat], CY[c.seat] - R * 0.2);
    let ok = x > -80 && y > 30 && x < S.W + 80 && y < S.H + 20;
    if (rpx < 3.2 && imp(c) < 60000 && S.sel !== c) ok = false;
    if (rpx < 5 && imp(c) < 8000 && S.sel !== c) ok = false;
    if (!b.w) b.w = b.el.offsetWidth || 110;
    const w = b.w * (small ? 0.85 : 1), h = small ? 16 : 20;
    const box = [x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1];
    if (ok && S.sel !== c) for (const o of boxes) if (box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]) { ok = false; break; }
    b.el.style.display = ok ? "flex" : "none";
    if (!ok) continue;
    boxes.push(box);
    b.el.classList.toggle("small", small);
    b.el.classList.toggle("sel", S.sel === c);
    b.el.style.left = x + "px"; b.el.style.top = y + "px";
  }
}

// ------------------------------------------------------------------ minimap
const mm = $("#minimap"), mctx = mm.getContext("2d");
let mmBase = null, mmScale = 1, mmOff = [0, 0];
function buildMinimap() {
  const Wm = mm.width, Hm = mm.height;
  // frame Singapore (land bbox + a little sea), not the whole context grid
  const pad = 2500, bx0 = LAND_BB[0] - pad, by0 = LAND_BB[1] - pad, ww = LAND_BB[2] - LAND_BB[0] + 2 * pad, wh = LAND_BB[3] - LAND_BB[1] + 2 * pad;
  mmScale = Math.min(Wm / ww, Hm / wh);
  mmOff = [(Wm - ww * mmScale) / 2 - (bx0 - M.x0) * mmScale, (Hm - wh * mmScale) / 2 - (by0 - M.y0) * mmScale];
  const off = document.createElement("canvas"); off.width = Wm; off.height = Hm; const o = off.getContext("2d");
  o.fillStyle = "#14385c"; o.fillRect(0, 0, Wm, Hm);
  const s = Math.max(1.4, R * mmScale * 1.9);
  for (let i = 0; i < N; i++) {
    const tt = M.terrains[H.t[i]];
    o.fillStyle = TERRAIN_COL[tt];
    o.fillRect(mmOff[0] + (CX[i] - M.x0) * mmScale - s / 2, mmOff[1] + (CY[i] - M.y0) * mmScale - s / 2, s, s);
  }
  mmBase = off;
}
function drawMinimapView() {
  if (!mmBase) return;
  mctx.drawImage(mmBase, 0, 0);
  const [a, b] = s2w(0, 0), [c, d] = s2w(S.W, S.H);
  const X = (x) => mmOff[0] + (x - M.x0) * mmScale, Y = (y) => mmOff[1] + (y - M.y0) * mmScale;
  mctx.strokeStyle = "#f0d58e"; mctx.lineWidth = 1.5; mctx.strokeRect(X(a), Y(b), X(c) - X(a), Y(d) - Y(b));
}
mm.addEventListener("click", (e) => {
  const r = mm.getBoundingClientRect();
  S.cam.x = (e.clientX - r.left - mmOff[0]) / mmScale + M.x0; S.cam.y = (e.clientY - r.top - mmOff[1]) / mmScale + M.y0; redraw(); saveHash();
});

// ------------------------------------------------------------------ interaction
let drag = null;
cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; cv.classList.add("dragging"); }
    S.cam.x = drag.cx - dx / S.cam.z; S.cam.y = drag.cy - dy / S.cam.z; hideTip(); redraw(); return;
  }
  const [wx, wy] = s2w(e.clientX, e.clientY); const h = hexAt(wx, wy);
  if (h !== S.hover) { S.hover = h; redraw(); }
  showTip(h, e.clientX, e.clientY);
});
cv.addEventListener("pointerup", (e) => {
  cv.classList.remove("dragging");
  if (drag && !drag.moved) {
    const [wx, wy] = s2w(e.clientX, e.clientY); const h = hexAt(wx, wy);
    const c = h >= 0 && hexCity[h] >= 0 && !isWater(h) ? S.D.cities[hexCity[h]] : null;
    if (c) openCity(c, false); else closeCity();
  }
  if (drag && drag.moved) saveHash();
  drag = null;
});
cv.addEventListener("pointerleave", () => { S.hover = -1; hideTip(); redraw(); });
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
cv.addEventListener("dblclick", (e) => zoomAt(e.clientX, e.clientY, 2));
function zoomAt(sx, sy, f) {
  const [wx, wy] = s2w(sx, sy);
  S.cam.z = Math.max(S.minZ, Math.min(S.maxZ, S.cam.z * f));
  S.cam.x = wx - (sx - S.W / 2) / S.cam.z; S.cam.y = wy - (sy - S.H / 2) / S.cam.z;
  redraw(); clearTimeout(zoomAt.t); zoomAt.t = setTimeout(saveHash, 300);
}
function flyTo(x, y, z, ms = 500) {
  const a = { ...S.cam }, t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    S.cam.x = a.x + (x - a.x) * e; S.cam.y = a.y + (y - a.y) * e; S.cam.z = Math.exp(Math.log(a.z) + (Math.log(z) - Math.log(a.z)) * e);
    render(); if (k < 1) requestAnimationFrame(step); else saveHash();
  };
  requestAnimationFrame(step);
}
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") { if (e.key === "Escape") e.target.blur(); return; }
  const p = 80 / S.cam.z;
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") S.cam.x -= p; else if (k === "arrowright" || k === "d") S.cam.x += p;
  else if (k === "arrowup" || k === "w") S.cam.y -= p; else if (k === "arrowdown" || k === "s") S.cam.y += p;
  else if (k === "+" || k === "=") return zoomAt(S.W / 2, S.H / 2, 1.4); else if (k === "-") return zoomAt(S.W / 2, S.H / 2, 1 / 1.4);
  else if (k === "l") { const i = LENSES.findIndex((l) => l.id === S.lens); return setLens(LENSES[(i + 1) % LENSES.length].id); }
  else if (k === "r") return toggleQuick("resources");
  else if (k === "/") { e.preventDefault(); return $("#search").focus(); }
  else if (k === "?") return openAlmanac("about");
  else if (k === "escape") { closeLensMenu(); $("#almanac").classList.add("hidden"); return closeCity(); }
  else return;
  e.preventDefault(); redraw();
});

// ------------------------------------------------------------------ tooltip
const tip = $("#tip");
function hideTip() { tip.classList.add("hidden"); }
function showTip(h, mx, my) {
  if (h < 0 || drag) return hideTip();
  const tt = M.terrains[H.t[h]];
  const c = hexCity[h] >= 0 ? S.D.cities[hexCity[h]] : null;
  let html = `<div class="h">${t("t_" + tt)}${H.elev[h] >= 45 && !isWater(h) ? " · " + t("hills") : ""}</div>`;
  if (H.t[h] === T.foreign) html += `<div class="s">${H.fx[h] === "MYS" ? (zh() ? "马来西亚" : "Malaysia") : (zh() ? "印度尼西亚" : "Indonesia")}</div>`;
  if (c && !isWater(h) || (c && H.t[h] === T.reservoir)) html += `<div class="s">${esc(nm(c))} · ${esc(zh() ? c.region_zh : c.region)}</div>`;
  if (!isWater(h) && H.t[h] !== T.foreign) {
    html += "<hr>";
    if (H.pop[h]) html += `<div class="row"><span>${t("estResidents")}</span><b>${fmt(H.pop[h])}</b></div>`;
    if (H.jobs[h]) html += `<div class="row"><span>${t("estJobs")}</span><b>${fmt(H.jobs[h])}</b></div>`;
    if (H.elev[h]) html += `<div class="row"><span>${t("elevation")}</span><b>${H.elev[h]} m</b></div>`;
    const lu = H.lu[h];
    if (lu) {
      const tot = lu.reduce((a, b) => a + b, 0) || 1;
      const top = lu.map((v, k) => [v, k]).filter((a) => a[0]).sort((a, b) => b[0] - a[0]).slice(0, 3);
      html += `<div class="row"><span>${t("zoning")}</span><b>${top.map(([v, k]) => `${t("lu_" + M.lu_keys[k])} ${Math.round(v / tot * 100)}%`).join(" · ")}</b></div>`;
    }
    if (H.clinic[h]) html += `<div class="row"><span>${t("clinics")}</span><b>${H.clinic[h]}</b></div>`;
    if (H.jtc[h]) html += `<div class="row"><span>${t("estate")}</span><b>${esc(H.jtc[h])}</b></div>`;
  }
  const f = [];
  if (H.flags[h] & 1) f.push(t("natureReserve")); if (H.flags[h] & 2) f.push(t("nationalPark")); if (H.flags[h] & 4) f.push(t("coral")); if (H.flags[h] & 8) f.push(t("beach")); if (H.flags[h] & 16) f.push(t("seagrass"));
  if (f.length) html += `<div class="row"><span>${t("features")}</span><b>${f.join(", ")}</b></div>`;
  // lens value
  const L = S.lens;
  if (c && ["income", "age", "degrees", "housing", "commute", "ethnicity", "faith", "language"].includes(L)) {
    const v = cityLensValue(c, L);
    html += `<hr><div class="row"><span>${t("l_" + L)}</span><b>${lensValueText(L, v)}</b></div>`;
  }
  const st = stationHexes.get(h);
  const ss = sitesByHex.get(h) || [];
  const ws = S.D.wonders.filter((w) => w.h === h);
  if (st || ss.length || ws.length) {
    html += "<hr>";
    for (const w of ws) html += `<div class="site"><span>${WONDER_ICON[w.icon]}</span><b style="color:#f6dc93">${esc(zh() ? w.zh : w.n)}</b></div>`;
    if (st) html += `<div class="site"><span>🚉</span><span>${st.map((s) => esc(zh() && s.zh ? s.zh : s.n)).join(", ")}</span></div>`;
    for (const s of ss.slice(0, 6)) html += `<div class="site"><span>${s.k === "worship" ? REL_ICON[s.rel] || "🛐" : SITE_ICON[s.k]}</span><span>${esc(zh() && s.zh ? s.zh : s.n) || t("s_" + s.k)}${s.v ? ` <small style="color:#9aa6bb">${siteValue(s)}</small>` : ""}</span></div>`;
    if (ss.length > 6) html += `<div class="s">+${ss.length - 6}</div>`;
  }
  if (c && !isWater(h)) html += `<div class="s" style="margin-top:4px">${t("clickOpen")}</div>`;
  tip.innerHTML = html; tip.classList.remove("hidden");
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.min(mx + 16, S.W - tw - 8) + "px"; tip.style.top = Math.min(my + 16, S.H - th - 8) + "px";
}
function siteValue(s) {
  if (s.k === "power") return s.v >= 1000 ? (s.v / 1000).toFixed(1) + " GW" : s.v + " MW";
  if (s.k === "hawker") return s.v + " " + t("seats");
  if (s.k === "hotel") return s.v + " " + t("rooms");
  if (s.k === "peak") return s.v + " m";
  return s.v;
}
function lensValueText(L, v) {
  if (v == null) return t("lg_nodata");
  if (CAT_KEYS[L]) return `${CAT_LABEL[L](v.k)} ${pct(v.share)} (×${v.lq.toFixed(2)})`;
  if (L === "income") return "S$" + Math.round(v).toLocaleString();
  if (L === "age") return v.toFixed(1);
  return pct(v);
}

// ------------------------------------------------------------------ lenses UI
function setLens(id) {
  S.lens = id; buildColors();
  document.querySelectorAll("#lensbar [data-lens]").forEach((b) => b.classList.toggle("on", b.dataset.lens === id));
  $("#lensMore").classList.toggle("on", !document.querySelector(`#lensbar [data-lens="${id}"]`));
  renderLensMenu(); renderLegend(); redraw(); saveHash();
}
function renderLensMenu() {
  const m = $("#lensMenu"); let html = `<h5 style="grid-column:span 2;font-family:var(--serif);font-size:13px;color:var(--gold2);text-transform:none;letter-spacing:.08em">${t("chooseLens")}</h5>`;
  let g = null;
  for (const l of LENSES) {
    if (l.g !== g) { g = l.g; html += `<h5>${t(g)}</h5>`; }
    html += `<button data-l="${l.id}" class="${S.lens === l.id ? "on" : ""}"><span>${l.ic}</span>${t("l_" + l.id)}</button>`;
  }
  m.innerHTML = html;
  m.querySelectorAll("button").forEach((b) => (b.onclick = () => { setLens(b.dataset.l); closeLensMenu(); }));
}
const closeLensMenu = () => $("#lensMenu").classList.add("hidden");
function renderLegend() {
  const L = S.lens, el = $("#legend");
  el.classList.toggle("open", L !== "terrain");  // terrain legend starts folded so the map fills the screen
  let html = `<h4>${t("l_" + L)} <span class="fold">▾</span></h4><p>${t("lg_" + L)}</p>`;
  if (L === "terrain") html += `<div class="cats">${["urban", "industrial", "rainforest", "parkland", "mangrove", "farmland", "reclaimed", "reservoir", "coast", "ocean"].map((k) => `<div class="cat"><span class="sw" style="background:${TERRAIN_COL[k]}"></span>${t("t_" + k)}</div>`).join("")}</div>`;
  else if (L === "landuse") html += `<div class="cats">${M.lu_keys.map((k) => `<div class="cat"><span class="sw" style="background:${LU_COL[k]}"></span>${t("lu_" + k)}</div>`).join("")}</div>`;
  else if (CAT_KEYS[L]) {
    const present = new Set(S.D.cities.map((c) => cityLensValue(c, L)).filter(Boolean).map((v) => v.k));
    html += `<div class="cats">${CAT_KEYS[L].filter((k) => present.has(k)).map((k) => `<div class="cat"><span class="sw" style="background:${rgbs(catColor(L, k))}"></span>${CAT_LABEL[L](k)}</div>`).join("")}</div>`;
  } else if (L === "population" || L === "jobs") {
    const mx = L === "population" ? 4500 : 9000;
    html += `<div class="ramp" style="background:${CSS_RAMP(["#1a1733", "#45206a", "#8b2d74", "#cd4c55", "#f28c3a", "#fbd65b"])}"></div><div class="ends"><span>1</span><span>${fmt(Math.sqrt(mx))}</span><span>${fmt(mx)}+</span></div>`;
  } else if (L === "elevation") {
    html += `<div class="ramp" style="background:${CSS_RAMP(["#3f7b4a", "#8aa957", "#d2c272", "#b8875a", "#8c6a55", "#e9e4dc"])}"></div><div class="ends"><span>0 m</span><span>60 m</span><span>120 m+</span></div>`;
  } else if (L === "transit") {
    html += `<div class="cats">${S.D.lines.map((l) => `<div class="cat"><span class="sw" style="background:${l.color}"></span>${esc(zh() ? l.zh : l.name)}</div>`).join("")}</div>`;
  } else if (LENS_RANGE[L]) {
    const [a, b] = LENS_RANGE[L];
    const f = (v) => (L === "income" ? "S$" + fmt(v) : L === "age" ? v.toFixed(0) : pct(v));
    html += `<div class="ramp" style="background:${CSS_RAMP(["#1f2d4d", "#24577f", "#2a8a8c", "#69b85a", "#e3d35a", "#f6a13c"])}"></div><div class="ends"><span>${f(a)}</span><span>${f((a + b) / 2)}</span><span>${f(b)}</span></div>`;
    html += `<div class="cat" style="margin-top:4px"><span class="sw" style="background:#4b5163"></span>${t("lg_nodata")}</div>`;
  }
  el.innerHTML = html;
}
function toggleQuick(q) {
  if (q === "resources") S.showRes = !S.showRes; else S.showLabels = !S.showLabels;
  document.querySelector(`[data-quick="${q}"]`).classList.toggle("on", q === "resources" ? S.showRes : S.showLabels);
  $("#banners").style.display = S.showLabels ? "" : "none";
  redraw();
}

// ------------------------------------------------------------------ city panel
function openCity(c, fly) {
  S.sel = c; renderPanel(); redraw(); saveHash();
  if (fly) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const h of c.hexes) { x0 = Math.min(x0, CX[h]); x1 = Math.max(x1, CX[h]); y0 = Math.min(y0, CY[h]); y1 = Math.max(y1, CY[h]); }
    const avail = S.W - (S.W > 900 ? 400 : 0);
    const z = Math.min(S.maxZ, Math.max(S.minZ, Math.min(avail / (x1 - x0 + 3000), (S.H - 120) / (y1 - y0 + 3000))));
    flyTo((x0 + x1) / 2 + (S.W > 900 ? 200 / z : 0), (y0 + y1) / 2, z);
  }
}
function closeCity() { if (!S.sel) return; S.sel = null; $("#panel").classList.add("hidden"); redraw(); saveHash(); }

function person(col) { return `<svg viewBox="0 0 16 22"><circle cx="8" cy="5" r="3.6" fill="${col}"/><path d="M2 21v-6.5C2 11 4.6 9.6 8 9.6s6 1.4 6 4.9V21z" fill="${col}"/></svg>`; }
function picto(groups, natGroups, unit, total) {
  // groups: [[label, value, color]]; 20 figures, largest remainder rounding
  const tot = groups.reduce((s, g) => s + g[1], 0);
  if (!tot) return "";
  const n = 20, raw = groups.map((g) => (g[1] / tot) * n), fl = raw.map(Math.floor);
  let left = n - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
  let figs = ""; groups.forEach((g, i) => { for (let k = 0; k < fl[i]; k++) figs += person(g[2]); });
  const ntot = natGroups ? natGroups.reduce((s, g) => s + g, 0) : 0;
  const cmp = natGroups ? `<div class="lbl">${t("sg")}</div><div class="rowp cmp">${groups.map((g, i) => `<span style="width:${(natGroups[i] / ntot) * 100}%;background:${g[2]}"></span>`).join("")}</div>` : "";
  const key = groups.map((g, i) => {
    const share = g[1] / tot, ns = natGroups ? natGroups[i] / ntot : null;
    const arrow = ns ? (share >= ns * 1.5 && share > 0.02 ? ' <span class="up">▲</span>' : share <= ns * 0.67 && ns > 0.02 ? ' <span class="down">▼</span>' : "") : "";
    return `<div><i style="background:${g[2]}"></i>${esc(g[0])}<b>${pct(share)}${arrow}</b></div>`;
  }).join("");
  return `<div class="picto"><div class="rowp">${figs}</div>${cmp}<div class="key">${key}</div><div class="each">${t("eachFigure")} ${fmt(tot / 20)} ${unit} · ${fmt(total ?? tot)} ${t("inAll")}</div></div>`;
}
function bars(rows, opt = {}) {
  // rows: [label, value, natShare|null, color]
  const tot = opt.total || rows.reduce((s, r) => s + r[1], 0) || 1;
  const max = Math.max(...rows.map((r) => r[1] / tot), ...rows.map((r) => r[2] || 0));
  return `<div class="bars">${rows.map((r) => {
    const share = r[1] / tot, lq = r[2] ? share / r[2] : null;
    return `<div class="b"><div class="t"><span>${esc(r[0])}${lq ? ` <small style="color:${lq >= 1.5 ? "var(--up)" : lq <= 0.67 ? "var(--down)" : "var(--dim)"}">×${lq.toFixed(1)}</small>` : ""}</span><span>${opt.money ? money(r[1] * 1e6) : fmt(r[1])} · ${pct(share)}</span></div>` +
      `<div class="track"><div class="fill" style="width:${(share / max) * 100}%;background:${r[3] || "var(--gold)"}"></div>${r[2] ? `<div class="tick" style="left:${(r[2] / max) * 100}%"></div>` : ""}</div></div>`;
  }).join("")}</div>`;
}
const medal = (r) => (r === 1 ? "" : r === 2 ? "silver" : r === 3 ? "bronze" : r <= 10 ? "" : "plain");

function renderPanel() {
  const c = S.sel; if (!c) return;
  const p = $("#panel"); p.classList.remove("hidden");
  const col = REGION_COL[c.region] || "#ccc";
  const growth = c.pop20 > 0 ? c.pop / c.pop20 - 1 : null;
  const gdpPerWorker = c.jobs ? (c.gdp * 1e6) / c.jobs : null;
  const titleTxt = c.title ? t("title_" + c.title) : "";
  let html = `<div class="ph"><div class="kick">${t("cityView")} · ${esc(zh() ? c.region_zh : c.region)}</div>
    <div class="title"><div class="badge" style="background:${col}">${fmt(c.pop)}</div><div>
    <h2>${esc(zh() ? c.zh : c.name.toUpperCase())}</h2><div class="zhname">${esc(zh() ? c.name : c.zh)}</div>
    <div class="sub">${c.area} km² · ${c.hexes.length} hexes${c.jtc ? " · JTC: " + esc(c.jtc.slice(0, 2).join(", ")) : ""}</div>
    ${titleTxt ? `<span class="tag">${c.icon || ""} ${esc(titleTxt)}</span>` : ""}</div></div>
    <button class="close" id="panelClose">✕</button></div>`;
  html += `<div class="cards"><div class="card"><div class="k">${t("population")}</div><div class="v">${c.pop.toLocaleString()}</div>
    <div class="d">${growth != null && c.pop20 > 500 ? `<span class="${growth >= 0 ? "up" : "down"}">${growth >= 0 ? "▲" : "▼"} ${pct(Math.abs(growth), 1)}</span> ${t("popSince")}` : "&nbsp;"}</div></div>
    <div class="card"><div class="k">${t("gdpEst")} ${NAT.gdp_year}</div><div class="v">${money(c.gdp * 1e6)}</div><div class="d">${gdpPerWorker ? money(gdpPerWorker, 0) + " " + t("perWorker") : "&nbsp;"}</div></div></div>`;
  const rk = (k, lbl) => c.rank && c.rank[k] ? `<div class="rank"><div class="m ${medal(c.rank[k])}">#${c.rank[k]}</div><small>${t(lbl)}</small></div>` : "";
  html += `<div class="ranks">${rk("pop", "rankPop")}${rk("gdp", "rankGdp")}${rk("jobs", "rankJobs")}${rk("growth", "rankGrowth")}</div>`;
  const tabs = [["citizens", "tabCitizens"], ["districts", "tabDistricts"], ["economy", "tabEconomy"], ["housing", "tabHousing"]];
  html += `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${t(l)}</button>`).join("")}</div>`;
  html += `<div id="tabBody">${tabBody(c)}</div>`;
  p.innerHTML = html;
  $("#panelClose").onclick = closeCity;
  p.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; renderPanel(); }));
  p.querySelectorAll("[data-fly]").forEach((b) => (b.onclick = () => { const h = +b.dataset.fly; flyTo(CX[h], CY[h], Math.max(S.cam.z, 0.06)); }));
}

function tabBody(c) {
  const n = NAT, x = c.x, nx = NAT.x;
  const srcGHS = `<div class="src">${t("source")}: SingStat General Household Survey 2025 (data.gov.sg).</div>`;
  if (S.tab === "citizens") {
    let h = "";
    if (c.pop < 1000) h += `<div class="sec"><p class="note">${t("noResidents")}</p></div>`;
    h += `<div class="sec"><h3>${t("tabCitizens")}</h3><div class="minis">
      <div class="mini"><div class="v">${x.ageMed ? x.ageMed.toFixed(1) : "–"}</div><div class="k">${t("medianAge")}</div><div class="d">${t("sg")} ${nx.ageMed.toFixed(1)}</div></div>
      <div class="mini"><div class="v">${pct(x.degree)}</div><div class="k">${t("haveDegree")}</div><div class="d">${t("sg")} ${pct(nx.degree)}</div></div>
      <div class="mini"><div class="v">${pct(x.unemp, 1)}</div><div class="k">${t("unemployed")}</div><div class="d">${t("sg")} ${pct(nx.unemp, 1)}</div></div></div>
      ${c.res_grouped && c.pop >= 1000 ? `<p class="note">${t("groupedNote")}</p>` : ""}</div>`;
    if (c.occ) h += `<div class="sec"><h3>${t("workforce")}<small>${t("byOccupation")}</small></h3>${picto(OCC.map((k, i) => [t("o_" + k), c.occ[k] || 0, GROUP_COLS[i]]), OCC.map((k) => n.occ[k] || 0), t("workers"), c.occ.Total)}</div>`;
    if (c.pop >= 1000) h += `<div class="sec"><h3>${t("generations")}<small>${t("byAge")}</small></h3>${picto(Object.entries(x.ageBands).map(([k, v], i) => [t(k), v, ["#7fc8a9", "#5aa7e6", "#f2c14e", "#e2685b"][i]]), Object.values(nx.ageBands), t("people"), c.pop)}</div>`;
    if (c.eth && c.pop >= 1000) h += `<div class="sec"><h3>${t("ethnicity")}</h3>${picto(ETH.map((k, i) => [t("e_" + k), c.eth[k], GROUP_COLS[i]]), ETH.map((k) => n.eth[k]), t("people"), c.pop)}</div>`;
    if (c.tr) h += `<div class="sec"><h3>${t("commute")}<small>${t("howToWork")}</small></h3>${picto(COMMUTE.map(([k, cols], i) => [t(k), cols.reduce((s, cc) => s + (c.tr[cc] || 0), 0), ["#e2685b", "#f2c14e", "#57b26b", "#5aa7e6", "#b985ef", "#8a96ad", "#d9d2bf"][i]]), COMMUTE.map(([, cols]) => cols.reduce((s, cc) => s + (n.tr[cc] || 0), 0)), t("workers"), c.tr.Total)}</div>`;
    if (c.qual) h += `<div class="sec"><h3>${t("education")}<small>${t("adults15")}</small></h3>${picto(QUAL.map((k, i) => [t("q_" + k), c.qual[k] || 0, ["#8a96ad", "#d9d2bf", "#6fd3c4", "#5aa7e6", "#b985ef", "#f2c14e"][i]]), QUAL.map((k) => n.qual[k] || 0), t("people"), c.qual.Total)}</div>`;
    if (c.rel) h += `<div class="sec"><h3>${t("religion")}<small>${t("adults15")}</small></h3>${picto(REL.map((k, i) => [t("r_" + k), c.rel[k] || 0, GROUP_COLS[i]]), REL.map((k) => n.rel[k] || 0), t("people"), c.rel.Total)}</div>`;
    if (c.lang) h += `<div class="sec"><h3>${t("homeLanguage")}</h3>${picto(LANG.map(([k, l], i) => [t(l), c.lang[k] || 0, GROUP_COLS[i]]), LANG.map(([k]) => n.lang[k] || 0), t("people"), c.lang.Total)}</div>`;
    return h + `<div class="sec">${srcGHS}</div>`;
  }
  if (S.tab === "districts") {
    let h = `<div class="sec"><h3>${t("districts")}</h3><p class="note">${t("howDistricts")}</p>`;
    const ds = [...c.districts].sort((a, b) => (a.kind === b.kind ? (b.lq || 0) - (a.lq || 0) : a.kind === "jobs" ? -1 : 1));
    if (!ds.length) h += `<p class="note">–</p>`;
    for (const d of ds) {
      h += `<div class="dcard"><div class="di">${DIST_ICON[d.d]}</div><div><h4>${t("dist_" + d.d)}</h4><p>${t("distd_" + d.d)}${d.what ? " " + esc(d.what) + "." : ""}</p>`;
      if (d.kind === "jobs") h += `<div class="nums"><span><b>×${d.lq.toFixed(1)}</b>${t("lq")}</span><span><b>${fmt(d.jobs)}</b>${t("jobsHere")}</span><span><b>${pct(d.jobs / c.wind.Total)}</b>${zh() ? "本区占比" : "of local jobs"}</span></div>`;
      else h += `<div class="nums"><span style="color:var(--muted)">◆ ${t("physical")}</span></div>`;
      h += `</div></div>`;
    }
    h += `</div>`;
    // landmarks
    const ss = []; for (const hx of c.hexes) for (const s of sitesByHex.get(hx) || []) if (s.k !== "worship" && s.k !== "hotel") ss.push(s);
    const ws = S.D.wonders.filter((w) => c.hexes.includes(w.h));
    if (ws.length || ss.length) {
      h += `<div class="sec"><h3>${t("sitesHere")}</h3><div class="sites">`;
      for (const w of ws) h += `<div data-fly="${w.h}" style="cursor:pointer"><span>${WONDER_ICON[w.icon]}</span><b style="color:#f6dc93">${esc(zh() ? w.zh : w.n)}</b><small>${t("s_wonder")}</small></div>`;
      const order = ["power", "university", "monument", "attraction", "hawker", "historic", "library", "cc", "peak"];
      ss.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
      for (const s of ss.slice(0, 40)) h += `<div data-fly="${s.h}" style="cursor:pointer"><span>${SITE_ICON[s.k]}</span><span>${esc(zh() && s.zh ? s.zh : s.n)}</span><small>${t("s_" + s.k)}${s.v ? " · " + siteValue(s) : ""}</small></div>`;
      if (ss.length > 40) h += `<div><span></span><small>+${ss.length - 40}</small></div>`;
      h += `</div></div>`;
    }
    return h + `<div class="sec">${srcGHS}</div>`;
  }
  if (S.tab === "economy") {
    const yl = [["food", "🌾", "food", "var(--food)"], ["prod", "⚙️", "production", "var(--prod)"], ["gold", "🪙", "gold", "var(--goldy)"], ["sci", "🧪", "science", "var(--sci)"], ["cult", "🎭", "culture", "var(--cult)"]];
    let h = `<div class="sec"><h3>${t("yields")}<small>${t("rankAmong")}</small></h3><div class="yields">${yl.map(([k, ic, l, col]) =>
      `<div class="yield"><div class="i">${ic}</div><div class="v" style="color:${col}">${k === "gold" ? money(c.y.gold) : fmt(c.y[k])}</div><div class="k">${t(l).replace(/（.*|\(.*/, "")}</div><div class="r">${c.rank && c.rank[k] ? "#" + c.rank[k] + " / " + S.rankN[k] : "–"}</div></div>`).join("")}</div></div>`;
    if (c.wind && c.wind.Total) {
      const gi = NAT.gdp_ind, gsum = Object.values(gi).reduce((a, b) => a + b, 0), scale = NAT.gdp / gsum;
      const rows = IND.map((k) => { const nat = NAT.wind[k] || 1; return [t("i_" + k), (gi[k] || 0) * scale * (c.wind[k] || 0) / nat, (gi[k] || 0) / gsum, "var(--goldy)"]; }).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
      h += `<div class="sec"><h3>${t("gdpByIndustry")}</h3>${bars(rows.slice(0, 10), { money: true })}<p class="note">${zh() ? "每个行业的全国 GDP 按在本区工作的居民人数分摊；刻度线 = 全国占比。" : "Each industry's national GDP is shared out by the residents who work here; tick = national share."}</p></div>`;
      const jr = IND.map((k) => [t("i_" + k), c.wind[k] || 0, (NAT.wind[k] || 0) / NAT.wind.Total, "var(--sci)"]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
      h += `<div class="sec"><h3>${t("jobsByIndustry")}</h3>${bars(jr, { total: c.wind.Total })}</div>`;
    }
    if (c.winc) {
      const ks = Object.keys(c.winc).filter((k) => k !== "Total");
      const med = medianFromBins(c.winc, ks, parseInc), nmed = medianFromBins(NAT.winc, ks, parseInc);
      h += `<div class="sec"><h3>${t("workplaceIncome")}</h3><div class="minis"><div class="mini"><div class="v">S$${fmt(med)}</div><div class="k">${zh() ? "月收入中位数" : "Median / month"}</div><div class="d">${t("sg")} S$${fmt(nmed)}</div></div></div></div>`;
    }
    return h + `<div class="sec"><div class="src">${t("source")}: SingStat GDP at current prices by industry ${NAT.gdp_year}; GHS 2025 employed residents by planning area of workplace. ${zh() ? "只计居民（公民与永久居民），不含外籍员工。" : "Counts residents (citizens & PRs) only, not foreign workers."}</div></div>`;
  }
  // housing
  let h = "";
  if (c.dwell && c.x.dwellTot) h += `<div class="sec"><h3>${t("dwelling")}<small>${t("residentsBy")} ${zh() ? "住屋类型" : "dwelling type"}</small></h3>${picto(DWELL.map((k, i) => [t("d_" + k), c.dwell[k] || 0, ["#e2685b", "#ef9e4c", "#f2c14e", "#57b26b", "#5aa7e6", "#b985ef", "#8a96ad"][i]]), DWELL.map((k) => NAT.dwell[k] || 0), t("people"), c.x.dwellTot)}</div>`;
  if (c.hhinc) {
    h += `<div class="sec"><h3>${t("hhIncome")}</h3><div class="minis"><div class="mini"><div class="v">S$${fmt(c.x.incMed)}</div><div class="k">${t("medianHH")}</div><div class="d">${t("sg")} S$${fmt(NAT.x.incMed)}</div></div>`;
    if (c.ten) h += `<div class="mini"><div class="v">${pct(c.ten.Owner_Occupied / c.ten.Total1)}</div><div class="k">${t("owner")}</div><div class="d">${t("sg")} ${pct(NAT.ten.Owner_Occupied / NAT.ten.Total1)}</div></div>`;
    h += `<div class="mini"><div class="v">${pct(c.hhinc.NoEmployedPerson / c.hhinc.Total)}</div><div class="k">${zh() ? "无人就业家庭" : "No one working"}</div><div class="d">${t("sg")} ${pct(NAT.hhinc.NoEmployedPerson / NAT.hhinc.Total)}</div></div></div>`;
    const bands = [["< S$4K", ["Below_1_000", "1_000_1_999", "2_000_2_999", "3_000_3_999"]], ["S$4–8K", ["4_000_4_999", "5_000_5_999", "6_000_6_999", "7_000_7_999"]],
      ["S$8–12K", ["8_000_8_999", "9_000_9_999", "10_000_10_999", "11_000_11_999"]], ["S$12–20K", ["12_000_12_999", "13_000_13_999", "14_000_14_999", "15_000_17_499", "17_500_19_999"]],
      ["S$20K+", ["20_000_24_999", "25_000_29_999", "30_000_34_999", "35_000andOver"]]];
    const sum = (o, ks) => ks.reduce((s, k) => s + (o[k] || 0), 0);
    h += picto(bands.map(([l, ks], i) => [l, sum(c.hhinc, ks), ["#8a96ad", "#5aa7e6", "#57b26b", "#f2c14e", "#e2685b"][i]]), bands.map(([, ks]) => sum(NAT.hhinc, ks)), t("households"));
    h += `</div>`;
  } else if (c.pop >= 1000) h += `<div class="sec"><p class="note">${t("groupedNote")}</p></div>`;
  return h + `<div class="sec">${srcGHS}</div>`;
}

// ------------------------------------------------------------------ top bar
function renderTopbar() {
  $("#countryName").textContent = zh() ? "新加坡" : "SINGAPORE";
  const w = NAT.wind;
  const items = [
    ["👥", fmt(NAT.popTotal), t("residents"), "#ece6d6"],
    ["🌾", fmt(w.Services_AccommodationandFoodServices), t("food") + (zh() ? "：住宿与餐饮就业者" : ": hotel & food workers"), "var(--food)"],
    ["⚙️", fmt(w.Manufacturing + w.Construction), t("production") + (zh() ? "：制造与建筑就业者" : ": manufacturing & construction workers"), "var(--prod)"],
    ["🪙", money(NAT.gdp * 1e6), `${t("gold")} ${NAT.gdp_year}`, "var(--goldy)"],
    ["🧪", fmt(w.Services_InformationandCommunications1 + w.Services_ProfessionalServices), t("science") + (zh() ? "：资讯通讯与专业服务就业者" : ": info-comm & professional workers"), "var(--sci)"],
    ["🎭", fmt(w.Services_Arts_SportsandRecreation), t("culture") + (zh() ? "：艺术娱乐就业者" : ": arts & recreation workers"), "var(--cult)"],
    ["💼", pct(NAT.x.unemp, 1), t("unemployment"), "#ece6d6"],
  ];
  $("#stats").innerHTML = items.map(([i, v, title, col]) => `<span class="stat" title="${esc(title)}"><span class="ic">${i}</span><span style="color:${col}">${v}</span></span>`).join("");
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  $("#search").placeholder = t("search");
  $("#langBtn").textContent = t("langName");
  document.documentElement.lang = zh() ? "zh" : "en";
}

// ------------------------------------------------------------------ search
function searchItems() {
  const items = [];
  for (const c of S.D.cities) items.push({ label: c.name, alt: c.zh, kind: t("cityView").split("·")[1]?.trim() || "", go: () => openCity(c, true) });
  for (const st of S.D.stations) items.push({ label: st.n, alt: st.zh || "", kind: t("station"), go: () => flyTo(st.x, st.y, Math.max(S.cam.z, 0.06)) });
  for (const w of S.D.wonders) if (w.h != null) items.push({ label: w.n, alt: w.zh, kind: t("s_wonder"), go: () => flyTo(CX[w.h], CY[w.h], Math.max(S.cam.z, 0.05)) });
  for (const s of S.D.sites) if (["monument", "hawker", "attraction", "university", "power", "historic"].includes(s.k)) items.push({ label: s.n, alt: s.zh || "", kind: t("s_" + s.k), go: () => flyTo(CX[s.h], CY[s.h], Math.max(S.cam.z, 0.07)) });
  return items;
}
let SEARCH = [], searchSel = 0;
function doSearch() {
  const q = $("#search").value.trim().toLowerCase(), box = $("#searchResults");
  if (!q) { box.classList.remove("open"); return; }
  const res = SEARCH.filter((it) => it.label.toLowerCase().includes(q) || (it.alt && it.alt.includes(q))).sort((a, b) => a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q)).slice(0, 12);
  searchSel = 0;
  box.innerHTML = res.map((r, i) => `<div data-i="${i}" class="${i === 0 ? "act" : ""}"><span>${esc(zh() && r.alt ? r.alt : r.label)}${r.alt && !zh() ? ` <small>${esc(r.alt)}</small>` : ""}</span><small>${esc(r.kind)}</small></div>`).join("");
  box.classList.toggle("open", res.length > 0);
  box._res = res;
  box.querySelectorAll("div").forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); res[+d.dataset.i].go(); box.classList.remove("open"); $("#search").blur(); }));
}
$("#search").addEventListener("input", doSearch);
$("#search").addEventListener("keydown", (e) => {
  const box = $("#searchResults"), res = box._res || [];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { searchSel = (searchSel + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; box.querySelectorAll("div").forEach((d, i) => d.classList.toggle("act", i === searchSel)); e.preventDefault(); }
  if (e.key === "Enter" && res[searchSel]) { res[searchSel].go(); box.classList.remove("open"); e.target.blur(); }
});
$("#search").addEventListener("blur", () => setTimeout(() => $("#searchResults").classList.remove("open"), 150));

// ------------------------------------------------------------------ almanac
const ALM = ["about", "yields", "terrain", "lenses", "districts", "wonders", "sources"];
function openAlmanac(page) {
  S.almanac = page || S.almanac;
  $("#almanac").classList.remove("hidden");
  $("#almanacNav").innerHTML = `<h2>${t("almanac").toUpperCase()}</h2>` + ALM.map((k) => `<button data-p="${k}" class="${S.almanac === k ? "on" : ""}">${t("a_" + k)}</button>`).join("");
  $("#almanacNav").querySelectorAll("button").forEach((b) => (b.onclick = () => openAlmanac(b.dataset.p)));
  $("#almanacBody").innerHTML = almanacPage(S.almanac);
  $("#almanacBody").scrollTop = 0;
}
function almanacPage(p) {
  const Z = zh();
  const n = NAT;
  if (p === "about") return Z ? `<h1>📖 关于本地图</h1>
    <p>这是真实的新加坡，以策略游戏的方式绘制。没有任何虚构：每一个格子、市镇和数字都来自公开数据，详见「数据来源」。灵感来自 Andrej Karpathy 的 <a href="https://karpathy.ai/usaciv/" target="_blank" rel="noopener">usaciv</a>（美国版）。</p>
    <h3>如何构建</h3><p>新加坡及周边海域被投影到本地平面坐标，并切成 ${M.cols}×${M.rows} 个六边形，每个角到角 600 米（约 0.23 平方公里）。每个格子取 19 个采样点：采样点落在哪个规划区、哪种市建局 2025 总蓝图分区、哪种国家公园局海岸生境，决定了格子的归属和地形。</p>
    <p><b>市镇</b>是市建局的 55 个规划区。人口、年龄、种族、宗教、语言、学历、收入、住房和通勤来自统计局 2025 年家庭调查（GHS 2025）。区内人口按住宅分区面积分配到各个格子；岗位按商业、商业园和工业分区分配。</p>
    <h3>操作</h3><p>${t("keys")}</p><p>地址栏始终保存当前视角（位置、视图、选中市镇、语言），点击「分享」即可复制链接。</p>`
    : `<h1>📖 About this map</h1>
    <p>This is the real Singapore, drawn like a strategy game. Nothing is invented: every tile, town and number comes from public data, listed under <i>Sources</i>. Inspired by Andrej Karpathy's <a href="https://karpathy.ai/usaciv/" target="_blank" rel="noopener">usaciv</a> for the United States.</p>
    <h3>How it's built</h3><p>Singapore and its waters are projected to local metres and cut into ${M.cols}×${M.rows} hexes, each 600 m corner to corner (about 0.23 km²). Every hex is probed at 19 sample points; the planning area, URA Master Plan 2025 zoning and NParks coastal habitat under those points decide which town the hex belongs to and what its terrain is.</p>
    <p><b>Towns</b> are URA's 55 planning areas. Population, age, ethnicity, religion, language, education, income, housing and commuting come from SingStat's General Household Survey 2025. A town's residents are spread over its hexes by residential zoning; its jobs by commercial, business-park and industrial zoning.</p>
    <h3>Controls</h3><p>${t("keys")}</p><p>The address bar always holds a link to what you're looking at (place, lens, town and language); use <i>Share</i> to copy it.</p>`;
  if (p === "yields") {
    const rows = [["🌾", t("food"), Z ? "在本区工作的住宿与餐饮业居民就业者（统计局 GHS 2025，按工作地点）。新加坡人的粮仓是小贩中心，不是农田。" : "Residents working in accommodation & food services, counted where they work (GHS 2025). In Singapore, food comes from hawker centres, not farms."],
      ["⚙️", t("production"), Z ? "制造业与建筑业居民就业者，按工作地点。" : "Residents working in manufacturing and construction, counted where they work."],
      ["🪙", t("gold"), Z ? `全国 ${n.gdp_year} 年按行业的现价 GDP（统计局），按在每个规划区工作的居民人数分摊到各区；业主自住和产品税按比例分摊。新加坡不公布分区 GDP，所以这是估算。` : `Singapore's ${n.gdp_year} GDP at current prices by industry (SingStat), shared out to planning areas by the residents who work there in each industry; ownership of dwellings and taxes on products are spread pro rata. Singapore publishes no GDP by area, so this is an estimate.`],
      ["🧪", t("science"), Z ? "资讯通讯与专业服务业居民就业者，按工作地点。" : "Residents working in information & communications and professional services, counted where they work."],
      ["🎭", t("culture"), Z ? "艺术、娱乐与休闲业居民就业者，按工作地点。" : "Residents working in arts, entertainment & recreation, counted where they work."]];
    return `<h1>${t("a_yields")}</h1><p>${Z ? "文明系列的产出对应到真实指标。注意：家庭调查只统计居民（公民与永久居民），不包括约一百多万名外籍员工，所以大士、裕廊岛等工业区的岗位被低估。" : "Civilization's yields mapped onto real measures. Note: the household survey counts residents (citizens and PRs) only, not Singapore's 1M+ foreign workers, so jobs in industrial areas such as Tuas and Jurong Island are undercounted."}</p>
      <table>${rows.map((r) => `<tr><td style="font-size:18px">${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`).join("")}</table>
      <h3>${Z ? "全国概况" : "The nation"}</h3><table>
      <tr><td>${Z ? "居民人口（GHS 2025）" : "Resident population (GHS 2025)"}</td><td>${NAT.popTotal.toLocaleString()}</td></tr>
      <tr><td>GDP ${n.gdp_year}</td><td>${money(n.gdp * 1e6)}${n.gdp_prev ? ` (${n.gdp >= n.gdp_prev ? "+" : ""}${pct(n.gdp / n.gdp_prev - 1, 1)})` : ""}</td></tr>
      <tr><td>${Z ? "发电量" : "Electricity generated"} ${n.elec_year}</td><td>${fmt(n.elec_gwh)} GWh</td></tr>
      <tr><td>${Z ? "集装箱吞吐量" : "Container throughput"} ${n.teu_year}</td><td>${(n.teu_k / 1000).toFixed(1)}M TEU</td></tr>
      <tr><td>${Z ? "樟宜机场旅客" : "Changi Airport passengers"} ${n.changi_year}</td><td>${fmt(n.changi_pax)}</td></tr></table>`;
  }
  if (p === "terrain") {
    const desc = {
      urban: Z ? "住宅、商业、商业园、公共机构、学校与道路分区合计 ≥ 45%。" : "Residential, commercial, business park, civic, education and road zoning together ≥ 45% of the hex.",
      industrial: Z ? "工业（B1/B2）、公用事业与港口/机场分区占主导。" : "Industrial (Business 1/2), utility and port/airport zoning dominate.",
      rainforest: Z ? "宪报自然保护区或国家公园，或植被覆盖的空地与特殊用途地。" : "Gazetted nature reserve or national park, or vegetated open space and special-use land.",
      parkland: Z ? "公园、体育场地与未建设的空地。" : "Parks, sports grounds and unbuilt open space.",
      mangrove: Z ? "国家公园局 2018 海岸生境图中的红树林占多数采样点。" : "Mangrove covers most sample points in NParks' 2018 coastal habitat map.",
      farmland: Z ? "农业分区（林厝港、双溪登加一带的农场）。" : "Agriculture zoning (the farms of Lim Chu Kang and Sungei Tengah).",
      reclaimed: Z ? "保留地：大多为尚未开发的填海地。" : "Reserve sites: mostly reclaimed land not yet built on.",
      reservoir: Z ? "水体分区占一半以上：蓄水池与河道。" : "Waterbody zoning covers half the hex: reservoirs and canals.",
      coast: Z ? "离陆地两格以内的海面，或浅水、珊瑚生境。" : "Sea within two hexes of land, or shallow-water and coral habitat.",
      ocean: Z ? "更远的海峡水域。" : "Open strait further out.",
    };
    return `<h1>${t("a_terrain")}</h1><p>${t("lg_terrain")}. ${Z ? "地形基色来自 19 个采样点的分区组合；丘陵来自 SRTM 30 米高程（平均海拔 ≥ 45 米），阴影来自与西北邻格的高差。" : "The base colour comes from the zoning mix at 19 sample points; hills come from SRTM 30 m elevation (mean ≥ 45 m) and shading from the height difference with the north-west neighbour."}</p>
      <table>${Object.entries(desc).map(([k, d]) => `<tr><td><span class="sw" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${TERRAIN_COL[k]}"></span></td><td><b>${t("t_" + k)}</b></td><td>${d}</td></tr>`).join("")}</table>
      <h3>${Z ? "边界之外" : "Beyond the borders"}</h3><p>${Z ? "马来西亚（柔佛）和印度尼西亚（巴淡、民丹）的陆地取自 Natural Earth 1:10m，仅作参照，不作细致绘制。" : "Malaysian (Johor) and Indonesian (Batam, Bintan) land comes from Natural Earth 1:10m and is shown for context only."}</p>`;
  }
  if (p === "lenses") return `<h1>${t("a_lenses")}</h1><table>${LENSES.map((l) => `<tr><td>${l.ic}</td><td><b>${t("l_" + l.id)}</b></td><td>${t("lg_" + l.id)}</td></tr>`).join("")}</table>
    <p class="note">${Z ? "以规划区为单位的视图（收入、年龄、学历、住房、通勤、种族、宗教、语言）把同一数值涂满整个规划区。统计局只为较大的市镇公布部分表格，其余合并为「其他」，显示为灰色。" : "Planning-area lenses (income, age, degrees, housing, commute, ethnicity, faith, language) paint the whole town one value. SingStat publishes some tables only for the larger towns and groups the rest as \"Others\"; those show grey."}</p>`;
  if (p === "districts") {
    const ds = ["commercial", "campus", "industrial", "logistics", "entertainment", "theater", "government", "hospital", "market", "builders", "aerodrome", "harbor", "encampment", "preserve", "reservoir", "farm", "neighborhood"];
    return `<h1>${t("a_districts")}</h1><p>${t("howDistricts")}</p><table><tr><th></th><th>${Z ? "区域" : "District"}</th><th>${Z ? "规则" : "Rule"}</th></tr>${ds.map((d) => {
      const col = Object.entries(IND_DISTRICT).filter(([, v]) => v === d).map(([k]) => t("i_" + k));
      const rule = col.length ? (Z ? `${col.join("、")}：区位商 ≥ 1.5 且 ≥ 1,000 个岗位` : `${col.join(" or ")}: location quotient ≥ 1.5 and ≥ 1,000 jobs`)
        : { aerodrome: Z ? "区内有机场或空军基地（樟宜、实里达、巴耶利峇、登加、三巴旺）" : "Holds an airport or air base (Changi, Seletar, Paya Lebar, Tengah, Sembawang)", harbor: Z ? "≥ 3 个沿海港口分区格子" : "≥ 3 coastal hexes zoned port", encampment: Z ? "特殊用途分区采样 ≥ 40" : "≥ 40 sample points zoned special use", preserve: Z ? "≥ 6 个自然保护区/国家公园格子" : "≥ 6 nature reserve or national park hexes", reservoir: Z ? "≥ 4 个蓄水池格子" : "≥ 4 reservoir hexes", farm: Z ? "农业分区采样 ≥ 30" : "≥ 30 sample points zoned agriculture", neighborhood: Z ? "≥ 70% 居民住组屋且人口 ≥ 5 万" : "≥ 70% of residents in HDB flats and population ≥ 50,000" }[d];
      return `<tr><td style="font-size:17px">${DIST_ICON[d]}</td><td><b>${t("dist_" + d)}</b><br><small style="color:var(--muted)">${t("distd_" + d)}</small></td><td>${rule}</td></tr>`;
    }).join("")}</table>`;
  }
  if (p === "wonders") return `<h1>${t("a_wonders")}</h1><p>${Z ? "奇观按公开的规则或认定挑选，而不是凭感觉。" : "Wonders are chosen by published rules or designations, not by taste."}</p><table>${S.D.wonders.map((w) => `<tr><td style="font-size:18px">${WONDER_ICON[w.icon]}</td><td><b>${esc(Z ? w.zh : w.n)}</b>${w.at ? `<br><small style="color:var(--muted)">${esc(w.at)}${w.v ? " · " + w.v + " " + (w.id === "mbs" ? t("rooms") : t("seats")) : ""}</small>` : ""}</td><td>${esc(Z ? w.rule_zh : w.rule)}${w.id === "changi" ? ` ${fmt(n.changi_pax)} (${n.changi_year})` : w.id === "port" ? ` ${(n.teu_k / 1000).toFixed(1)}M TEU (${n.teu_year})` : ""}</td></tr>`).join("")}</table>`;
  if (p === "sources") {
    const src = Object.entries(S.D.sources).map(([f, m]) => `<tr><td><b>${esc(m.name)}</b><br><code>${esc(m.page)}</code></td><td>${esc(m.fetched)}</td><td>${(m.bytes / 1e6).toFixed(1)} MB</td></tr>`).join("");
    return `<h1>${t("a_sources")}</h1><p>${Z ? "所有数据都可公开下载。构建脚本在 build/ 目录，可以重新运行。" : "Every dataset is publicly downloadable. The build scripts in build/ re-run the whole pipeline."}</p>
      <h3>data.gov.sg</h3><p class="note">${Z ? "新加坡开放数据许可证 1.0 版。" : "Singapore Open Data Licence v1.0."}</p><table><tr><th>${Z ? "数据集" : "Dataset"}</th><th>${Z ? "下载日期" : "Fetched"}</th><th>${Z ? "大小" : "Size"}</th></tr>${src}</table>
      <h3>OpenStreetMap</h3><p>${Z ? "地铁线路颜色与走向、车站中文名、发电厂及装机容量、宗教场所、大学、山峰。© OpenStreetMap 贡献者，ODbL。" : "MRT/LRT route geometry, station Chinese names, power plants and capacity, places of worship, universities, peaks. © OpenStreetMap contributors, ODbL."}</p>
      <h3>OpenTopoData · SRTM 30 m</h3><p>${Z ? "每个陆地格子 7 个点的平均海拔。" : "Mean elevation of 7 points per land hex."}</p>
      <h3>Natural Earth 1:10m</h3><p>${Z ? "马来西亚与印度尼西亚的陆地轮廓（公有领域）。" : "Malaysia and Indonesia land outlines (public domain)."}</p>
      <h3>${Z ? "奇观规则" : "Wonder rules"}</h3><p>${Z ? "联合国教科文组织世界遗产与非物质文化遗产名录、QS 世界大学排名 2026、东盟遗产公园与拉姆萨尔湿地名录。" : "UNESCO World Heritage and Intangible Cultural Heritage lists, QS World University Rankings 2026, ASEAN Heritage Parks and the Ramsar list."}</p>`;
  }
  return "";
}

// ------------------------------------------------------------------ URL hash
function saveHash(fromUser = true) {
  if (fromUser && S.D && saveHash.ready) S.userMoved = true;
  const p = [`at=${Math.round(S.cam.x)},${Math.round(S.cam.y)},${S.cam.z.toFixed(4)}`];
  if (S.lens !== "terrain") p.push("lens=" + S.lens);
  if (S.sel) p.push("city=" + S.sel.id);
  if (zh()) p.push("lang=zh");
  history.replaceState(null, "", "#" + p.join("&"));
}
function loadHash() {
  const q = Object.fromEntries(location.hash.slice(1).split("&").filter(Boolean).map((kv) => kv.split("=")));
  if (q.lang === "zh") S.lang = "zh";
  if (q.at) { const [x, y, z] = q.at.split(",").map(Number); if (isFinite(x) && isFinite(y) && z > 0) { S.cam = { x, y, z: Math.max(S.minZ, Math.min(S.maxZ, z)) }; S.userMoved = true; } }
  if (q.lens && LENSES.some((l) => l.id === q.lens)) S.lens = q.lens;
  return q;
}

// ------------------------------------------------------------------ language
function setLang(l) {
  S.lang = l;
  try { localStorage.setItem("sgciv.lang", l); } catch (e) {}
  regionLabelPos = null;
  renderTopbar(); buildBanners(); renderLensMenu(); renderLegend(); SEARCH = searchItems();
  if (S.sel) renderPanel();
  if (!$("#almanac").classList.contains("hidden")) openAlmanac();
  redraw(); saveHash();
}

// ------------------------------------------------------------------ boot
let LAND_BB = null;
function fitView() {
  if (!LAND_BB) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < N; i++) if (!isWater(i) && H.t[i] !== T.foreign && H.pa[i] >= 0) { x0 = Math.min(x0, CX[i]); x1 = Math.max(x1, CX[i]); y0 = Math.min(y0, CY[i]); y1 = Math.max(y1, CY[i]); }
    LAND_BB = [x0, y0, x1, y1];
  }
  const [x0, y0, x1, y1] = LAND_BB;
  // fill the window: land bbox between the top bar (44px) and the lens bar (~56px), tiny side margins
  const top = 44, bottom = 52, w = Math.max(320, S.W - 8), h = Math.max(240, S.H - top - bottom);
  const fitZ = Math.min(w / (x1 - x0 + R * 2), h / (y1 - y0 + R * 2));
  S.minZ = fitZ * 0.55; S.maxZ = 70 / R;
  S.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (top - bottom) / 2 / fitZ, z: fitZ };
  S.userMoved = false;
}
async function boot() {
  try { const l = localStorage.getItem("sgciv.lang"); if (l) S.lang = l; } catch (e) {}
  const D = await (await fetch("data/sgciv.json")).json();
  S.D = D;
  prepare();
  resize();
  fitView();
  const q = loadHash();
  buildColors(); buildMinimap(); renderTopbar(); buildBanners(); renderLensMenu(); setLens(S.lens);
  SEARCH = searchItems();
  if (q.city && cityById[q.city]) openCity(cityById[q.city], false);
  $("#loading").classList.add("hidden");
  saveHash.ready = true;
  redraw();
}
window.addEventListener("resize", () => { resize(); if (S.D && !S.userMoved && !S.sel) fitView(); });
document.querySelectorAll("#lensbar [data-lens]").forEach((b) => (b.onclick = () => setLens(b.dataset.lens)));
document.querySelectorAll("#lensbar [data-quick]").forEach((b) => (b.onclick = () => toggleQuick(b.dataset.quick)));
$("#lensMore").onclick = (e) => { e.stopPropagation(); $("#lensMenu").classList.toggle("hidden"); };
document.addEventListener("click", (e) => { if (!e.target.closest("#lensMenu") && !e.target.closest("#lensMore")) closeLensMenu(); });
$("#langBtn").onclick = () => setLang(zh() ? "en" : "zh");
$("#legend").onclick = () => $("#legend").classList.toggle("open");
$("#almanacBtn").onclick = () => openAlmanac();
$("#helpBtn").onclick = () => openAlmanac("about");
$("#almanacClose").onclick = () => $("#almanac").classList.add("hidden");
$("#almanac").onclick = (e) => { if (e.target.id === "almanac") $("#almanac").classList.add("hidden"); };
$("#flag").onclick = () => { closeCity(); const c = { ...S.cam }; fitView(); const f = { ...S.cam }; S.cam = c; flyTo(f.x, f.y, f.z); };
$("#shareBtn").onclick = async () => {
  saveHash();
  try { await navigator.clipboard.writeText(location.href); } catch (e) {}
  const tt = $("#toast"); tt.textContent = t("copied"); tt.classList.remove("hidden"); setTimeout(() => tt.classList.add("hidden"), 1400);
};
boot();
