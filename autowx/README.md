# AutoWx

A bookmarklet for the PAGASA Collection System (cserv.panahon.gov.ph). While you are signed in, it shows AWS readings as easy-to-read cards (temperature, heat index, rain, wind), a station status board, and a maintenance tab that checks each station's last 24 hours of data for problems.

It only reads data; it never changes anything on the server.

## Install

Open `dist/install.html` in your browser and drag the button to your bookmarks bar (or use "Copy bookmark link"). Then open cserv, sign in, and click the bookmark.

## Build

```
python3 build.py
```

Builds `dist/autowx.js` and `dist/install.html` from `app.js`.

## Station locations

`tools/stations.tsv` lists each station and a place to look up. `tools/geocode.py` turns it into `tools/stations.json`. Add a row for new stations, then rerun the script and the build.
