"""Builds Similar_Cyclone_Finder.html: a single offline page that finds past tropical cyclones similar to a
current one from its last four synoptic fixes.

Run from the project folder:
    .venv/bin/python operational_tool/build_similar_cyclone_finder.py

It reads the JMA best track (IBTrACS) already in data/ and embeds it, with a coastline, in the page.
Re-run it after replacing data/ibtracs.WP.list.v04r01.csv with a newer copy to add new seasons.
"""
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
FIRST_YEAR = 1951
KT_TO_KMH = 1.852
WEST, EAST, SOUTH, NORTH = 95, 180, 0, 50          # map and archive extent

# ---- JMA best track (same reading as the assignment notebook)
tracks = pd.read_csv(os.path.join(DATA, "ibtracs.WP.list.v04r01.csv"), skiprows=[1], low_memory=False,
                     keep_default_na=False,
                     usecols=["SID", "SEASON", "NAME", "ISO_TIME", "LAT", "LON", "TOKYO_LAT", "TOKYO_LON",
                              "TOKYO_WIND", "TOKYO_PRES", "TRACK_TYPE"])
tracks["TIME"] = pd.to_datetime(tracks["ISO_TIME"])
tracks["PRES"] = pd.to_numeric(tracks["TOKYO_PRES"], errors="coerce")
tracks["WIND_RECORDED"] = pd.to_numeric(tracks["TOKYO_WIND"], errors="coerce") * KT_TO_KMH
jma_lat = pd.to_numeric(tracks["TOKYO_LAT"], errors="coerce")
jma_lon = pd.to_numeric(tracks["TOKYO_LON"], errors="coerce")
tracks["LAT"], tracks["LON"] = jma_lat.fillna(tracks["LAT"]), jma_lon.fillna(tracks["LON"])
tracks = tracks[tracks["TRACK_TYPE"].isin(["main", "PROVISIONAL", "US-PROVISIONAL"])
                & (tracks["SEASON"] >= FIRST_YEAR) & (tracks["TIME"].dt.hour % 6 == 0)
                & (tracks["TIME"].dt.minute == 0) & tracks["PRES"].notna()
                & tracks["LON"].between(WEST, EAST) & tracks["LAT"].between(SOUTH, NORTH)]
tracks = tracks.drop_duplicates(["SID", "TIME"]).copy()

# ---- wind from central pressure, for records where JMA gives no wind (same method as the notebook)
pairs = tracks[tracks["WIND_RECORDED"].notna()]
by_pressure = pairs.groupby("PRES")["WIND_RECORDED"].agg(["median", "size"])
by_pressure = by_pressure[by_pressure["size"] >= 30]
lookup_p = by_pressure.index.to_numpy(dtype=float)
lookup_w = np.maximum.accumulate(by_pressure["median"].to_numpy()[::-1])[::-1]
fit = pairs[pairs["PRES"] < 1010]
wpr_b, log_a = np.polyfit(np.log(1010 - fit["PRES"]), np.log(fit["WIND_RECORDED"]), 1)
wpr_a = float(np.exp(log_a))


def wind_from_pressure(pressure):
    pressure = np.asarray(pressure, dtype=float)
    wind = np.interp(pressure, lookup_p, lookup_w)
    weak = pressure > lookup_p.max()
    wind[weak] = np.minimum(wpr_a * np.maximum(1010 - pressure[weak], 0.5) ** wpr_b, lookup_w[-1])
    return wind


tracks["WIND"] = tracks["WIND_RECORDED"].fillna(pd.Series(wind_from_pressure(tracks["PRES"]), index=tracks.index))
epoch = pd.Timestamp("1950-01-01")
tracks["HOUR"] = ((tracks["TIME"] - epoch) / pd.Timedelta(hours=1)).astype(np.int64)

# ---- one compact record per cyclone: [name, season, [hour, lat, lon, pressure, wind, recorded] ...]
storms = []
for sid, storm in tracks.groupby("SID", sort=False):
    storm = storm.sort_values("HOUR")
    if len(storm) < 4:
        continue
    name = storm["NAME"].iloc[0]
    name = "Unnamed" if name in ("NOT_NAMED", "UNNAMED", "") else name.title()
    fixes = [[int(h), round(float(a), 1), round(float(o), 1), int(p), int(round(w)), int(r)]
             for h, a, o, p, w, r in zip(storm["HOUR"], storm["LAT"], storm["LON"], storm["PRES"], storm["WIND"],
                                         storm["WIND_RECORDED"].notna())]
    storms.append([name, int(storm["SEASON"].iloc[0]), fixes])

# ---- coastline, clipped to the map
with open(os.path.join(DATA, "ne_110m_coastline.geojson")) as fh:
    coast = []
    for feature in json.load(fh)["features"]:
        line = np.array(feature["geometry"]["coordinates"])
        inside = (line[:, 0] >= WEST - 5) & (line[:, 0] <= EAST + 5) & (line[:, 1] >= SOUTH - 5) & (line[:, 1] <= NORTH + 5)
        run = []
        for point, keep in zip(line, inside):
            if keep:
                run.append([round(float(point[0]), 2), round(float(point[1]), 2)])
            elif len(run) > 1:
                coast.append(run)
                run = []
            else:
                run = []
        if len(run) > 1:
            coast.append(run)

payload = {
    "storms": storms,
    "coast": coast,
    "extent": [WEST, EAST, SOUTH, NORTH],
    "lookupP": [float(v) for v in lookup_p],
    "lookupW": [round(float(v), 1) for v in lookup_w],
    "wprA": wpr_a, "wprB": float(wpr_b),
    "firstYear": FIRST_YEAR, "lastYear": int(tracks["SEASON"].max()),
    "built": pd.Timestamp.now().strftime("%d %b %Y"),
}
with open(os.path.join(HERE, "template.html")) as fh:
    page = fh.read()
page = page.replace("/*__DATA__*/null", json.dumps(payload, separators=(",", ":")))
out = os.path.join(HERE, "Similar_Cyclone_Finder.html")
with open(out, "w") as fh:
    fh.write(page)
n_fixes = sum(len(s[2]) for s in storms)
print(f"{len(storms):,} cyclones, {n_fixes:,} synoptic fixes, {payload['firstYear']}-{payload['lastYear']}")
print(f"Wrote {out} ({os.path.getsize(out) / 2**20:.1f} MB)")
