"""Build the AutoWx bookmarklet. (AutoWx — made by April Love E. Castillon, 2026)

Reads app.js and tools/stations.json, fills in the station coordinates, and writes
dist/autowx.js (plain script) and dist/install.html (drag-to-bookmarks link).
Run: python3 build.py
"""
import html
import json
import urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
DIST = HERE / "dist"

app = (HERE / "app.js").read_text()
coords = json.loads((HERE / "tools" / "stations.json").read_text())
compact = {rec: [v[0], v[1]] for rec, v in sorted(coords.items(), key=lambda kv: int(kv[0]))}
marker = "/*STATIONS*/{}"
assert marker in app, "STATION_COORDS placeholder not found in app.js"
script = app.replace(marker, json.dumps(compact, separators=(",", ":")))

DIST.mkdir(exist_ok=True)
(DIST / "autowx.js").write_text(script)



def trim(js):
    """Drop whole-line comments, blank lines and indentation. Line breaks are kept, so the
    code runs exactly as before; comments after code on the same line are left alone."""
    out = []
    for line in (l.strip() for l in js.splitlines()):
        if line.startswith("// AutoWx — made by"):
            out.append("/* " + line[3:] + " */")   # keep the credit, as a block comment
        elif line and not line.startswith("//"):
            out.append(line)
    return "\n".join(out)


# The bookmark carries the trimmed program; dist/autowx.js stays readable for the local preview.
bookmarklet = "javascript:" + urllib.parse.quote(trim(script), safe="~()*!.'/:;,=+?&@-_")
page = (HERE / "install.template.html").read_text()
page = page.replace("{{BOOKMARKLET}}", html.escape(bookmarklet, quote=True))
page = page.replace("{{COUNT}}", str(len(compact)))
mark = (HERE / "logo" / "logo-mark.svg").read_text()
page = page.replace("{{LOGO}}", mark.replace(' width="512" height="512"', ""))
page = page.replace("{{FAVICON}}", "data:image/svg+xml," + urllib.parse.quote(mark))
(DIST / "install.html").write_text(page)

print(f"{len(compact)} station locations, bookmarklet {len(bookmarklet):,} characters")
print("wrote", DIST / "autowx.js")
print("wrote", DIST / "install.html")
