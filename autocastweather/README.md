# AutoCastWeather

Bookmarklets that turn the latest PAGASA forecast into a ready-to-post Facebook update, with sunrise, sunset, moonrise and moonset times worked out for the station. They read public PAGASA pages only; you review and post the text yourself.

| Bookmark | Folder | What it makes |
|---|---|---|
| **ZAM Forecast** | [zamboanga/](zamboanga/) | Zamboanga City 24-hour forecast post, plus a link to the latest Himawari IR1 satellite GIF |
| **DIP Forecast** | [dipolog/](dipolog/) | Localized 24-hour forecast for Zamboanga Peninsula and Misamis Occidental over Dipolog City, in English and Cebuano |

## Install

Open the folder's `dist/install.html` in your browser and drag the button to your bookmarks bar (or copy the link). Then open pagasa.dost.gov.ph and click the bookmark.

## Build

In either folder:

```
python3 build.py
```

This rebuilds the files in `dist/` from the source (`astro.js` plus `forecast.js` or `dipolog.js`).
