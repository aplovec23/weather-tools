"""Pack astro.js + dipolog.js into a bookmarklet: dist/bookmarklet.txt and dist/install.html."""
import html, pathlib, urllib.parse

here = pathlib.Path(__file__).parent
astro = (here / "astro.js").read_text().replace("if (typeof module !== 'undefined') module.exports = Astro;", "")
code = astro + "\n" + (here / "dipolog.js").read_text()
# drop comment-only lines and indentation (every statement ends with ; or })
lines = [l.strip() for l in code.splitlines()]
code = "(function(){" + "\n".join(l for l in lines if l and not l.startswith("//")) + "\n})();"
url = "javascript:" + urllib.parse.quote(code, safe="!#$&'()*+,/:;=?@[]~-_.")
dist = here / "dist"
dist.mkdir(exist_ok=True)
(dist / "bookmarklet.txt").write_text(url)
(dist / "bundle.js").write_text(code)
page = (here / "install.template.html").read_text().replace("{{URL}}", html.escape(url, quote=True))
(dist / "install.html").write_text(page)
print("bookmarklet", len(url), "chars")
