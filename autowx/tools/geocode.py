"""Geocode AWS stations from stations.tsv with OpenStreetMap Nominatim.

Writes stations.json next to this script: {recordId: [lat, lon, query]}.
A query of "@lat,lon" is taken as-is; "-" means no location.
Nominatim policy: at most 1 request per second, identifying User-Agent.
"""
import json, subprocess, time, urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "stations.json"
UA = "aws-weather-display/1.0 (one-time station geocoding)"

done = json.loads(OUT.read_text()) if OUT.exists() else {}
problems = []
for line in (HERE / "stations.tsv").read_text().splitlines():
    rec, site, name, query = line.split("\t")
    if rec in done or query == "-":
        continue
    if query.startswith("@"):
        lat, lon = map(float, query[1:].split(","))
        done[rec] = [lat, lon, "manual"]
        continue
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": query + ", Philippines", "format": "json", "limit": 1, "countrycodes": "ph"})
    # curl uses the system certificate store (python.org builds may lack one).
    res = json.loads(subprocess.run(["curl", "-sS", "--max-time", "30", "-A", UA, url],
                                    check=True, capture_output=True, text=True).stdout)
    time.sleep(1.1)
    if not res:
        problems.append(f"{rec}\t{name}\tNO MATCH for '{query}'")
        continue
    hit = res[0]
    lat, lon = float(hit["lat"]), float(hit["lon"])
    province = query.split(",")[-1].strip().lower()
    shown = hit["display_name"]
    if province.split()[0] not in shown.lower():
        problems.append(f"{rec}\t{name}\tCHECK '{query}' -> {shown}")
    done[rec] = [round(lat, 4), round(lon, 4), shown]
    OUT.write_text(json.dumps(done, indent=0, ensure_ascii=False))

OUT.write_text(json.dumps(done, indent=0, ensure_ascii=False))
print(len(done), "stations located")
print("\n".join(problems) or "no problems")
