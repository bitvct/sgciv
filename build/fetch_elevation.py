"""Fetch mean elevation for every land hex from the OpenTopoData API
(SRTM 30 m DEM). 7 samples per hex (centre + ring), averaged.

Run: python3 -I build/fetch_elevation.py   -> data/raw/elevation.json {"lon,lat" of hex centre: metres}
"""
import json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_tiles as B  # noqa: E402

UA = {"User-Agent": "sgciv-builder/0.1"}
OUT = os.path.join(B.RAW, "elevation.json")


def main():
    pa_index = B.PolyIndex()
    for f in B.load_geo("geo_planning_areas.geojson"):
        pa_index.add_geometry(f["geometry"], 1)
    ring = [(0, 0)] + [(B.R * 0.55 * __import__("math").cos(a), B.R * 0.55 * __import__("math").sin(a)) for a in [k * 1.0472 + 0.5236 for k in range(6)]]
    pts = []  # (key, lat, lon)
    for r in range(B.ROWS):
        for c in range(B.COLS):
            cx, cy = B.hex_center(c, r)
            if not any(pa_index.query(cx + dx, cy + dy) for dx, dy in ring):
                continue
            for dx, dy in ring:
                x, y = cx + dx, cy + dy
                lon = x / B.KX + B.LON0
                lat = -y / B.KY + B.LAT0
                clon, clat = cx / B.KX + B.LON0, -cy / B.KY + B.LAT0
                pts.append((f"{clon:.5f},{clat:.5f}", lat, lon))
    print("samples", len(pts))
    acc = {}
    for s in range(0, len(pts), 100):
        chunk = pts[s:s + 100]
        url = "https://api.opentopodata.org/v1/srtm30m?locations=" + "|".join(f"{p[1]:.5f},{p[2]:.5f}" for p in chunk)
        for attempt in range(6):
            try:
                d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
                break
            except Exception as e:
                time.sleep(5 * (attempt + 1))
        else:
            raise SystemExit("elevation fetch failed")
        for p, res in zip(chunk, d["results"]):
            acc.setdefault(p[0], []).append(max(0.0, res.get("elevation") or 0.0))
        if (s // 100) % 20 == 0:
            print(f"  {s}/{len(pts)}")
        time.sleep(1.1)  # OpenTopoData public limit: 1 call/s
    out = {k: round(sum(v) / len(v), 1) for k, v in acc.items()}
    json.dump(out, open(OUT, "w"))
    print("wrote", OUT, len(out), "max", max(out.values()))


if __name__ == "__main__":
    main()
