# sgciv — Singapore as a strategy game / 新加坡策略游戏地图

A Civilization-style hex map of Singapore where every tile, town and number comes from public data,
inspired by Andrej Karpathy's [usaciv](https://karpathy.ai/usaciv/). English first, 中文 second (toggle top-right).

## Run

```bash
python3 -m http.server 8765 --directory web
```

Then open http://localhost:8765.

## Rebuild the data

```bash
python3 -I build/fetch_datagov.py      # 36 datasets from data.gov.sg (URA MP2025, GHS 2025, SingStat, NEA, NHB, STB…)
bash build/fetch_osm.sh                # OSM: MRT lines, stations' Chinese names, power plants, worship, universities, peaks
python3 -I build/fetch_elevation.py    # SRTM 30 m via OpenTopoData (rate-limited, ~5 min)
python3 -I build/build_tiles.py        # → web/data/sgciv.json
```

Natural Earth 1:10m country outlines (`data/raw/ne_10m_admin_0_countries.geojson`) are downloaded from the
natural-earth-vector GitHub repo.

## What maps to what

- **Grid**: 258×259 pointy-top hexes (Singapore plus southern Johor and the Riau Islands), 600 m corner to corner; 19 sample points per hex.
- **Towns** = URA's 55 planning areas. **Gold** = 2025 GDP by industry, shared out by where residents work.
  **Food / Production / Science / Culture** = resident workers in F&B, manufacturing+construction,
  info-comm+professional, and arts, by workplace.
- **Districts** = industries with location quotient ≥ 1.5 and ≥ 1,000 jobs, plus physical districts from zoning.
- **Wonders** = published rules (UNESCO, QS top 20, busiest airport, largest hotel, highest point…).
- 14 lenses, City View (Citizens / Districts / Economy / Housing), Almanac with every source.

Caveat: the household survey counts residents (citizens + PRs) only, so jobs held by foreign workers are not counted.
