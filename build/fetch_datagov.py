"""Download the data.gov.sg datasets used by sgciv into data/raw/.

Run: python3 build/fetch_datagov.py
Each dataset is fetched once (cached by file name). The manifest written to
data/raw/manifest.json records id, name, source URL and download date; the
Almanac's Sources page is generated from it.
"""
import json, os, sys, time, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "data", "raw")
UA = {"User-Agent": "sgciv-builder/0.1"}

# file name -> (dataset id, short description)
DATASETS = {
    # --- geography (URA Master Plan 2025 and others) ---
    "geo_planning_areas.geojson": ("d_2cc750190544007400b2cfd5d7f53209", "URA Master Plan 2025 Planning Area Boundary (No Sea)"),
    "geo_land_use.geojson": ("d_a8c3546b26712e35021f3a681d0353ae", "URA Master Plan 2025 Land Use Layer"),
    "geo_rail_line.geojson": ("d_1c6365f0cad13a77bd79bdbb499131bf", "URA Master Plan 2025 Rail Line Layer"),
    "geo_rail_station.geojson": ("d_2c06c9fe8ae724b5d33efa1f203e2c38", "URA Master Plan 2025 Rail Station Layer"),
    "geo_rail_station_name.geojson": ("d_449ee0cec1f9574f8f34712da6f7456f", "URA Master Plan 2025 Rail Station Name Layer"),
    "geo_nature_reserve.geojson": ("d_2adb77a24a0bf1a51f026ba6633e2480", "URA Master Plan 2025 Nature Reserve and National Park Boundary"),
    "geo_monuments.geojson": ("d_b29c230ec6b609e29ed42f71ca9a8767", "NHB National Monuments"),
    "geo_historic_sites.geojson": ("d_31e16b12809e66673e90d8b04fdee1b2", "NHB Historic Sites"),
    "geo_hawker_centres.geojson": ("d_4a086da0a5553be1d89383cd90d07ecd", "NEA Hawker Centres"),
    "geo_tourist_attractions.geojson": ("d_0f2f47515425404e6c9d2a040dd87354", "STB Tourist Attractions"),
    "geo_hotels.geojson": ("d_654e22f14e5bb817423f0e0c9ac4f632", "STB Hotels"),
    "geo_jtc_estates.geojson": ("d_0e6c5a63613b812b7240612c5d837a82", "JTC Estate Name Boundary"),
    "geo_coastal_habitat.geojson": ("d_18bcfe0a1b8c77f9b4493cef72ffd717", "NParks Coastal and Marine Habitat Map 2018"),
    "geo_parks.geojson": ("d_77d7ec97be83d44f61b85454f844382f", "NParks Parks and Nature Reserves"),
    "geo_libraries.geojson": ("d_27b8dae65d9ca1539e14d09578b17cbf", "NLB Libraries"),
    "geo_community_clubs.geojson": ("d_f706de1427279e61fe41e89e24d440fa", "PA Community Clubs"),
    "geo_chas_clinics.geojson": ("d_548c33ea2d99e29ec63a7cc9edcccedc", "MOH CHAS Clinics"),
    # --- people (SingStat General Household Survey 2025, by planning area) ---
    "ghs_pop_age_sex.csv": ("d_c5001956eb3cba0d6805f7c28f53d4db", "GHS 2025: Resident population by planning area/subzone, age group and sex"),
    "ghs_pop_ethnic.csv": ("d_1593268b32aa9ccff985d4c268ff7485", "GHS 2025: Resident population by planning area/subzone, ethnic group and sex"),
    "ghs_pop_dwelling.csv": ("d_59f9cd511cc4ba054f4007f9c3bbe405", "GHS 2025: Resident population by planning area/subzone and type of dwelling"),
    "ghs_religion.csv": ("d_e6b0edc096d4717f7a0527efdef85c99", "GHS 2025: Residents 15+ by planning area and religion"),
    "ghs_qualification.csv": ("d_6ba57fb4cc8505f555cdfa04fa4466f2", "GHS 2025: Residents 15+ by planning area and highest qualification"),
    "ghs_language.csv": ("d_476b50e27333ffa67b6dd2965f3177d7", "GHS 2025: Residents 5+ by planning area and language most spoken at home"),
    "ghs_hh_income.csv": ("d_f399acf41f283bc8d666880f31fe1d84", "GHS 2025: Resident households by planning area and monthly household employment income"),
    "ghs_tenancy.csv": ("d_b8a69e1cd91cd8504ee350d4e951889c", "GHS 2025: Resident households by planning area and tenancy"),
    "ghs_labour.csv": ("d_b62044d14a936c751462233bda9b3fbf", "GHS 2025: Residents 15+ by planning area, labour force status and sex"),
    "ghs_res_industry.csv": ("d_5677b872a91a4447495d0ea11c280ebb", "GHS 2025: Employed residents by planning area of residence and industry"),
    "ghs_res_occupation.csv": ("d_8674fb5bcf9858540ad7883fe6d578a0", "GHS 2025: Employed residents by planning area of residence and occupation"),
    "ghs_res_transport.csv": ("d_27f0f52d2ac065b2cb498a0ac5c11927", "GHS 2025: Employed residents by planning area of residence and mode of transport to work"),
    "ghs_work_industry.csv": ("d_4b6327faec3b60cbe527ffe021f0648a", "GHS 2025: Employed residents by planning area of workplace and industry"),
    "ghs_work_income.csv": ("d_44b05f4d87bdc372756ad7b267792f0c", "GHS 2025: Employed residents by planning area of workplace and gross monthly employment income"),
    "census_pop_age_sex.csv": ("d_d95ae740c0f8961a0b10435836660ce0", "Census 2020: Resident population by planning area/subzone, age group and sex"),
    # --- economy (national) ---
    "gdp_current_industry.csv": ("d_d0db56a7c201c9a1e42c846d4fe6da8f", "SingStat: GDP at current prices by industry (SSIC 2020), annual"),
    "electricity.csv": ("d_3745e3aa98ff3c4bcfcb8e1f6dffef42", "SingStat/EMA: Electricity generation and consumption, annual"),
    "container_throughput.csv": ("d_085682b824700b4e88d946529f503da0", "MPA: Container throughput, annual"),
    "changi_annual.csv": ("d_ed5a20574d59d59a3131ed3a3b19a4cb", "CAAS: Changi Airport aircraft, passengers and cargo, annual"),
}


def get_json(url):
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e:  # rate limited (429) or transient
            wait = 4 * (attempt + 1)
            print(f"   retry in {wait}s ({e})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(url)


def main():
    os.makedirs(RAW, exist_ok=True)
    man_path = os.path.join(RAW, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for fname, (did, desc) in DATASETS.items():
        path = os.path.join(RAW, fname)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            print(f"cached  {fname}")
            continue
        poll = f"https://api-open.data.gov.sg/v1/public/api/datasets/{did}/poll-download"
        url = None
        for _ in range(10):
            d = get_json(poll)
            url = (d.get("data") or {}).get("url")
            if url:
                break
            urllib.request.urlopen(urllib.request.Request(
                f"https://api-open.data.gov.sg/v1/public/api/datasets/{did}/initiate-download",
                data=b"{}", headers={**UA, "Content-Type": "application/json"}), timeout=60)
            time.sleep(5)
        if not url:
            print(f"FAILED  {fname}")
            continue
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(path, "wb") as f:
            f.write(r.read())
        manifest[fname] = {
            "id": did, "name": desc,
            "page": f"https://data.gov.sg/datasets/{did}/view",
            "fetched": datetime.date.today().isoformat(),
            "bytes": os.path.getsize(path),
        }
        json.dump(manifest, open(man_path, "w"), indent=1)
        print(f"ok      {fname}  {os.path.getsize(path)/1e6:.1f} MB")
        time.sleep(1.5)


if __name__ == "__main__":
    main()
