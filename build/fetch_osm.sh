#!/bin/bash
# Fetch OpenStreetMap layers for Singapore via Overpass API (mirror fallback + backoff).
# Only what data.gov.sg lacks: named/coloured MRT lines, power plants, places of worship,
# universities, peaks, aerodromes, military land, ports.
# Usage: bash build/fetch_osm.sh   (writes data/raw/osm_*.json)
set -u
cd "$(dirname "$0")/../data/raw"
BB="1.15,103.59,1.48,104.10"
UA="sgciv-builder/0.1"
MIRRORS=(https://overpass.kumi.systems/api/interpreter https://overpass-api.de/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter)

q() {
  local name=$1 body=$2
  if [ -s "$name.json" ] && head -c 1 "$name.json" | grep -q '{'; then echo "$name: cached"; return; fi
  for attempt in 1 2 3; do
    for m in "${MIRRORS[@]}"; do
      curl -s -m 200 -A "$UA" --data-urlencode "data=[out:json][timeout:180];$body" "$m" -o "$name.json"
      if head -c 1 "$name.json" | grep -q '{'; then echo "$name: $(wc -c < "$name.json") bytes from $m"; return; fi
    done
    sleep $((attempt * 15))
  done
  echo "$name: FAILED"; rm -f "$name.json"
}

q osm_rail_routes "relation[route~\"^(subway|light_rail|monorail)\$\"]($BB);out geom;"
q osm_power "nwr[power=plant]($BB);out center tags;"
q osm_worship "nwr[amenity=place_of_worship]($BB);out center tags;"
q osm_universities "nwr[amenity=university]($BB);out center tags;"
q osm_peaks "node[natural=peak]($BB);out;"
q osm_aero_port_military "(nwr[aeroway=aerodrome]($BB);nwr[landuse=military]($BB);nwr[military~\"^(airfield|base|barracks|naval_base|camp)\$\"]($BB);nwr[landuse=port]($BB);nwr[industrial=refinery]($BB);nwr[man_made=works]($BB););out center tags;"
q osm_stations "node[railway=station]($BB);out;"
