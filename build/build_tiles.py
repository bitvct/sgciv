"""Reconcile every downloaded dataset onto one hex grid and write web/data/sgciv.json.

Run after build/fetch_datagov.py, build/fetch_osm.sh and build/fetch_elevation.py:
    python3 -I build/build_tiles.py

Grid: pointy-top hexes, R = 300 m (600 m corner to corner), local equirectangular
projection centred on Singapore. Every hex is probed at 19 sample points; terrain,
land use, habitats and planning area come from those samples.
"""
import csv, json, math, os, re, collections, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "data", "raw")
OUT = os.path.join(HERE, "..", "web", "data", "sgciv.json")

# ---------------------------------------------------------------- projection / grid
LON0, LAT0 = 103.82, 1.35
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 110574.0
BBOX = (103.25, 0.80, 104.45, 1.85)  # lon0, lat0, lon1, lat1 (Singapore plus southern Johor / Riau Islands context)
R = 300.0
SQ3 = math.sqrt(3)


def proj(lon, lat):
    """lon/lat -> metres, x east, y SOUTH (screen-like)."""
    return (lon - LON0) * KX, -(lat - LAT0) * KY


X0, Y0 = proj(BBOX[0], BBOX[3])  # top-left
X1, Y1 = proj(BBOX[2], BBOX[1])
COLS = int((X1 - X0) / (SQ3 * R)) + 1
ROWS = int((Y1 - Y0) / (1.5 * R)) + 1


def hex_center(c, r):
    return X0 + SQ3 * R * (c + 0.5 * (r & 1)), Y0 + 1.5 * R * r


def hex_at(x, y):
    """metres -> (col,row) of containing hex (odd-r offset)."""
    q = (SQ3 / 3 * (x - X0) - 1 / 3 * (y - Y0)) / R
    rr = (2 / 3 * (y - Y0)) / R
    # cube round
    cx, cz = q, rr
    cy = -cx - cz
    rx, ry, rz = round(cx), round(cy), round(cz)
    dx, dy, dz = abs(rx - cx), abs(ry - cy), abs(rz - cz)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    col = rx + (rz - (rz & 1)) // 2
    return int(col), int(rz)


def neighbours(c, r):
    if r & 1:
        d = [(1, 0), (-1, 0), (0, -1), (1, -1), (0, 1), (1, 1)]
    else:
        d = [(1, 0), (-1, 0), (-1, -1), (0, -1), (-1, 1), (0, 1)]
    for dc, dr in d:
        cc, rr = c + dc, r + dr
        if 0 <= cc < COLS and 0 <= rr < ROWS:
            yield cc, rr


# 19 sample offsets on a small triangular lattice inside the hex
SAMPLES = []
_d = R / 2.4
for i in range(-2, 3):
    for j in range(-2, 3):
        if abs(i + j) <= 2:
            SAMPLES.append((_d * (SQ3 * i + SQ3 / 2 * j), _d * 1.5 * j))
assert len(SAMPLES) == 19

# ---------------------------------------------------------------- polygon index


class PolyIndex:
    """Bucketed point-in-polygon index for projected polygons."""

    CELL = 600.0

    def __init__(self):
        self.polys = []  # (bbox, rings, value)
        self.buckets = collections.defaultdict(list)

    def add_geometry(self, geom, value):
        if not geom:
            return
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]] if geom["type"] == "Polygon" else []
        for poly in polys:
            rings = [[proj(p[0], p[1]) for p in ring] for ring in poly]
            xs = [p[0] for p in rings[0]]
            ys = [p[1] for p in rings[0]]
            bb = (min(xs), min(ys), max(xs), max(ys))
            idx = len(self.polys)
            self.polys.append((bb, rings, value))
            for bx in range(int(bb[0] // self.CELL), int(bb[2] // self.CELL) + 1):
                for by in range(int(bb[1] // self.CELL), int(bb[3] // self.CELL) + 1):
                    self.buckets[(bx, by)].append(idx)

    @staticmethod
    def _in_ring(x, y, ring):
        inside = False
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
                inside = not inside
            j = i
        return inside

    def query(self, x, y, first=True):
        out = []
        for idx in self.buckets.get((int(x // self.CELL), int(y // self.CELL)), ()):
            bb, rings, value = self.polys[idx]
            if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]):
                continue
            if self._in_ring(x, y, rings[0]) and not any(self._in_ring(x, y, h) for h in rings[1:]):
                if first:
                    return value
                out.append(value)
        return None if first else out


class ScanMask:
    """Point-in-polygon for a few huge polygons (country outlines): even-odd crossings
    per horizontal scanline, cached by y. Far faster than ring walks on 10k-vertex rings."""

    def __init__(self):
        self.edges = collections.defaultdict(list)  # value -> [(x0,y0,x1,y1)]
        self.cache = {}

    def add_geometry(self, geom, value):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        ymin, ymax = Y0 - 5000, Y1 + 5000
        for poly in polys:
            for ring in poly:
                pts = [proj(p[0], p[1]) for p in ring]
                for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                    if max(ay, by) < ymin or min(ay, by) > ymax or ay == by:
                        continue
                    self.edges[value].append((ax, ay, bx, by))

    def _xs(self, value, y):
        key = (value, round(y, 1))
        xs = self.cache.get(key)
        if xs is None:
            xs = sorted(ax + (y - ay) * (bx - ax) / (by - ay) for ax, ay, bx, by in self.edges[value]
                        if (ay > y) != (by > y))
            self.cache[key] = xs
        return xs

    def query(self, x, y):
        import bisect
        for value in self.edges:
            if bisect.bisect_left(self._xs(value, y), x) % 2 == 1:
                return value
        return None


def load_geo(name):
    return json.load(open(os.path.join(RAW, name)))["features"]


def pt_of(feat):
    g = feat["geometry"]
    if g["type"] == "Point":
        return g["coordinates"][0], g["coordinates"][1]
    # polygon centroid (vertex mean of outer ring is enough here)
    ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def html_attr(desc, key):
    m = re.search(r"<th>%s</th>\s*<td>(.*?)</td>" % re.escape(key), desc or "")
    return m.group(1).strip() if m else None


# ---------------------------------------------------------------- CSV helpers


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    v = (v or "").strip().replace(",", "")
    if v in ("", "-", "na", "None"):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def read_table(name):
    """GHS-style table -> {row label: {col: value}}; '<PA> - Total' rows keyed by PA."""
    rows = {}
    with open(os.path.join(RAW, name), newline="", encoding="utf-8-sig") as f:
        rd = csv.reader(f)
        head = next(rd)
        for row in rd:
            if not row:
                continue
            label = row[0].strip()
            if " - Total" in label:
                label = label.replace(" - Total", "")
            elif name.startswith(("ghs_pop_", "census_pop_")) and label != "Total":
                continue  # subzone rows
            rows[label.upper()] = {h: num(v) for h, v in zip(head[1:], row[1:])}
    return rows


def read_series(name):
    out = {}
    with open(os.path.join(RAW, name), newline="", encoding="utf-8-sig") as f:
        rd = csv.reader(f)
        head = next(rd)
        for row in rd:
            out[row[0].strip()] = {h: num(v) for h, v in zip(head[1:], row[1:])}
    return out, head


# ---------------------------------------------------------------- names (zh)
PA_ZH = {
    "ANG MO KIO": "宏茂桥", "BEDOK": "勿洛", "BISHAN": "碧山", "BOON LAY": "文礼", "BUKIT BATOK": "武吉巴督",
    "BUKIT MERAH": "红山", "BUKIT PANJANG": "武吉班让", "BUKIT TIMAH": "武吉知马", "CENTRAL WATER CATCHMENT": "中央集水区",
    "CHANGI": "樟宜", "CHANGI BAY": "樟宜湾", "CHOA CHU KANG": "蔡厝港", "CLEMENTI": "金文泰", "DOWNTOWN CORE": "市中心",
    "GEYLANG": "芽笼", "HOUGANG": "后港", "JURONG EAST": "裕廊东", "JURONG WEST": "裕廊西", "KALLANG": "加冷",
    "LIM CHU KANG": "林厝港", "MANDAI": "万礼", "MARINA EAST": "滨海东", "MARINA SOUTH": "滨海南", "MARINE PARADE": "马林百列",
    "MUSEUM": "博物馆", "NEWTON": "纽顿", "NORTH-EASTERN ISLANDS": "东北部岛屿", "NOVENA": "诺维娜", "ORCHARD": "乌节",
    "OUTRAM": "欧南", "PASIR RIS": "白沙", "PAYA LEBAR": "巴耶利峇", "PIONEER": "先驱", "PUNGGOL": "榜鹅",
    "QUEENSTOWN": "女皇镇", "RIVER VALLEY": "里峇峇利", "ROCHOR": "梧槽", "SELETAR": "实里达", "SEMBAWANG": "三巴旺",
    "SENGKANG": "盛港", "SERANGOON": "实龙岗", "SIMPANG": "新邦", "SINGAPORE RIVER": "新加坡河", "SOUTHERN ISLANDS": "南部岛屿",
    "STRAITS VIEW": "海峡景", "SUNGEI KADUT": "双溪加株", "TAMPINES": "淡滨尼", "TANGLIN": "东陵", "TENGAH": "登加",
    "TOA PAYOH": "大巴窑", "TUAS": "大士", "WESTERN ISLANDS": "西部岛屿", "WESTERN WATER CATCHMENT": "西部集水区",
    "WOODLANDS": "兀兰", "YISHUN": "义顺",
}
REGION_ZH = {"CENTRAL REGION": "中区", "EAST REGION": "东区", "NORTH REGION": "北区", "NORTH-EAST REGION": "东北区", "WEST REGION": "西区"}

# ---------------------------------------------------------------- land use groups
LU_GROUP = {
    "RESIDENTIAL": "res", "RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY": "res", "COMMERCIAL & RESIDENTIAL": "res",
    "RESIDENTIAL / INSTITUTION": "res",
    "COMMERCIAL": "com", "HOTEL": "com", "WHITE": "com", "COMMERCIAL / INSTITUTION": "com",
    "BUSINESS PARK": "bpk", "BUSINESS PARK - WHITE": "bpk",
    "BUSINESS 1": "ind", "BUSINESS 2": "ind", "BUSINESS 1 - WHITE": "ind", "BUSINESS 2 - WHITE": "ind", "UTILITY": "ind",
    "PORT / AIRPORT": "port", "SPECIAL USE": "mil",
    "OPEN SPACE": "open", "PARK": "park", "SPORTS & RECREATION": "park", "BEACH AREA": "beach",
    "RESERVE SITE": "reserve", "AGRICULTURE": "agri", "WATERBODY": "water",
    "EDUCATIONAL INSTITUTION": "edu", "CIVIC & COMMUNITY INSTITUTION": "civic", "HEALTH & MEDICAL CARE": "civic",
    "PLACE OF WORSHIP": "civic", "CEMETERY": "civic",
    "ROAD": "road", "TRANSPORT FACILITIES": "road", "MASS RAPID TRANSIT": "road", "LIGHT RAPID TRANSIT": "road",
}
LU_KEYS = ["res", "com", "bpk", "ind", "port", "mil", "open", "park", "beach", "reserve", "agri", "water", "edu", "civic", "road"]
HAB_GROUP = {
    "Mangrove": "mangrove", "Other Vegetation": "veg", "Coastal Vegetation": "veg", "Sandy Beach": "sand",
    "Sand and Rubble": "sand", "Sandflat": "flat", "Mudflat": "flat", "Openland": "openland",
    "Coral Reef Slope": "coral", "Coral on Rock Bund": "coral", "Coral Rubble with Seagrass and Algae": "coral",
    "Seagrass and Algae": "seagrass", "Seagrass Meadow": "seagrass", "Shallow Water": "shallow", "Water": "hwater",
}

# OSM route ref -> (English, Chinese, LTA colour, status). Official LTA line colours.
LINE_META = {
    "NSL": ("North-South Line", "南北线", "#d42e12", "open"),
    "EWL": ("East-West Line", "东西线", "#009645", "open"),
    "NEL": ("North East Line", "东北线", "#9900aa", "open"),
    "CCL": ("Circle Line", "环线", "#fa9e0d", "open"),
    "DTL": ("Downtown Line", "滨海市区线", "#005ec4", "open"),
    "TEL": ("Thomson-East Coast Line", "汤申—东海岸线", "#9d5b25", "open"),
    "JRL": ("Jurong Region Line", "裕廊区域线", "#0099aa", "construction"),
    "BPLRT": ("Bukit Panjang LRT", "武吉班让轻轨", "#748477", "open"),
    "SKLRT": ("Sengkang LRT", "盛港轻轨", "#748477", "open"),
    "PGLRT": ("Punggol LRT", "榜鹅轻轨", "#748477", "open"),
    "Sentosa": ("Sentosa Express", "圣淘沙捷运", "#e2a54b", "open"),
}

# Wonders: each chosen by a published rule or designation (see Almanac > Wonders).
WONDERS = [
    {"id": "botanic", "n": "Singapore Botanic Gardens", "zh": "新加坡植物园", "ll": (103.8159, 1.3138), "icon": "garden",
     "rule": "UNESCO World Heritage Site (inscribed 2015), Singapore's only one.",
     "rule_zh": "联合国教科文组织世界遗产（2015 年列入），新加坡唯一一处。"},
    {"id": "hawker", "n": "Hawker Culture", "zh": "小贩文化", "ll": None, "icon": "hawker",
     "rule": "UNESCO Intangible Cultural Heritage (2020). Placed at the hawker centre with the most cooked-food stalls in NEA's register.",
     "rule_zh": "联合国教科文组织非物质文化遗产（2020）。放在国家环境局名录中熟食摊位最多的小贩中心。"},
    {"id": "changi", "n": "Changi Airport", "zh": "樟宜机场", "ll": (103.9893, 1.3592), "icon": "airport",
     "rule": "Singapore's busiest airport by passengers (CAAS annual statistics).",
     "rule_zh": "按旅客量计新加坡最繁忙的机场（民航局年度统计）。"},
    {"id": "port", "n": "Port of Singapore", "zh": "新加坡港", "ll": (103.7570, 1.2735), "icon": "port",
     "rule": "Container throughput from MPA's annual series; placed at Pasir Panjang Terminal, with Tuas Port as its successor.",
     "rule_zh": "集装箱吞吐量取自海事及港务管理局年度数据；标在巴西班让码头，大士港为其接班者。"},
    {"id": "nus", "n": "National University of Singapore", "zh": "新加坡国立大学", "ll": (103.7764, 1.2966), "icon": "university",
     "rule": "QS World University Rankings 2026: #8 in the world (top 20 rule).",
     "rule_zh": "2026 QS 世界大学排名第 8（前 20 名规则）。"},
    {"id": "ntu", "n": "Nanyang Technological University", "zh": "南洋理工大学", "ll": (103.6831, 1.3483), "icon": "university",
     "rule": "QS World University Rankings 2026: #12 in the world (top 20 rule).",
     "rule_zh": "2026 QS 世界大学排名第 12（前 20 名规则）。"},
    {"id": "mbs", "n": "Marina Bay Sands", "zh": "滨海湾金沙", "ll": None, "icon": "hotel",
     "rule": "Largest hotel by room count in STB's licensed-hotel register.",
     "rule_zh": "新加坡旅游局持牌酒店名录中客房最多的酒店。"},
    {"id": "bthill", "n": "Bukit Timah Hill", "zh": "武吉知马山", "ll": (103.7764, 1.3546), "icon": "peak",
     "rule": "Highest natural point (SRTM elevation); inside an ASEAN Heritage Park.",
     "rule_zh": "全国最高自然点（SRTM 高程）；位于东盟遗产公园内。"},
    {"id": "cnr", "n": "Central Catchment Nature Reserve", "zh": "中央集水区自然保护区", "ll": (103.8100, 1.3640), "icon": "forest",
     "rule": "Largest gazetted nature reserve (URA Master Plan 2025 boundaries).",
     "rule_zh": "面积最大的宪报自然保护区（市建局 2025 总蓝图边界）。"},
    {"id": "sbwr", "n": "Sungei Buloh Wetland Reserve", "zh": "双溪布洛湿地保护区", "ll": (103.7300, 1.4460), "icon": "wetland",
     "rule": "ASEAN Heritage Park and Ramsar-listed wetland (2021).",
     "rule_zh": "东盟遗产公园，并于 2021 年列入《拉姆萨尔公约》国际重要湿地。"},
]

# Terrain ids (order matters for the client)
TERRAINS = ["ocean", "coast", "reservoir", "urban", "industrial", "rainforest", "parkland", "mangrove", "farmland",
            "reclaimed", "foreign"]
T = {k: i for i, k in enumerate(TERRAINS)}


def main():
    print(f"grid {COLS} x {ROWS} = {COLS*ROWS} hexes")
    # ---------- planning areas
    pa_feats = load_geo("geo_planning_areas.geojson")
    pa_index = PolyIndex()
    pas = []
    for f in pa_feats:
        p = f["properties"]
        pas.append({"name": p["PLN_AREA_N"], "code": p["PLN_AREA_C"], "region": p["REGION_N"],
                    "area_km2": round(float(p["SHAPE.AREA"]) / 1e6, 2)})
        pa_index.add_geometry(f["geometry"], len(pas) - 1)
    print("planning areas", len(pas))

    # ---------- land use (big)
    lu_index = PolyIndex()
    for f in load_geo("geo_land_use.geojson"):
        g = LU_GROUP.get(f["properties"]["LU_DESC"])
        if g:
            lu_index.add_geometry(f["geometry"], g)
    print("land use polygons", len(lu_index.polys))

    hab_index = PolyIndex()
    for f in load_geo("geo_coastal_habitat.geojson"):
        g = HAB_GROUP.get(f["properties"]["HABITAT_TYPE"])
        if g:
            hab_index.add_geometry(f["geometry"], g)
    print("habitat polygons", len(hab_index.polys))

    nr_index = PolyIndex()
    for f in load_geo("geo_nature_reserve.geojson"):
        nr_index.add_geometry(f["geometry"], f["properties"]["CLASSIFCTN"])

    jtc_index = PolyIndex()
    for f in load_geo("geo_jtc_estates.geojson"):
        jtc_index.add_geometry(f["geometry"], f["properties"]["ESTATE_NAME"])

    foreign_index = ScanMask()
    for f in load_geo("ne_10m_admin_0_countries.geojson"):
        a3 = f["properties"]["ADM0_A3"]
        if a3 in ("MYS", "IDN"):
            foreign_index.add_geometry(f["geometry"], a3)

    # ---------- elevation (optional)
    elev = {}  # (col,row) -> metres; elevation.json is keyed by "lon,lat" of sampled hex centres
    ep = os.path.join(RAW, "elevation.json")
    if os.path.exists(ep):
        for k, v in json.load(open(ep)).items():
            lon, lat = map(float, k.split(","))
            elev[hex_at(*proj(lon, lat))] = v

    # ---------- probe every hex
    N = COLS * ROWS
    terrain = [0] * N
    pa_of = [-1] * N
    lu = [None] * N
    habs = [None] * N
    flags = [0] * N  # 1 nature reserve, 2 national park, 4 coral, 8 beach, 16 seagrass
    jtc = [None] * N
    landfrac = [0.0] * N
    foreign = [None] * N
    for r in range(ROWS):
        for c in range(COLS):
            i = r * COLS + c
            cx, cy = hex_center(c, r)
            pa_votes = collections.Counter()
            luc = collections.Counter()
            hc = collections.Counter()
            nland = 0
            nr_hits = collections.Counter()
            fhits = collections.Counter()
            jhits = collections.Counter()
            for dx, dy in SAMPLES:
                x, y = cx + dx, cy + dy
                pa = pa_index.query(x, y)
                h = hab_index.query(x, y)
                if h:
                    hc[h] += 1
                if pa is None:
                    fa = foreign_index.query(x, y)
                    if fa:
                        fhits[fa] += 1
                    continue
                nland += 1
                pa_votes[pa] += 1
                g = lu_index.query(x, y)
                if g:
                    luc[g] += 1
                n = nr_index.query(x, y)
                if n:
                    nr_hits[n] += 1
                j = jtc_index.query(x, y)
                if j:
                    jhits[j] += 1
            landfrac[i] = nland / 19
            if pa_votes:
                pa_of[i] = pa_votes.most_common(1)[0][0]
            lu[i] = dict(luc)
            habs[i] = dict(hc)
            if nr_hits:
                top = nr_hits.most_common(1)[0][0]
                if sum(nr_hits.values()) >= 5:
                    flags[i] |= 2 if top == "NATIONAL PARK" else 1
            if hc.get("coral", 0) >= 2:
                flags[i] |= 4
            if hc.get("sand", 0) >= 2 or luc.get("beach", 0) >= 2:
                flags[i] |= 8
            if hc.get("seagrass", 0) >= 2:
                flags[i] |= 16
            if jhits and sum(jhits.values()) >= 5:
                jtc[i] = jhits.most_common(1)[0][0]
            if fhits and sum(fhits.values()) >= 8 and nland < 6:
                foreign[i] = fhits.most_common(1)[0][0]
        if r % 10 == 0:
            print(f"  row {r}/{ROWS}")

    # ---------- terrain classification
    is_land = [landfrac[i] >= 0.37 for i in range(N)]
    for r in range(ROWS):
        for c in range(COLS):
            i = r * COLS + c
            if foreign[i] and not is_land[i]:
                terrain[i] = T["foreign"]
                continue
            if not is_land[i]:
                terrain[i] = T["ocean"]
                continue
            L = lu[i]
            tot = max(1, sum(L.values()))
            share = {k: L.get(k, 0) / tot for k in LU_KEYS}
            built = share["res"] + share["com"] + share["bpk"] + share["civic"] + share["edu"] + share["road"]
            indus = share["ind"] + share["port"]
            H = habs[i]
            if share["water"] >= 0.5:
                terrain[i] = T["reservoir"]
            elif H.get("mangrove", 0) >= 6:
                terrain[i] = T["mangrove"]
            elif flags[i] & 3:
                terrain[i] = T["rainforest"]
            elif indus >= 0.4 and indus >= built:
                terrain[i] = T["industrial"]
            elif built + indus >= 0.45:
                terrain[i] = T["urban"] if built >= indus else T["industrial"]
            elif share["agri"] >= 0.3:
                terrain[i] = T["farmland"]
            elif share["reserve"] >= 0.35 and H.get("veg", 0) < 6:
                terrain[i] = T["reclaimed"]
            elif share["mil"] >= 0.35 or share["open"] >= 0.3 or H.get("veg", 0) >= 8:
                terrain[i] = T["rainforest"] if H.get("veg", 0) >= 5 else T["parkland"]
            elif share["park"] >= 0.25:
                terrain[i] = T["parkland"]
            else:
                terrain[i] = T["urban"] if built + indus >= 0.3 else T["parkland"]
    # coast vs ocean: within 2 hexes of land, or shallow-water habitat
    land_set = {i for i in range(N) if is_land[i] or terrain[i] == T["foreign"]}
    dist = {i: 0 for i in land_set}
    frontier = list(land_set)
    for step in (1, 2):
        nxt = []
        for i in frontier:
            for cc, rr in neighbours(i % COLS, i // COLS):
                j = rr * COLS + cc
                if j not in dist:
                    dist[j] = step
                    nxt.append(j)
        frontier = nxt
    for i in range(N):
        if terrain[i] == T["ocean"] and (dist.get(i, 9) <= 2 or habs[i].get("shallow", 0) >= 6 or flags[i] & 4):
            terrain[i] = T["coast"]

    # ---------- stats tables
    pop = read_table("ghs_pop_age_sex.csv")
    pop20 = read_table("census_pop_age_sex.csv")
    eth = read_table("ghs_pop_ethnic.csv")
    dwell = read_table("ghs_pop_dwelling.csv")
    rel = read_table("ghs_religion.csv")
    qual = read_table("ghs_qualification.csv")
    lang = read_table("ghs_language.csv")
    hhinc = read_table("ghs_hh_income.csv")
    ten = read_table("ghs_tenancy.csv")
    lab = read_table("ghs_labour.csv")
    rind = read_table("ghs_res_industry.csv")
    rocc = read_table("ghs_res_occupation.csv")
    rtr = read_table("ghs_res_transport.csv")
    wind = read_table("ghs_work_industry.csv")
    winc = read_table("ghs_work_income.csv")

    # ---------- GDP allocation (current prices, latest year)
    gdp, gdp_head = read_series("gdp_current_industry.csv")
    gdp_year = gdp_head[1]
    g = lambda k: gdp[k][gdp_year]
    gdp_total = g("GDP At Current Market Prices")
    # map SSIC GDP lines -> GHS industry columns
    gva_by_col = {
        "Manufacturing": g("Manufacturing"),
        "Construction": g("Construction"),
        "Services_WholesaleandRetailTrade": g("Wholesale & Retail Trade"),
        "Services_TransportationandStorage": g("Transportation & Storage"),
        "Services_AccommodationandFoodServices": g("Accommodation & Food Services"),
        "Services_InformationandCommunications1": g("Information & Communications"),
        "Services_FinancialandInsuranceServices": g("Finance & Insurance"),
        "Services_RealEstateServices": g("Real Estate"),
        "Services_ProfessionalServices": g("Professional Services"),
        "Services_AdministrativeandSupportServices": g("Administrative & Support Services"),
        "Services_PublicAdministrationandEducation": g("Public Administration & Defence") + g("Education"),
        "Services_HealthandSocialServices": g("Health & Social Services"),
        "Services_Arts_SportsandRecreation": g("Arts, Entertainment & Recreation"),
        "Services_OtherCommunity_SocialandPersonalServices": g("Other Services - Others"),
        "Others2": g("Utilities") + g("Other Goods Industries"),
    }
    gva_sum = sum(gva_by_col.values())
    gdp_scale = gdp_total / gva_sum  # spreads ownership of dwellings + taxes pro rata
    pa_rows = [k for k in wind if k not in ("TOTAL",) and not k.startswith(("OTHER PLANNING", "NO FIXED", "WORKS FROM"))]
    col_tot = {k: sum(wind[p].get(k, 0) for p in pa_rows) for k in gva_by_col}
    pa_gdp = {}
    for p in pa_rows:
        v = 0.0
        for k, gva in gva_by_col.items():
            if col_tot[k]:
                v += gva * gdp_scale * wind[p].get(k, 0) / col_tot[k]
        pa_gdp[p] = v  # S$ million

    # ---------- per-hex population & jobs from planning-area totals
    res_w = [0.0] * N
    job_w = [0.0] * N
    for i in range(N):
        if pa_of[i] < 0 or terrain[i] in (T["foreign"],):
            continue
        L = lu[i]
        res_w[i] = L.get("res", 0)
        job_w[i] = L.get("com", 0) * 3 + L.get("bpk", 0) * 2 + L.get("ind", 0) + L.get("port", 0) * 0.5 + L.get("edu", 0) * 0.5 + L.get("civic", 0) * 0.5
    pa_res_sum = collections.Counter()
    pa_job_sum = collections.Counter()
    for i in range(N):
        if pa_of[i] >= 0:
            pa_res_sum[pa_of[i]] += res_w[i]
            pa_job_sum[pa_of[i]] += job_w[i]
    hex_pop = [0] * N
    hex_jobs = [0] * N
    for i in range(N):
        p = pa_of[i]
        if p < 0:
            continue
        name = pas[p]["name"]
        ptot = pop.get(name, {}).get("Total_Total", 0)
        jtot = wind.get(name, {}).get("Total", 0)
        if pa_res_sum[p]:
            hex_pop[i] = round(ptot * res_w[i] / pa_res_sum[p])
        if pa_job_sum[p]:
            hex_jobs[i] = round(jtot * job_w[i] / pa_job_sum[p])

    # ---------- point layers -> hexes
    def hex_of_lonlat(lon, lat):
        x, y = proj(lon, lat)
        c, r = hex_at(x, y)
        if 0 <= c < COLS and 0 <= r < ROWS:
            return r * COLS + c
        return None

    sites = []  # {k: kind, n: name, h: hex, v: value, ...}

    def add_site(kind, name, lon, lat, **kw):
        h = hex_of_lonlat(lon, lat)
        if h is None:
            return
        s = {"k": kind, "n": name, "h": h}
        s.update({k: v for k, v in kw.items() if v not in (None, "", "None")})
        sites.append(s)

    for f in load_geo("geo_monuments.geojson"):
        p = f["properties"]
        add_site("monument", p["NAME"], *pt_of(f), url=p.get("HYPERLINK"), d=(p.get("DESCRIPTION") or "")[:240])
    for f in load_geo("geo_historic_sites.geojson"):
        p = f["properties"]
        add_site("historic", p["NAME"], *pt_of(f), url=p.get("HYPERLINK"), d=(p.get("DESCRIPTION") or "")[:240])
    for f in load_geo("geo_hawker_centres.geojson"):
        p = f["properties"]
        if p.get("STATUS") not in (None, "Existing", "Existing (new)", "Existing (replacement)"):
            continue
        add_site("hawker", p["NAME"], *pt_of(f), v=int(num(p.get("NUMBER_OF_COOKED_FOOD_STALLS"))), y=p.get("EST_ORIGINAL_COMPLETION_DATE"))
    for f in load_geo("geo_hotels.geojson"):
        p = f["properties"]
        add_site("hotel", p["NAME"], *pt_of(f), v=int(num(p.get("TOTALROOMS"))))
    for f in load_geo("geo_tourist_attractions.geojson"):
        p = f["properties"]
        add_site("attraction", p["PAGETITLE"], *pt_of(f), d=(p.get("OVERVIEW") or "").encode("latin1", "ignore").decode("utf8", "ignore")[:240] if p.get("OVERVIEW") else None)
    for f in load_geo("geo_libraries.geojson"):
        add_site("library", html_attr(f["properties"].get("Description"), "NAME") or "Library", *pt_of(f))
    for f in load_geo("geo_community_clubs.geojson"):
        add_site("cc", html_attr(f["properties"].get("Description"), "NAME") or "Community Club", *pt_of(f))
    clinics = collections.Counter()
    for f in load_geo("geo_chas_clinics.geojson"):
        h = hex_of_lonlat(*pt_of(f))
        if h is not None:
            clinics[h] += 1

    # rail stations (MP2025) -> hex + name
    stations = []
    seen = set()
    for f in load_geo("geo_rail_station.geojson"):
        p = f["properties"]
        nm = (p.get("NAME") or "").strip()
        if not nm or nm == "None":
            continue
        lon, lat = pt_of(f)
        key = (nm, round(lon, 3), round(lat, 3))
        if key in seen:
            continue
        seen.add(key)
        x, y = proj(lon, lat)
        stations.append({"n": nm.title(), "x": round(x), "y": round(y), "t": p.get("RAIL_TYPE"), "u": p.get("GRND_LEVEL") == "UNDERGROUND"})
    # merge stations with the same name (interchanges have several polygons)
    by_name = collections.defaultdict(list)
    for s in stations:
        by_name[s["n"]].append(s)
    stations = []
    for nm, ss in by_name.items():
        stations.append({"n": nm, "x": round(sum(s["x"] for s in ss) / len(ss)), "y": round(sum(s["y"] for s in ss) / len(ss)),
                         "t": ss[0]["t"], "u": any(s["u"] for s in ss)})

    # Chinese station names from OSM (matched by English name)
    zh_by_name = {}
    for el in (json.load(open(os.path.join(RAW, "osm_stations.json")))["elements"] if os.path.exists(os.path.join(RAW, "osm_stations.json")) else []):
        tg = el.get("tags", {})
        if tg.get("name:zh"):
            zh_by_name[(tg.get("name:en") or tg.get("name", "")).upper().replace(" MRT STATION", "").replace(" LRT STATION", "").strip()] = tg["name:zh"]
    for s in stations:
        z = zh_by_name.get(s["n"].upper())
        if z:
            s["zh"] = z

    # rail lines: prefer OSM route relations (named + coloured), else MP2025 geometry
    lines = []
    osm_routes = os.path.join(RAW, "osm_rail_routes.json")
    if os.path.exists(osm_routes):
        d = json.load(open(osm_routes))
        groups = collections.defaultdict(list)
        meta = {}
        for el in d.get("elements", []):
            t = el.get("tags", {})
            ref = t.get("ref") or t.get("name")
            # Only real service routes; skip proposed/under construction
            if t.get("state") in ("proposed",) or "proposed" in (t.get("name", "").lower()):
                continue
            key = (t.get("ref") or "").split()[0] if t.get("ref") else t.get("name")
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and m.get("role", "") in ("", "forward", "backward"):
                    pts = [proj(q["lon"], q["lat"]) for q in m["geometry"]]
                    groups[key].append([[round(a), round(b)] for a, b in pts])
            meta.setdefault(key, {"name": t.get("name:en") or t.get("name"), "zh": t.get("name:zh"),
                                   "color": t.get("colour"), "route": t.get("route"), "ref": t.get("ref")})
        for key, segs in groups.items():
            if key not in LINE_META:
                continue  # e.g. the airport Skytrain people-mover
            # dedupe identical segments (both directions)
            uniq = {}
            for s in segs:
                k2 = (tuple(s[0]), tuple(s[-1]))
                k3 = (tuple(s[-1]), tuple(s[0]))
                if k2 not in uniq and k3 not in uniq:
                    uniq[k2] = s
            en, zh, colour, status = LINE_META[key]
            lines.append({"key": key, "name": en, "zh": zh, "color": colour, "type": meta[key]["route"],
                          "status": status, "segs": list(uniq.values())})
    else:
        for f in load_geo("geo_rail_line.geojson"):
            gg = f["geometry"]
            parts = gg["coordinates"] if gg["type"] == "MultiLineString" else [gg["coordinates"]]
            for part in parts:
                pts = [proj(q[0], q[1]) for q in part]
                lines.append({"key": f["properties"]["RAIL_TYPE"], "name": f["properties"]["RAIL_TYPE"], "color": "#9a8f7a",
                              "segs": [[[round(a), round(b)] for a, b in pts]]})

    # OSM extras: power plants, worship, universities, peaks, aero/military
    osm = lambda n: json.load(open(os.path.join(RAW, n)))["elements"] if os.path.exists(os.path.join(RAW, n)) else []

    def osm_ll(el):
        if "lat" in el:
            return el["lon"], el["lat"]
        if "center" in el:
            return el["center"]["lon"], el["center"]["lat"]
        return None

    for el in osm("osm_power.json"):
        t = el.get("tags", {})
        ll = osm_ll(el)
        if not ll or not t.get("name"):
            continue
        mw = num(re.sub(r"[^0-9.]", "", (t.get("plant:output:electricity") or "").split(";")[0])) if t.get("plant:output:electricity") else 0
        if "GW" in (t.get("plant:output:electricity") or ""):
            mw *= 1000
        add_site("power", t.get("name:en") or t["name"], *ll, zh=t.get("name:zh"), src=t.get("plant:source"), v=round(mw) or None)
    for el in osm("osm_worship.json"):
        t = el.get("tags", {})
        ll = osm_ll(el)
        if not ll:
            continue
        add_site("worship", t.get("name:en") or t.get("name") or "", *ll, rel=t.get("religion"), zh=t.get("name:zh"))
    for el in osm("osm_universities.json"):
        t = el.get("tags", {})
        ll = osm_ll(el)
        if ll and t.get("name"):
            add_site("university", t.get("name:en") or t["name"], *ll, zh=t.get("name:zh"))
    for el in osm("osm_peaks.json"):
        t = el.get("tags", {})
        if t.get("name"):
            add_site("peak", t.get("name:en") or t["name"], el["lon"], el["lat"], v=num(t.get("ele")) or None, zh=t.get("name:zh"))

    # ---------- wonders (rule-based placement)
    wonders = []
    for w in WONDERS:
        w = dict(w)
        if w["id"] == "hawker":
            top = max((s for s in sites if s["k"] == "hawker"), key=lambda s: s.get("v", 0))
            w["h"] = top["h"]
            w["at"] = top["n"]
            w["v"] = top.get("v")
        elif w["id"] == "mbs":
            top = max((s for s in sites if s["k"] == "hotel"), key=lambda s: s.get("v", 0))
            w["h"] = top["h"]
            w["at"] = top["n"]
            w["v"] = top.get("v")
        else:
            w["h"] = hex_of_lonlat(*w["ll"])
        w.pop("ll", None)
        wonders.append(w)

    # ---------- cities (planning areas)
    pa_hexes = collections.defaultdict(list)
    for i in range(N):
        if pa_of[i] >= 0 and is_land[i]:
            pa_hexes[pa_of[i]].append(i)
    cities = []
    for pi, pa in enumerate(pas):
        name = pa["name"]
        hx = pa_hexes.get(pi, [])
        if not hx:
            continue
        # seat hex: highest pop+jobs hex near the centroid
        mx = sum(hex_center(i % COLS, i // COLS)[0] for i in hx) / len(hx)
        my = sum(hex_center(i % COLS, i // COLS)[1] for i in hx) / len(hx)

        def score(i):
            x, y = hex_center(i % COLS, i // COLS)
            dd = math.hypot(x - mx, y - my)
            return (hex_pop[i] + hex_jobs[i] * 0.5 + 50) / (1 + dd / 600) ** 2
        seat = max(hx, key=score)
        P = pop.get(name, {})
        P20 = pop20.get(name, {})
        city = {
            "id": pa["code"], "name": name.title().replace("-Eastern", "-Eastern"), "zh": PA_ZH.get(name, ""),
            "region": pa["region"].title(), "region_zh": REGION_ZH.get(pa["region"], ""),
            "area": pa["area_km2"], "seat": seat, "hexes": hx,
            "pop": int(P.get("Total_Total", 0)), "pop20": int(P20.get("Total_Total", 0)),
            "age": {k.replace("Total_", ""): int(v) for k, v in P.items() if k.startswith("Total_") and k != "Total_Total"},
            "jobs": int(wind.get(name, {}).get("Total", 0)),
            "gdp": round(pa_gdp.get(name, 0), 1),
        }
        rowkey = name if name in rind else None  # residence-based tables only have big towns
        city["res_grouped"] = rowkey is None
        if name in eth:
            e = eth[name]
            city["eth"] = {k: int(e.get(k + "_Total", 0)) for k in ("Chinese", "Malays", "Indians", "Others")}
        if name in dwell:
            d = dwell[name]
            city["dwell"] = {"hdb12": d.get("HDBDwellings_HDB1_and2_RoomFlats1", 0), "hdb3": d.get("HDBDwellings_HDB3_RoomFlats", 0),
                             "hdb4": d.get("HDBDwellings_HDB4_RoomFlats", 0), "hdb5": d.get("HDBDwellings_HDB5_RoomandExecutiveFlats", 0),
                             "condo": d.get("CondominiumandOtherApartments", 0), "landed": d.get("LandedProperties", 0), "other": d.get("Others", 0)}
        if rowkey:
            city["rel"] = rel.get(name)
            city["qual"] = qual.get(name)
            city["lang"] = lang.get(name)
            city["hhinc"] = hhinc.get(name)
            city["ten"] = ten.get(name)
            city["lab"] = lab.get(name)
            city["rind"] = rind.get(name)
            city["occ"] = rocc.get(name)
            city["tr"] = rtr.get(name)
        if name in wind:
            city["wind"] = wind[name]
            city["winc"] = winc.get(name)
        if jtc_names := sorted({jtc[i] for i in hx if jtc[i]}):
            city["jtc"] = jtc_names
        cities.append(city)

    national = {
        "pop": pop["TOTAL"], "pop20": pop20["TOTAL"]["Total_Total"], "eth": eth["TOTAL"], "dwell": dwell["TOTAL"],
        "rel": rel["TOTAL"], "qual": qual["TOTAL"], "lang": lang["TOTAL"], "hhinc": hhinc["TOTAL"], "ten": ten["TOTAL"],
        "lab": lab["TOTAL"], "rind": rind["TOTAL"], "occ": rocc["TOTAL"], "tr": rtr["TOTAL"], "wind": wind["TOTAL"],
        "winc": winc["TOTAL"], "gdp": gdp_total, "gdp_year": gdp_year,
        "gdp_ind": {k: round(v, 1) for k, v in gva_by_col.items()},
        "gdp_prev": g_prev if (g_prev := gdp["GDP At Current Market Prices"].get(gdp_head[2])) else None,
    }
    el, eh = read_series("electricity.csv")
    national["elec_gwh"] = el["Electricity Generation"][eh[1]]
    national["elec_year"] = eh[1]
    with open(os.path.join(RAW, "container_throughput.csv")) as f:
        rows = list(csv.DictReader(f))
        national["teu_k"] = num(rows[-1]["container_throughput"])
        national["teu_year"] = rows[-1]["year"]
    ch, chh = read_series("changi_annual.csv")
    yr = max(h for h in chh[1:] if ch["Total Passengers"].get(h))
    national["changi_pax"] = ch["Total Passengers"][yr]
    national["changi_cargo_t"] = ch["Total Air Cargo Tonnage"][yr]
    national["changi_year"] = yr

    # ---------- compact hex arrays
    def pack_lu(i):
        L = lu[i] or {}
        return [L.get(k, 0) for k in LU_KEYS]

    hexes = {
        "t": terrain,
        "pa": pa_of,
        "pop": hex_pop,
        "jobs": hex_jobs,
        "flags": flags,
        "elev": [round(elev.get((i % COLS, i // COLS), 0)) if is_land[i] else 0 for i in range(N)],
        "lu": [pack_lu(i) if is_land[i] else 0 for i in range(N)],
        "clinic": [clinics.get(i, 0) for i in range(N)],
        "jtc": [jtc[i] for i in range(N)],
        "fx": [foreign[i] for i in range(N)],
    }
    manifest = json.load(open(os.path.join(RAW, "manifest.json")))
    data = {
        "meta": {"built": datetime.date.today().isoformat(), "R": R, "cols": COLS, "rows": ROWS, "x0": X0, "y0": Y0,
                 "lon0": LON0, "lat0": LAT0, "kx": KX, "ky": KY, "terrains": TERRAINS, "lu_keys": LU_KEYS},
        "pas": pas, "cities": cities, "hexes": hexes, "stations": stations, "lines": lines, "sites": sites, "wonders": wonders,
        "national": national, "sources": manifest,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("wrote", OUT, f"{os.path.getsize(OUT)/1e6:.1f} MB")
    cnt = collections.Counter(TERRAINS[t] for t in terrain)
    print(dict(cnt))
    print("land hexes", sum(is_land), "cities", len(cities), "sites", collections.Counter(s["k"] for s in sites), "lines", len(lines), "stations", len(stations))


if __name__ == "__main__":
    main()
