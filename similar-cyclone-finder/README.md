# Similar Cyclone Finder

An offline web page for tropical cyclone forecasters. Enter a cyclone's latest positions and strength (or pick a past cyclone), and it finds the most similar past cyclones in the western North Pacific record, 1951 to present. It shows them on a map with PAGASA strength symbols and the PAR, TCAD and TCID areas, and summarises what those past cyclones did next and how their strength changed.

Matching compares whole tracks first, then ranks strength among the closest tracks. You can also match on track only or strength only.

> The "what similar cyclones did next" sections are historical comparisons, not forecast guidance.

## Use

Download `Similar_Cyclone_Finder.html` and open it in any browser. It needs no internet connection; the cyclone record and coastline are built into the page.

## Rebuild with newer data

`template.html` is the page source. `build_similar_cyclone_finder.py` builds the page from it and reads two files from a `data` folder next to this folder (`../data/`):

- `ibtracs.WP.list.v04r01.csv`: the IBTrACS western Pacific best track from NOAA NCEI (about 115 MB, too large to keep on GitHub). JMA winds are used.
- `ne_110m_coastline.geojson`: the Natural Earth 1:110m coastline.

```
python3 build_similar_cyclone_finder.py
```

Needs Python with pandas and numpy.

## Data credits

- Best track: IBTrACS v04 (Knapp et al., NOAA NCEI), JMA (RSMC Tokyo) agency data.
- Coastline: Natural Earth (public domain).
