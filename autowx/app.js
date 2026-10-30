// AutoWx — made by April Love E. Castillon, 2026
//
// A clear, friendly display for PAGASA automatic weather stations (AWS).
// Runs on cserv.panahon.gov.ph while signed in. It reads /admin/aws (station list)
// and /admin/datatable (24 h of 10-minute readings per station) and only ever reads.
// Built into a bookmarklet by build.py, which fills in STATION_COORDS.
//
// Wording follows PAGASA where PAGASA defines terms: heat index classification,
// rainfall intensity (mm/h) and heavy rainfall warning colours, Wind Signal wind
// categories (km/h), and directional wind names. Temperature, humidity, sunshine and
// pressure have no PAGASA categories, so they use plain descriptions.
(function () {
  'use strict';

  // ---------- settings ----------

  var CONFIG = {
    refreshMinutes: 10,            // stations post every 10 minutes
    historyHours: 24,
    maxShown: 8,                   // stations shown at once, nearest included
    // Station status (age of the latest report)
    lateAfterMin: 30,
    staleAfterMin: 6 * 60,
    offlineAfterMin: 7 * 24 * 60,
    futureToleranceMin: 15,
    lowBatteryV: 11.5,
    windUnit: 'm/s',               // unit of wind_speed in the station data (assumed)
    // Readings outside these ranges are treated as sensor problems
    limits: {
      temp: [0, 45], rh: [1, 100], pressure: [600, 1060], wind: [0, 90],
      dir: [0, 360], rain: [0, 100], solar: [0, 1500], battery: [9, 16]
    },
    sentinels: [-999, -9999, 9999]
  };

  // {recordId: [lat, lon]} — approximate town-centre locations.
  var STATION_COORDS = /*STATIONS*/{};

  var LIST_URL = '/admin/aws';
  var DATA_URL = '/admin/datatable';
  var STORE_KEY = 'autowx.v1';

  if (location.hostname !== 'cserv.panahon.gov.ph' && !window.__autowxDev) {
    alert('Open cserv.panahon.gov.ph and sign in first, then click AutoWx again.');
    return;
  }
  if (window.__autowx) { window.__autowx.refresh(); return; }

  // ---------- state ----------

  var saved = load();
  var state = {
    view: saved.view || 'weather',
    fit: !!saved.fit,                    // fit-to-screen overview
    groups: saved.groups || [],          // [{name, ids}] named station selections
    scope: saved.scope || 'all',         // Station status / Maintenance: 'all' or 'selected'
    groupName: '',
    selected: saved.selected || [],      // record IDs the user added
    stations: [],                        // from the station list
    details: {},                         // recordId -> {rows, error, loading}
    listError: null,
    listAt: null,
    nextRefresh: null,
    here: null,                          // {lat, lon}
    geo: 'idle',                         // idle | asking | ok | denied | unavailable
    nearestId: null,
    picker: false,
    pickerQuery: '',
    board: { filter: 'all', query: '', sort: { key: 'severity', dir: 1 } },
    maint: { filter: 'all', query: '', open: null },   // maintenance tab
    scan: null                           // {running, total, done, started, finished}
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view: state.view, fit: state.fit, selected: state.selected, groups: state.groups, scope: state.scope }));
    } catch (e) { /* storage blocked — selection just won't be remembered */ }
  }

  // ---------- small helpers ----------

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round(x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; }
  function fmt(x, d) { return x == null ? '—' : round(x, d == null ? 1 : d).toFixed(d == null ? 1 : d); }

  function num(text) {
    var t = (text == null ? '' : String(text)).trim();
    if (t === '' || t === '-') return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  // Station times are Philippine time (UTC+8).
  function manilaTime(text) {
    var t = (text || '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t)) return null;
    var ms = Date.parse(t.replace(' ', 'T') + '+08:00');
    return isNaN(ms) ? null : ms;
  }
  // "M/D/YYYY HH:mm" in Philippine time, the format /admin/datatable expects.
  function manilaQuery(ms) {
    var d = new Date(ms + 8 * 3600000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear() + ' ' +
      p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  function clock(ms) {
    return new Date(ms).toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true
    });
  }
  function ageText(min) {
    if (min == null) return 'never';
    if (min < 0) return 'in ' + ageText(-min);
    if (min < 1) return 'just now';
    if (min < 60) return Math.round(min) + ' min ago';
    if (min < 48 * 60) return Math.round(min / 60) + ' h ago';
    if (min < 60 * 24 * 60) return Math.round(min / 1440) + ' days ago';
    return (min / 525600).toFixed(1) + ' years ago';
  }

  function valid(key, v) {
    if (v == null) return false;
    if (CONFIG.sentinels.indexOf(v) !== -1) return false;
    var lim = CONFIG.limits[key];
    return !lim || (v >= lim[0] && v <= lim[1]);
  }

  function distanceKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function prettyName(name) {
    return name.replace(/\s*\bAWS\b\s*$/i, '').replace(/\s+/g, ' ').replace(/\.\s/, ', ').replace(/,(?=\S)/g, ', ').trim();
  }

  function toKmh(v) { return v == null ? null : CONFIG.windUnit === 'm/s' ? v * 3.6 : v; }

  // ---------- weather science ----------

  // Heat index (NWS Rothfusz regression, the formula PAGASA uses), °C in and out.
  function heatIndex(tC, rh) {
    if (tC == null || rh == null) return null;
    var T = tC * 9 / 5 + 32;
    var hi = 0.5 * (T + 61 + (T - 68) * 1.2 + rh * 0.094);
    if ((hi + T) / 2 >= 80) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh -
        0.00683783 * T * T - 0.05481717 * rh * rh + 0.00122874 * T * T * rh +
        0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh;
      if (rh < 13 && T >= 80 && T <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
      else if (rh > 85 && T >= 80 && T <= 87) hi += ((rh - 85) / 10) * ((87 - T) / 5);
    }
    return (hi - 32) * 5 / 9;
  }

  // Dew point (Magnus formula), °C.
  function dewPoint(tC, rh) {
    if (tC == null || rh == null || rh <= 0) return null;
    var a = 17.62, b = 243.12, g = Math.log(rh / 100) + a * tC / (b + tC);
    return b * g / (a - g);
  }

  // ---------- levels (each scale is a list of bands, upper bound exclusive) ----------

  var C = {
    green: '#22a06b', teal: '#1ea7c5', blue: '#2f6bff', indigo: '#5b5bd6', violet: '#8e4ec6',
    yellow: '#f0b429', orange: '#f07f1f', red: '#e5484d', purple: '#a33ad6', grey: '#8a96a8', slate: '#5b6b8c'
  };

  // PAGASA heat index classification (°C).
  var HEAT_LEVELS = [
    { to: 27, label: 'Not hazardous', color: C.green, tone: 'good',
      say: 'Below the PAGASA caution level.' },
    { to: 33, label: 'Caution', color: C.yellow, tone: 'info',
      say: 'Fatigue is possible with long exposure and activity. Drink water.' },
    { to: 42, label: 'Extreme Caution', color: C.orange, tone: 'warn',
      say: 'Heat cramps and heat exhaustion are possible. Rest in the shade and drink water often.' },
    { to: 52, label: 'Danger', color: C.red, tone: 'danger',
      say: 'Heat cramps and heat exhaustion are likely; heat stroke is probable with continued exposure.' },
    { to: Infinity, label: 'Extreme Danger', color: C.purple, tone: 'danger',
      say: 'Heat stroke is imminent. Stay indoors where it is cool.' }
  ];

  // PAGASA rainfall intensity (mm per hour) with heavy rainfall warning colours.
  var RAIN_LEVELS = [
    { to: 0.01, label: 'No rain', color: C.grey, tone: 'good', say: 'No rain in the last hour.' },
    { to: 2.5, label: 'Light', color: '#7fb2ff', tone: 'info', say: 'Light rain. An umbrella is enough.' },
    { to: 7.5, label: 'Moderate', color: C.blue, tone: 'info', say: 'Moderate rain. Bring an umbrella.' },
    { to: 15, label: 'Heavy', color: C.yellow, tone: 'warn', warn: 'Yellow',
      say: 'Heavy rain. At the Yellow warning level: flooding is possible in low-lying areas.' },
    { to: 30, label: 'Intense', color: C.orange, tone: 'danger', warn: 'Orange',
      say: 'Intense rain. At the Orange warning level: flooding is threatening.' },
    { to: Infinity, label: 'Torrential', color: C.red, tone: 'danger', warn: 'Red',
      say: 'Torrential rain. At the Red warning level: serious flooding is expected. Stay away from rivers.' }
  ];

  // Wind (km/h): Beaufort words below 39 km/h, Wind Signal categories from 39 km/h up.
  var WIND_LEVELS = [
    { to: 2, label: 'Calm', color: C.grey, tone: 'good', say: 'The air is still.' },
    { to: 20, label: 'Light', color: C.green, tone: 'good', say: 'Light winds. You feel it on your face; leaves rustle.' },
    { to: 39, label: 'Moderate', color: C.teal, tone: 'info', say: 'Moderate winds. Small branches move and dust blows.' },
    { to: 62, label: 'Strong', color: C.yellow, tone: 'warn', signal: 1,
      say: 'Strong winds (39–61 km/h), the Tropical Cyclone Wind Signal No. 1 range. Small trees sway; walking is harder.' },
    { to: 89, label: 'Gale-force', color: C.orange, tone: 'danger', signal: 2,
      say: 'Gale-force winds (62–88 km/h), the Tropical Cyclone Wind Signal No. 2 range. Stay indoors.' },
    { to: 118, label: 'Storm-force', color: C.red, tone: 'danger', signal: 3,
      say: 'Storm-force winds (89–117 km/h), the Tropical Cyclone Wind Signal No. 3 range. Stay indoors.' },
    { to: Infinity, label: 'Typhoon-force', color: C.purple, tone: 'danger', signal: 4,
      say: 'Typhoon-force winds (118 km/h or more). Stay indoors, away from windows.' }
  ];

  // Plain descriptions (PAGASA has no categories for these).
  var TEMP_LEVELS = [
    { to: 20, label: 'Cool', color: C.blue }, { to: 24, label: 'Mild', color: C.teal },
    { to: 28, label: 'Comfortable', color: C.green }, { to: 32, label: 'Warm', color: C.yellow },
    { to: 35, label: 'Hot', color: C.orange }, { to: Infinity, label: 'Very hot', color: C.red }
  ];
  var HUMID_LEVELS = [
    { to: 40, label: 'Dry', color: C.yellow }, { to: 70, label: 'Comfortable', color: C.green },
    { to: 85, label: 'Humid', color: C.teal }, { to: Infinity, label: 'Very humid', color: C.blue }
  ];
  var SUN_LEVELS = [
    { to: 5, label: 'Dark', color: C.slate }, { to: 200, label: 'Overcast', color: C.grey },
    { to: 500, label: 'Bright', color: C.yellow }, { to: 800, label: 'Sunny', color: C.orange },
    { to: Infinity, label: 'Very strong sun', color: C.red }
  ];
  var PRESSURE_LEVELS = [   // 3-hour change in hPa (pressure tendency)
    { to: -3, label: 'Falling fast', color: C.red }, { to: -1, label: 'Falling', color: C.orange },
    { to: 1, label: 'Steady', color: C.green }, { to: 3, label: 'Rising', color: C.teal },
    { to: Infinity, label: 'Rising fast', color: C.blue }
  ];

  function levelIndex(levels, v) {
    if (v == null) return -1;
    for (var i = 0; i < levels.length; i++) if (v < levels[i].to) return i;
    return levels.length - 1;
  }
  function levelOf(levels, v) { var i = levelIndex(levels, v); return i < 0 ? null : levels[i]; }

  // Equal-width bands so every scale reads the same way; the marker sits inside its band.
  function levelBar(levels, v, min, max) {
    var n = levels.length, i = levelIndex(levels, v);
    var segs = levels.map(function (l, k) {
      return '<span class="lv-seg' + (k === i ? ' on' : '') + '" style="background:' + l.color + '"></span>';
    }).join('');
    var thumb = '';
    if (i >= 0) {
      var lo = i === 0 ? min : levels[i - 1].to, hi = levels[i].to === Infinity ? max : levels[i].to;
      var f = hi > lo ? clamp((v - lo) / (hi - lo), 0.08, 0.92) : 0.5;
      thumb = '<span class="lv-thumb" style="left:' + round((i + f) / n * 100, 2) + '%;border-color:' + levels[i].color + '"></span>';
    }
    return '<div class="lv"><div class="lv-track">' + segs + thumb + '</div>' +
      '<div class="lv-ends"><span>' + levels[0].label + '</span><span>' + levels[n - 1].label + '</span></div></div>';
  }

  function chip(level) {
    return level ? '<span class="lvl" style="--c:' + level.color + '"><i></i>' + esc(level.label) + '</span>' : '';
  }

  // PAGASA-style directional names (wind blowing FROM that direction).
  var DIRS = ['Northerly', 'Northeasterly', 'Easterly', 'Southeasterly', 'Southerly', 'Southwesterly', 'Westerly', 'Northwesterly'];
  var FROM = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  var POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function octant(deg) { return Math.round(((deg % 360) + 360) % 360 / 45) % 8; }
  function compassPoint(deg) { return POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

  // ---------- data loading ----------

  function SignedOut() {}

  function fetchList() {
    return fetch(LIST_URL, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('The station list answered ' + res.status + '.');
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.querySelector('input[name="password"]')) throw new SignedOut();
        var table = doc.querySelector('table');
        if (!table) throw new Error('No station table on ' + LIST_URL + '.');
        var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
          return th.textContent.trim().toLowerCase();
        });
        function col(n) { return heads.findIndex(function (h) { return h.indexOf(n) !== -1; }); }
        var idx = {
          recordId: col('record id'), siteId: col('station id'), name: col('station name'),
          temp: col('temperature'), pressure: col('pressure'), wind: col('wind'), rain: col('rain'),
          battery: col('battery'), time: col('last data')
        };
        Object.keys(idx).forEach(function (k) {
          if (idx[k] < 0) throw new Error('Column "' + k + '" is missing from ' + LIST_URL + '; the page may have changed.');
        });
        return Array.prototype.map.call(table.querySelectorAll('tbody tr'), function (tr) {
          var c = tr.children;
          var timeText = c[idx.time].textContent.trim();
          var id = c[idx.recordId].textContent.trim();
          var coord = STATION_COORDS[id];
          return {
            id: id,
            siteId: c[idx.siteId].textContent.trim(),
            name: c[idx.name].textContent.trim(),
            label: prettyName(c[idx.name].textContent),
            temp: num(c[idx.temp].textContent),
            pressure: num(c[idx.pressure].textContent),
            wind: num(c[idx.wind].textContent),
            rain: num(c[idx.rain].textContent),
            battery: num(c[idx.battery].textContent),
            timeText: timeText === '-' ? '' : timeText,
            time: manilaTime(timeText),
            lat: coord ? coord[0] : null,
            lon: coord ? coord[1] : null
          };
        }).filter(function (s) { return s.name && s.id; });
      });
  }

  var DT_COLUMNS = ['id', 'air_temperature_avg', 'solar_radiation_avg', 'barometric_pressure_avg', 'wind_speed',
    'wind_direction', 'relative_humidity_avg', 'accumulated_rain', 'accumulated_rain_total', 'battery_voltage', 'observation_at'];

  function fetchHistory(id) {
    var now = Date.now();
    var p = new URLSearchParams();
    p.set('draw', '1');
    DT_COLUMNS.forEach(function (c, i) {
      p.set('columns[' + i + '][data]', c);
      p.set('columns[' + i + '][name]', '');
      p.set('columns[' + i + '][searchable]', 'true');
      p.set('columns[' + i + '][orderable]', 'true');
      p.set('columns[' + i + '][search][value]', '');
      p.set('columns[' + i + '][search][regex]', 'false');
    });
    p.set('order[0][column]', String(DT_COLUMNS.length - 1));
    p.set('order[0][dir]', 'desc');
    p.set('start', '0');
    p.set('length', String(CONFIG.historyHours * 6 + 12));
    p.set('search[value]', '');
    p.set('search[regex]', 'false');
    p.set('station_id', id);
    p.set('from_date', manilaQuery(now - CONFIG.historyHours * 3600000));
    p.set('to_date', manilaQuery(now + 30 * 60000));
    return fetch(DATA_URL + '?' + p.toString(), {
      credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
    }).then(function (res) {
      if (res.redirected && /\/auth|\/login|\/$/.test(new URL(res.url).pathname)) throw new SignedOut();
      if (!res.ok) throw new Error('The station data answered ' + res.status + '.');
      return res.json();
    }).then(function (json) {
      return (json.data || []).map(function (r) {
        return {
          t: manilaTime(r.observation_at),
          temp: pick('temp', r.air_temperature_avg, r.air_temperature),
          tmin: pick('temp', r.air_temperature_min),
          tmax: pick('temp', r.air_temperature_max),
          rh: pick('rh', r.relative_humidity_avg, r.relative_humidity),
          pressure: pick('pressure', r.barometric_pressure_avg, r.barometric_pressure),
          wind: pick('wind', r.wind_speed),
          gust: pick('wind', r.wind_speed_max),
          dir: pick('dir', r.wind_direction),
          rain: pick('rain', r.accumulated_rain),
          solar: pick('solar', r.solar_radiation_avg, r.solar_radiation),
          battery: pick('battery', r.battery_voltage),
          raw: {
            temp: num(r.air_temperature_avg), tmin: num(r.air_temperature_min), tmax: num(r.air_temperature_max),
            rh: num(r.relative_humidity_avg), pressure: num(r.barometric_pressure_avg), wind: num(r.wind_speed),
            dir: num(r.wind_direction), rain: num(r.accumulated_rain), total: num(r.accumulated_rain_total),
            solar: num(r.solar_radiation_avg), battery: num(r.battery_voltage), at: r.observation_at
          }
        };
      }).filter(function (r) { return r.t != null; })
        .sort(function (a, b) { return a.t - b.t; });
    });
  }
  // First valid value among candidates, else null (sensor problem or missing).
  function pick(key) {
    for (var i = 1; i < arguments.length; i++) {
      var v = num(arguments[i]);
      if (valid(key, v)) return v;
    }
    return null;
  }

  // ---------- station status (shared with the status board) ----------

  var STATES = {
    ok: { label: 'Reporting', rank: 5 },
    late: { label: 'Late', rank: 4 },
    stale: { label: 'Stale', rank: 3 },
    clock: { label: 'Wrong clock', rank: 2 },
    offline: { label: 'Offline', rank: 1 },
    nodata: { label: 'No data', rank: 0 }
  };
  var LIST_FIELDS = [
    { key: 'temp', label: 'Temp', unit: '°C' },
    { key: 'pressure', label: 'Pressure', unit: 'hPa' },
    { key: 'wind', label: 'Wind', unit: CONFIG.windUnit },
    { key: 'rain', label: 'Rain', unit: 'mm' },
    { key: 'battery', label: 'Battery', unit: 'V' }
  ];

  function assess(s, now) {
    var issues = [];
    if (s.time == null) {
      s.state = 'nodata';
      s.ageMin = null;
    } else {
      s.ageMin = (now - s.time) / 60000;
      var a = Math.max(s.ageMin, 0);
      if (s.ageMin < -CONFIG.futureToleranceMin) {
        // A future timestamp means the logger clock is wrong, so its age is unknown.
        issues.push({ field: 'time', level: 'bad', text: 'Timestamp is in the future' });
        s.state = 'clock';
      } else {
        s.state = a > CONFIG.offlineAfterMin ? 'offline' : a > CONFIG.staleAfterMin ? 'stale'
          : a > CONFIG.lateAfterMin ? 'late' : 'ok';
      }
    }
    LIST_FIELDS.forEach(function (f) {
      var v = s[f.key];
      if (v == null) return;
      var lim = CONFIG.limits[f.key];
      if (CONFIG.sentinels.indexOf(v) !== -1) {
        issues.push({ field: f.key, level: 'bad', text: f.label + ' is a missing-value code (' + v + ')' });
      } else if (lim && (v < lim[0] || v > lim[1])) {
        issues.push({ field: f.key, level: 'bad', text: f.label + ' ' + v + ' is outside ' + lim[0] + '–' + lim[1] + ' ' + f.unit });
      } else if (f.key === 'battery' && v < CONFIG.lowBatteryV) {
        issues.push({ field: 'battery', level: 'warn', text: 'Low battery (' + v + ' V)' });
      }
    });
    s.issues = issues;
    s.level = issues.some(function (i) { return i.level === 'bad'; }) ? 'bad' : issues.length ? 'warn' : 'clean';
  }

  function stationById(id) {
    for (var i = 0; i < state.stations.length; i++) if (state.stations[i].id === id) return state.stations[i];
    return null;
  }

  // ---------- location ----------

  function locate() {
    if (!navigator.geolocation) { state.geo = 'unavailable'; render(); return; }
    state.geo = 'asking';
    render();
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.geo = 'ok';
      chooseNearest();
      loadShown();
    }, function () {
      state.geo = 'denied';
      if (!state.selected.length) state.picker = true;
      render();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  }

  // Nearest station that is reporting (or only a little late) and has a location.
  function chooseNearest() {
    if (!state.here || !state.stations.length) return;
    var now = Date.now();
    var best = null;
    state.stations.forEach(function (s) {
      assess(s, now);
      if (s.lat == null) return;
      s.distance = distanceKm(state.here, s);
      if (s.state !== 'ok' && s.state !== 'late') return;
      if (!best || s.distance < best.distance) best = s;
    });
    state.nearestId = best ? best.id : null;
  }

  // The nearest station is shown first when there is a free slot; picked stations are never pushed out.
  function shownIds() {
    var ids = [];
    if (state.nearestId && (state.selected.length < CONFIG.maxShown || state.selected.indexOf(state.nearestId) !== -1)) ids.push(state.nearestId);
    state.selected.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    return ids.slice(0, CONFIG.maxShown);
  }

  // ---------- named groups ----------

  function sameSet(a, b) {
    return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; });
  }
  function currentGroup() {
    if (!state.selected.length) return null;
    for (var i = 0; i < state.groups.length; i++) if (sameSet(state.groups[i].ids, state.selected)) return state.groups[i];
    return null;
  }
  function saveGroup(name) {
    name = (name || '').trim().slice(0, 40);
    if (!name) { alert('Type a name for this group first.'); return false; }
    if (!state.selected.length) { alert('Choose at least one station before saving a group.'); return false; }
    var existing = state.groups.filter(function (g) { return g.name.toLowerCase() === name.toLowerCase(); })[0];
    if (existing && !confirm('Replace the stations in the group "' + existing.name + '"?')) return false;
    if (existing) existing.ids = state.selected.slice();
    else state.groups.push({ name: name, ids: state.selected.slice() });
    state.groups.sort(function (a, b) { return a.name.localeCompare(b.name); });
    state.groupName = '';
    save();
    return true;
  }
  function loadGroup(name) {
    var g = state.groups.filter(function (x) { return x.name === name; })[0];
    if (!g) return;
    state.selected = g.ids.slice(0, CONFIG.maxShown);
    save();
  }
  function deleteGroup(name) {
    if (!confirm('Delete the group "' + name + '"? The stations stay selected.')) return;
    state.groups = state.groups.filter(function (g) { return g.name !== name; });
    save();
  }
  // Stations in scope for the Station status and Maintenance tabs.
  // Your picked stations; with none picked, whatever the Weather tab shows (the nearest station).
  function scopeIds() { return state.selected.length ? state.selected : shownIds(); }
  function scopedStations() {
    if (state.scope !== 'selected') return state.stations;
    var ids = scopeIds();
    return state.stations.filter(function (s) { return ids.indexOf(s.id) !== -1; });
  }
  function scopeSwitch() {
    var g = currentGroup(), n = scopeIds().length;
    return '<div class="seg" role="group" aria-label="Which stations">' +
      '<button data-scope="all" class="' + (state.scope === 'all' ? 'on' : '') + '">All stations</button>' +
      '<button data-scope="selected" class="' + (state.scope === 'selected' ? 'on' : '') + '">' +
      (g ? esc(g.name) : 'Selected') + ' (' + n + ')</button></div>';
  }

  // ---------- refresh cycle ----------

  function refresh() {
    clearTimeout(state.timer);
    state.refreshing = true;
    render();
    return fetchList().then(function (list) {
      state.stations = list;
      state.listAt = Date.now();
      state.listError = null;
      chooseNearest();
    }).catch(function (err) {
      state.listError = err instanceof SignedOut ? 'signedout' : (err && err.message) || 'Could not read the station list.';
    }).then(function () {
      return loadShown(true);
    }).then(function () {
      state.refreshing = false;
      state.nextRefresh = Date.now() + CONFIG.refreshMinutes * 60000;
      state.timer = setTimeout(refresh, CONFIG.refreshMinutes * 60000);
      render();
    });
  }

  // Load history for shown stations one at a time (gentle on the server).
  function loadShown(force) {
    if (state.listError === 'signedout') return Promise.resolve();
    var ids = shownIds().filter(function (id) {
      var d = state.details[id];
      return force || !d || (!d.rows && !d.loading);
    });
    return ids.reduce(function (chain, id) {
      return chain.then(function () {
        var d = state.details[id] = state.details[id] || {};
        d.loading = true;
        render();
        return fetchHistory(id).then(function (rows) {
          d.rows = rows;
          d.error = null;
          d.at = Date.now();
        }).catch(function (err) {
          if (err instanceof SignedOut) state.listError = 'signedout';
          d.error = (err && err.message) || 'Could not load this station.';
        }).then(function () {
          d.loading = false;
          render();
        });
      });
    }, Promise.resolve());
  }

  // ---------- summaries for one station ----------

  function summarize(rows) {
    if (!rows || !rows.length) return null;
    var last = rows[rows.length - 1];
    function latest(key, withinMin) {
      for (var i = rows.length - 1; i >= 0; i--) {
        if (last.t - rows[i].t > (withinMin || 30) * 60000) break;
        if (rows[i][key] != null) return rows[i][key];
      }
      return null;
    }
    function sumSince(key, minutes) {
      var total = 0, any = false;
      rows.forEach(function (r) {
        if (last.t - r.t < minutes * 60000 && r[key] != null) { total += r[key]; any = true; }
      });
      return any ? total : null;
    }
    function valueNear(key, minutesAgo) {
      var target = last.t - minutesAgo * 60000, best = null;
      rows.forEach(function (r) {
        if (r[key] == null) return;
        if (!best || Math.abs(r.t - target) < Math.abs(best.t - target)) best = r;
      });
      return best && Math.abs(best.t - target) <= 30 * 60000 ? best[key] : null;
    }
    var temps = rows.filter(function (r) { return r.temp != null; });
    var hiList = rows.map(function (r) { return heatIndex(r.temp, r.rh); }).filter(function (v) { return v != null; });

    var s = {
      time: last.t,
      temp: latest('temp'),
      rh: latest('rh'),
      pressure: latest('pressure'),
      wind: latest('wind'),
      dir: latest('dir'),
      solar: latest('solar'),
      battery: latest('battery'),
      rain1h: sumSince('rain', 60),
      rain3h: sumSince('rain', 180),
      rain24h: sumSince('rain', 24 * 60),
      tmax: temps.length ? Math.max.apply(null, temps.map(function (r) { return r.tmax != null ? r.tmax : r.temp; })) : null,
      tmin: temps.length ? Math.min.apply(null, temps.map(function (r) { return r.tmin != null ? r.tmin : r.temp; })) : null,
      himax: hiList.length ? Math.max.apply(null, hiList) : null
    };
    var p3 = valueNear('pressure', 180);
    s.ptrend = s.pressure != null && p3 != null ? s.pressure - p3 : null;
    s.hi = heatIndex(s.temp, s.rh);
    s.dew = dewPoint(s.temp, s.rh);
    s.windKmh = toKmh(s.wind);
    s.heat = levelOf(HEAT_LEVELS, s.hi);
    s.rainLv = levelOf(RAIN_LEVELS, s.rain1h);
    s.windLv = levelOf(WIND_LEVELS, s.windKmh);
    s.night = s.solar != null && s.solar < 5;
    return s;
  }

  // Main condition for the scene picture and headline.
  function condition(s) {
    var r = s.rainLv ? RAIN_LEVELS.indexOf(s.rainLv) : 0;
    if (r >= 4) return { scene: 'storm', word: s.rainLv.label + ' rain' };
    if (r >= 1) return { scene: 'rain', word: s.rainLv.label + ' rain' };
    if (s.windLv && WIND_LEVELS.indexOf(s.windLv) >= 4) return { scene: 'wind', word: s.windLv.label + ' winds' };
    if (s.solar == null) return { scene: 'cloud', word: 'No sunlight reading' };
    if (s.night) return { scene: 'night', word: 'Night time' };
    if (s.solar < 200) return { scene: 'cloud', word: 'Cloudy' };
    if (s.solar < 500) return { scene: 'partly', word: 'Partly cloudy' };
    return { scene: 'sun', word: 'Sunny' };
  }

  // The single most important message, most serious first.
  function advice(s) {
    var tones = { danger: 3, warn: 2, info: 1, good: 0 };
    var picks = [];
    if (s.rainLv && s.rain1h > 0) picks.push({ tone: s.rainLv.tone, text: s.rainLv.say });
    if (s.windLv && WIND_LEVELS.indexOf(s.windLv) >= 3) picks.push({ tone: s.windLv.tone, text: s.windLv.say });
    if (s.heat && HEAT_LEVELS.indexOf(s.heat) >= 1) {
      picks.push({ tone: s.heat.tone, text: 'Heat index ' + Math.round(s.hi) + '°C — ' + s.heat.label + '. ' + s.heat.say });
    }
    picks.sort(function (a, b) { return tones[b.tone] - tones[a.tone]; });
    if (picks.length) return picks[0];
    if (s.night) return { tone: 'good', text: 'Calm night conditions at this station.' };
    return { tone: 'good', text: 'No weather hazards at this station right now.' };
  }

  // ---------- icons (24×24 line icons, currentColor) ----------

  var ICON_PATHS = {
    thermo: '<path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z"/><path d="M12 9v8"/>',
    heat: '<path d="M12 3c1.5 3 5 5.2 5 9.5a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.5-5 .2 2 1.1 3 2.3 3.3C11.4 8.2 11 5.6 12 3z"/>',
    drop: '<path d="M12 3.5 17.7 10a7 7 0 1 1-11.4 0z"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 7.4 3.8 3.8 0 0 1 17.4 15z"/><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2"/>',
    chart: '<path d="M4 4v16h16"/><path d="M7.5 14l3.5-4 3 3 4.5-6"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.6"/>',
    battery: '<rect x="3" y="7.5" width="16" height="9" rx="2"/><path d="M21 11v2"/><path d="M6 10.5v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    signal: '<path d="M5 18v-2M9.5 18v-5M14 18V9M18.5 18V5"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/>' +
      '<rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';
  }

  // ---------- pictures (inline SVG) ----------

  var uid = 0;
  var CLOUD_SHAPES = '<rect x="17" y="30" width="16" height="7"/><circle cx="17" cy="31" r="6"/>' +
    '<circle cx="25.5" cy="25" r="8.5"/><circle cx="33" cy="30.5" r="6.5"/>';

  // Logo mark (same artwork as logo/logo-mark.svg). gid keeps gradient ids unique per copy.
  function logoMark(gid, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"' + (size ? ' width="' + size + '" height="' + size + '"' : '') +
      ' aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#19b8c9"/></linearGradient></defs>' +
      '<rect width="48" height="48" rx="12" fill="url(#' + gid + ')"/>' + sunRays(32, 15, '#ffd34e') +
      '<circle cx="32" cy="15" r="6" fill="#ffd34e"/>' +
      '<g fill="#0b2a6b" opacity=".16" transform="translate(0 1.6)">' + CLOUD_SHAPES + '</g><g fill="#fff">' + CLOUD_SHAPES + '</g></svg>';
  }
  function sunRays(cx, cy, color) {
    var out = '<g stroke="' + color + '" stroke-width="2.4" stroke-linecap="round">';
    [[0, -10.5, 0, -8.5], [7.4, -7.4, 6, -6], [10.5, 0, 8.5, 0], [-7.4, -7.4, -6, -6], [7.4, 7.4, 6, 6]].forEach(function (r) {
      out += '<line x1="' + (cx + r[0]) + '" y1="' + (cy + r[1]) + '" x2="' + (cx + r[2]) + '" y2="' + (cy + r[3]) + '"/>';
    });
    return out + '</g>';
  }

  // Weather scene in the logo's style: a sky tile with sun / moon / clouds / rain.
  function scene(kind, night) {
    var gid = 'sc' + (++uid);
    var sky = night ? ['#1b2a5c', '#3d3f8f'] : kind === 'storm' ? ['#3a4660', '#5d6c8a'] :
      kind === 'rain' || kind === 'cloud' || kind === 'wind' ? ['#4f6f9f', '#7f9cc0'] : ['#2f6bff', '#19b8c9'];
    var body = '';
    var cloud = function (dx, dy, fill, shade) {
      return '<g transform="translate(' + dx + ' ' + dy + ')">' +
        (shade ? '<g fill="#0b1a40" opacity=".18" transform="translate(0 1.6)">' + CLOUD_SHAPES + '</g>' : '') +
        '<g fill="' + fill + '">' + CLOUD_SHAPES + '</g></g>';
    };
    var moon = '<path d="M36 7.5a9 9 0 1 0 6.5 13.4A7 7 0 0 1 36 7.5z" fill="#ffd34e"/>';
    var sun = sunRays(32, 15, '#ffd34e') + '<circle cx="32" cy="15" r="6" fill="#ffd34e"/>';
    var drops = function (color) {
      return '<g stroke="' + color + '" stroke-width="2.4" stroke-linecap="round">' +
        '<line x1="18" y1="40" x2="16.5" y2="44"/><line x1="25" y1="40" x2="23.5" y2="44"/><line x1="32" y1="40" x2="30.5" y2="44"/></g>';
    };
    if (kind === 'sun') {
      body = sunRaysBig() + '<circle cx="24" cy="24" r="9" fill="#ffd34e"/>';
    } else if (kind === 'night') {
      body = '<path d="M29 10a14 14 0 1 0 10 21A11 11 0 0 1 29 10z" fill="#ffd34e"/>' +
        '<circle cx="12" cy="13" r="1.2" fill="#fff" opacity=".8"/><circle cx="38" cy="38" r="1" fill="#fff" opacity=".7"/>' +
        '<circle cx="9" cy="33" r="1" fill="#fff" opacity=".6"/>';
    } else if (kind === 'partly') {
      body = (night ? moon : sun) + cloud(0, 0, '#fff', true);
    } else if (kind === 'cloud') {
      body = cloud(6, -9, '#dbe4f0', false) + cloud(-3, 2, '#fff', true);
    } else if (kind === 'rain') {
      body = (night ? moon : '') + cloud(0, -4, '#fff', true) + drops('#bfe0ff');
    } else if (kind === 'storm') {
      body = cloud(0, -5, '#e4e9f2', true) + drops('#bfe0ff') +
        '<path d="M27 33l-5 7h4l-2 6 7-9h-4.5l2.5-4z" fill="#ffd34e"/>';
    } else if (kind === 'wind') {
      body = '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">' +
        '<path d="M8 18h20a5 5 0 1 0-5-5"/><path d="M8 25h28a5 5 0 1 1-5 5"/><path d="M8 32h12"/></g>';
    }
    return '<svg class="scene" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="' + gid +
      '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + sky[0] + '"/><stop offset="1" stop-color="' + sky[1] +
      '"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#' + gid + ')"/>' + body + '</svg>';
  }
  function sunRaysBig() {
    var out = '<g stroke="#ffd34e" stroke-width="2.6" stroke-linecap="round">';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      out += '<line x1="' + round(24 + 13 * Math.cos(a), 2) + '" y1="' + round(24 + 13 * Math.sin(a), 2) +
        '" x2="' + round(24 + 16.5 * Math.cos(a), 2) + '" y2="' + round(24 + 16.5 * Math.sin(a), 2) + '"/>';
    }
    return out + '</g>';
  }

  // Small companion visuals for the tiles.
  function svgThermometer(t, color) {
    var frac = t == null ? 0 : clamp((t - 10) / 30, 0, 1), h = 70 * frac;
    return '<svg class="pic" viewBox="0 0 40 120" aria-hidden="true">' +
      '<rect x="13" y="6" width="14" height="88" rx="7" class="glass"/><circle cx="20" cy="102" r="12" class="glass"/>' +
      '<rect x="16.5" y="' + (90 - h) + '" width="7" height="' + (h + 8) + '" rx="3.5" fill="' + color + '"/>' +
      '<circle cx="20" cy="102" r="8" fill="' + color + '"/></svg>';
  }
  function svgDrop(rh, color) {
    var id = 'dr' + (++uid), frac = rh == null ? 0 : clamp(rh / 100, 0, 1), top = 10 + 98 * (1 - frac);
    var d = 'M40 6 C40 6 10 46 10 72 A30 30 0 0 0 70 72 C70 46 40 6 40 6 Z';
    return '<svg class="pic" viewBox="0 0 80 110" aria-hidden="true"><clipPath id="' + id + '"><path d="' + d + '"/></clipPath>' +
      '<path d="' + d + '" class="glass"/><g clip-path="url(#' + id + ')"><rect x="0" y="' + top + '" width="80" height="110" fill="' + color + '" opacity=".85"/></g></svg>';
  }
  function svgCompass(dir, calm, color) {
    var letters = [['N', 50, 15], ['E', 87, 54], ['S', 50, 93], ['W', 13, 54]].map(function (l) {
      return '<text x="' + l[1] + '" y="' + l[2] + '" text-anchor="middle" class="cmp-t">' + l[0] + '</text>';
    }).join('');
    // Arrow points where the wind is blowing TO (stations report where it comes FROM).
    var arrow = calm || dir == null
      ? '<circle cx="50" cy="50" r="6" fill="' + color + '"/>'
      : '<g transform="rotate(' + ((dir + 180) % 360) + ' 50 50)"><line x1="50" y1="72" x2="50" y2="34" stroke="' + color +
        '" stroke-width="6" stroke-linecap="round"/><path d="M50 22l-11 15h22z" fill="' + color + '"/></g>';
    return '<svg class="pic" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="glass"/>' +
      '<circle cx="50" cy="50" r="33" fill="none" class="ring"/>' + letters + arrow + '</svg>';
  }
  function svgGauge(mm, color) {   // rain gauge cylinder, full at 30 mm/h (Red level)
    var id = 'rg' + (++uid), frac = mm == null ? 0 : clamp(mm / 30, 0, 1), top = 100 - 84 * frac;
    var lines = [[7.5, 'Y'], [15, 'O'], [30, 'R']].map(function (m) {
      var y = 100 - 84 * m[0] / 30;
      return '<line x1="52" x2="60" y1="' + y + '" y2="' + y + '" class="tick"/>';
    }).join('');
    return '<svg class="pic" viewBox="0 0 70 110" aria-hidden="true"><clipPath id="' + id + '"><rect x="12" y="10" width="38" height="92" rx="8"/></clipPath>' +
      '<rect x="12" y="10" width="38" height="92" rx="8" class="glass"/><g clip-path="url(#' + id + ')"><rect x="12" y="' + top +
      '" width="38" height="110" fill="' + color + '" opacity=".85"/></g>' + lines + '</svg>';
  }
  function svgSun(w, color) {
    if (w != null && w < 5) {
      return '<svg class="pic" viewBox="0 0 100 100" aria-hidden="true"><path d="M60 18a34 34 0 1 0 22 52A27 27 0 0 1 60 18z" fill="' + color + '"/></svg>';
    }
    var f = w == null ? 0 : clamp(w / 1000, 0, 1), rays = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, r2 = 30 + 16 * f;
      rays += '<line x1="' + round(50 + 27 * Math.cos(a), 1) + '" y1="' + round(50 + 27 * Math.sin(a), 1) + '" x2="' +
        round(50 + r2 * Math.cos(a), 1) + '" y2="' + round(50 + r2 * Math.sin(a), 1) + '"/>';
    }
    return '<svg class="pic" viewBox="0 0 100 100" aria-hidden="true"><g stroke="' + color + '" stroke-width="5" stroke-linecap="round" opacity="' +
      round(0.35 + 0.65 * f, 2) + '">' + rays + '</g><circle cx="50" cy="50" r="21" fill="' + color + '" opacity="' + round(0.45 + 0.55 * f, 2) + '"/></svg>';
  }

  function sparkline(rows, key, color) {
    var pts = rows.filter(function (r) { return r[key] != null; });
    if (pts.length < 2) return '';
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    var vals = pts.map(function (r) { return r[key]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
    var d = pts.map(function (r, i) {
      var x = 2 + 196 * (r.t - t0) / Math.max(1, t1 - t0);
      var y = 26 - 22 * (r[key] - lo) / (hi - lo);
      return (i ? 'L' : 'M') + round(x, 1) + ' ' + round(y, 1);
    }).join(' ');
    return '<svg viewBox="0 0 200 30" class="spark" preserveAspectRatio="none" aria-hidden="true"><path d="' + d +
      '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }

  // 24-hour chart: temperature and heat index above, 10-minute rainfall below.
  function svgDayChart(allRows) {
    var t1 = allRows[allRows.length - 1].t, t0 = t1 - CONFIG.historyHours * 3600000;
    var rows = allRows.filter(function (r) { return r.t >= t0; });
    var pts = rows.filter(function (r) { return r.temp != null; });
    if (pts.length < 2) return '<p class="muted">Not enough readings for a 24-hour chart yet.</p>';
    var W = 680, L = 40, R = 12, top = 12, mid = 136, bottom = 196;
    function x(t) { return L + (W - L - R) * (t - t0) / (t1 - t0); }
    var his = pts.map(function (r) { return heatIndex(r.temp, r.rh); });
    var all = pts.map(function (r) { return r.temp; }).concat(his.filter(function (v) { return v != null; }));
    var lo = Math.floor(Math.min.apply(null, all) - 1), hi = Math.ceil(Math.max.apply(null, all) + 1);
    function y(v) { return mid - (mid - top) * (v - lo) / (hi - lo); }
    function path(vals) {
      var d = '', pen = false;
      pts.forEach(function (r, i) {
        var v = vals[i];
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + round(x(r.t), 1) + ' ' + round(y(v), 1) + ' ';
        pen = true;
      });
      return d;
    }
    var grid = '', step = hi - lo > 12 ? 4 : 2;
    for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="ax">' + g + '°</text>';
    }
    var hours = '', first = Math.ceil(t0 / 10800000) * 10800000;
    for (var t = first; t <= t1; t += 10800000) {
      var hr = new Date(t + 8 * 3600000).getUTCHours();
      var lbl = hr === 0 ? '12 AM' : hr === 12 ? '12 PM' : hr < 12 ? hr + ' AM' : (hr - 12) + ' PM';
      hours += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + bottom + '" class="grid"/>' +
        '<text x="' + x(t) + '" y="' + (bottom + 16) + '" text-anchor="middle" class="ax">' + lbl + '</text>';
    }
    var rainRows = rows.filter(function (r) { return r.rain != null && r.rain > 0; });
    var rmax = Math.max(2, Math.max.apply(null, rainRows.map(function (r) { return r.rain; }).concat([0])));
    var bars = rainRows.map(function (r) {
      var h = (bottom - mid - 14) * r.rain / rmax;
      return '<rect x="' + round(x(r.t) - 2, 1) + '" y="' + round(bottom - h, 1) + '" width="4" height="' + round(h, 1) + '" rx="1.5" fill="' + C.blue + '"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + (bottom + 22) + '" class="day" role="img" aria-label="Temperature, heat index and rainfall over the last 24 hours">' +
      grid + hours +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + bottom + '" y2="' + bottom + '" class="axis"/>' +
      '<text x="' + (L + 4) + '" y="' + (mid + 14) + '" class="ax">Rainfall per 10 min' + (rainRows.length ? ' (max ' + fmt(rmax, 1) + ' mm)' : ' — none') + '</text>' +
      bars +
      '<path d="' + path(his) + '" fill="none" stroke="' + C.red + '" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<path d="' + path(pts.map(function (r) { return r.temp; })) + '" fill="none" stroke="' + C.orange + '" stroke-width="3" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="legend"><span><i style="background:' + C.orange + '"></i>Temperature</span>' +
      '<span><i class="dash" style="border-color:' + C.red + '"></i>Heat index</span>' +
      '<span><i style="background:' + C.blue + '"></i>Rainfall</span></div>';
  }

  // ---------- render: weather view ----------

  function tile(o) {
    return '<section class="tile">' +
      '<header class="tile-h"><span class="tile-ic" style="--c:' + o.color + '">' + icon(o.icon) + '</span>' + o.title + '</header>' +
      '<div class="tile-b"><div class="tile-main"><div class="val">' + o.value + '</div>' + (o.chip || '') + '</div>' +
      (o.pic ? '<div class="tile-pic">' + o.pic + '</div>' : '') + '</div>' +
      (o.bar || '') +
      (o.say ? '<p class="say">' + o.say + '</p>' : '') +
      (o.foot ? '<div class="foot">' + o.foot + '</div>' : '') + '</section>';
  }
  function unit(u) { return '<small>' + u + '</small>'; }
  function sensorNote(what) { return '<span class="lvl" style="--c:' + C.grey + '"><i></i>' + what + ' sensor needs checking</span>'; }

  function stationCard(id) {
    var st = stationById(id);
    var d = state.details[id] || {};
    var name = st ? st.label : 'Station ' + id;
    var isNearest = id === state.nearestId;
    var near = isNearest
      ? '<span class="tag near">' + icon('pin') + 'Nearest to you' + (st && st.distance != null ? ' · ' + Math.round(st.distance) + ' km' : '') + '</span>'
      : '';
    var removeBtn = state.selected.indexOf(id) !== -1
      ? '<button class="icon-btn" data-remove="' + esc(id) + '" title="Remove this station" aria-label="Remove this station">' + icon('close') + '</button>' : '';
    var head = '<header class="card-h"><div><h2>' + esc(name) + '</h2>' +
      (st ? '<div class="sub">Station ' + esc(st.siteId) + '</div>' : '') + '</div>' + removeBtn + '</header>';

    if (d.error && !d.rows) return '<article class="card">' + head + '<p class="msg">' + esc(d.error) + '</p></article>';
    if (!d.rows) return '<article class="card loading">' + head + '<p class="msg muted">Loading the latest readings…</p></article>';

    var s = summarize(d.rows);
    if (!s) {
      return '<article class="card">' + head + '<p class="msg">This station has not sent data in the last ' + CONFIG.historyHours + ' hours.' +
        (st && st.timeText ? ' Last report: ' + esc(st.timeText) + '.' : '') +
        (st && st.state === 'clock' ? ' Its clock is set wrong, so its readings may be filed under the wrong date.' : '') + '</p></article>';
    }
    var age = (Date.now() - s.time) / 60000;
    var cond = condition(s);
    var live = age <= CONFIG.lateAfterMin
      ? '<span class="tag live"><i class="dot"></i>Live · updated ' + ageText(age) + '</span>'
      : '<span class="tag late"><i class="dot"></i>Delayed · last update ' + ageText(age) + '</span>';
    var battery = s.battery != null && s.battery < CONFIG.lowBatteryV
      ? '<span class="tag late">' + icon('battery') + 'Low battery ' + fmt(s.battery) + ' V</span>' : '';
    var tags = '<div class="tags">' + near + live + '<span class="tag">' + icon('clock') + clock(s.time) + '</span>' + battery + '</div>';

    var adv = advice(s);
    var tempLv = levelOf(TEMP_LEVELS, s.temp);
    var hero = '<div class="hero">' + scene(cond.scene, s.night) +
      '<div class="hero-main"><div class="hero-t">' + (s.temp == null ? '—' : Math.round(s.temp) + '°') + '</div>' +
      '<div class="hero-w">' + esc(cond.word) + '</div>' +
      (s.hi != null ? '<div class="hero-f">Heat index <b>' + Math.round(s.hi) + '°C</b>' + (s.heat ? ' · ' + s.heat.label : '') + '</div>' : '') +
      '</div><div class="advice ' + adv.tone + '">' + icon(adv.tone === 'good' ? 'check' : adv.tone === 'info' ? 'info' : 'alert') +
      '<p>' + esc(adv.text) + '</p></div></div>';

    var tiles = [];

    tiles.push(tile({
      icon: 'thermo', title: 'Temperature', color: tempLv ? tempLv.color : C.grey,
      value: s.temp == null ? '—' : fmt(s.temp) + unit('°C'),
      chip: s.temp == null ? sensorNote('Temperature') : chip(tempLv),
      pic: svgThermometer(s.temp, tempLv ? tempLv.color : C.grey),
      bar: levelBar(TEMP_LEVELS, s.temp, 15, 40),
      foot: s.tmin != null ? '24-h low <b>' + fmt(s.tmin) + '°</b> · high <b>' + fmt(s.tmax) + '°</b>' + sparkline(d.rows, 'temp', C.orange) : ''
    }));

    tiles.push(tile({
      icon: 'heat', title: 'Heat index', color: s.heat ? s.heat.color : C.grey,
      value: s.hi == null ? '—' : Math.round(s.hi) + unit('°C'),
      chip: s.heat ? chip(s.heat) : '<span class="muted">Needs temperature and humidity</span>',
      bar: levelBar(HEAT_LEVELS, s.hi, 20, 60),
      say: s.heat ? esc(s.heat.say) : '',
      foot: 'How hot it feels when humidity is added' + (s.himax != null ? ' · 24-h peak <b>' + Math.round(s.himax) + '°C</b>' : '')
    }));

    var rl = s.rainLv;
    tiles.push(tile({
      icon: 'rain', title: 'Rainfall · last hour', color: rl ? rl.color : C.grey,
      value: s.rain1h == null ? '—' : fmt(s.rain1h) + unit('mm/h'),
      chip: rl ? chip(rl) + (rl.warn ? '<span class="lvl outline" style="--c:' + rl.color + '">' + rl.warn + ' warning level</span>' : '') : sensorNote('Rain'),
      pic: svgGauge(s.rain1h, rl ? rl.color : C.grey),
      bar: levelBar(RAIN_LEVELS, s.rain1h, 0, 40),
      say: rl && s.rain1h > 0 ? esc(rl.say) : '',
      foot: 'Last 3 h <b>' + fmt(s.rain3h) + ' mm</b> · last 24 h <b>' + fmt(s.rain24h) + ' mm</b>'
    }));

    var wl = s.windLv, calm = s.windKmh != null && s.windKmh < 2;
    tiles.push(tile({
      icon: 'wind', title: 'Wind', color: wl ? wl.color : C.grey,
      value: s.windKmh == null ? '—' : Math.round(s.windKmh) + unit('km/h'),
      chip: s.windKmh == null ? sensorNote('Wind') : chip(wl),
      pic: svgCompass(s.dir, calm, wl ? wl.color : C.grey),
      bar: levelBar(WIND_LEVELS, s.windKmh, 0, 150),
      say: wl ? esc(wl.say) : '',
      foot: s.windKmh == null ? '' : calm || s.dir == null ? 'No steady direction'
        : '<b>' + DIRS[octant(s.dir)] + '</b> — blowing from the ' + FROM[octant(s.dir)] + ' (' + compassPoint(s.dir) + ', ' + Math.round(s.dir) + '°)'
    }));

    var hl = levelOf(HUMID_LEVELS, s.rh);
    tiles.push(tile({
      icon: 'drop', title: 'Relative humidity', color: hl ? hl.color : C.grey,
      value: s.rh == null ? '—' : Math.round(s.rh) + unit('%'),
      chip: s.rh == null ? sensorNote('Humidity') : chip(hl),
      pic: svgDrop(s.rh, C.blue),
      bar: levelBar(HUMID_LEVELS, s.rh, 20, 100),
      foot: s.dew != null ? 'Dew point <b>' + fmt(s.dew) + '°C</b> — the closer it is to the temperature, the muggier it feels' : ''
    }));

    var sl = levelOf(SUN_LEVELS, s.solar);
    tiles.push(tile({
      icon: 'sun', title: 'Sunshine', color: sl ? sl.color : C.grey,
      value: s.solar == null ? '—' : Math.round(s.solar) + unit('W/m²'),
      chip: s.solar == null ? sensorNote('Sunlight') : chip(sl),
      pic: svgSun(s.solar, sl ? sl.color : C.grey),
      bar: levelBar(SUN_LEVELS, s.solar, 0, 1100),
      foot: s.solar != null ? 'Sunlight energy reaching the ground; a clear noon is about 1000' + sparkline(d.rows, 'solar', C.yellow) : ''
    }));

    var pl = levelOf(PRESSURE_LEVELS, s.ptrend);
    tiles.push(tile({
      icon: 'gauge', title: 'Air pressure', color: pl ? pl.color : C.grey,
      value: s.pressure == null ? '—' : fmt(s.pressure) + unit('hPa'),
      chip: s.pressure == null ? sensorNote('Pressure') : pl ? chip(pl) : '',
      bar: pl ? levelBar(PRESSURE_LEVELS, s.ptrend, -5, 5) : '',
      say: pl ? 'Change in the last 3 hours: <b>' + (s.ptrend > 0 ? '+' : '') + fmt(s.ptrend) + ' hPa</b>. A fast fall can mean stormy weather is coming.' : '',
      foot: s.pressure != null ? 'Station-level pressure (not sea-level)' + sparkline(d.rows, 'pressure', C.indigo) : ''
    }));

    return '<article class="card">' + head + tags + hero + '<div class="tiles">' + tiles.join('') + '</div>' +
      '<section class="tile wide"><header class="tile-h"><span class="tile-ic" style="--c:' + C.blue + '">' + icon('chart') +
      '</span>Last 24 hours</header>' + svgDayChart(d.rows) + '</section>' +
      '<p class="fine">Readings from this automatic weather station. Levels use PAGASA heat index and rainfall classifications; ' +
      'they describe this station only and are not official PAGASA warnings.</p></article>';
  }

  function weatherView() {
    var out = '';
    var geoNote = {
      idle: '',
      asking: '<div class="note">' + icon('pin') + 'Finding your location to show the nearest station…</div>',
      denied: '<div class="note">' + icon('pin') + '<span>Location is off, so the nearest station can’t be chosen. ' +
        '<button class="link" data-act="locate">Try again</button> or <button class="link" data-act="pick">choose stations</button>.</span></div>',
      unavailable: '<div class="note">' + icon('pin') + '<span>This browser can’t share its location. <button class="link" data-act="pick">Choose stations</button>.</span></div>',
      ok: ''
    }[state.geo];
    out += geoNote;
    if (state.geo === 'ok' && !state.nearestId && state.stations.length) {
      out += '<div class="note">' + icon('pin') + 'No working station with a known location was found near you.</div>';
    }
    var ids = shownIds();
    if (!ids.length && state.geo !== 'asking') {
      out += '<div class="empty">' + scene('partly', false) + '<p>Choose a weather station to see its latest readings.</p>' +
        '<button class="btn primary" data-act="pick">' + icon('plus') + 'Choose stations</button></div>';
    }
    out += '<div class="cards' + (ids.length > 1 ? ' multi' : '') + '">' + ids.map(stationCard).join('') + '</div>';
    return out;
  }


  // ---------- render: fit-to-screen overview ----------

  // Columns × rows that fill the window for n stations.
  function fitGrid(n) {
    if (window.innerWidth < 700) { var c = n <= 1 ? 1 : 2; return { cols: c, rows: Math.ceil(n / c) }; }
    var landscape = window.innerWidth / Math.max(1, window.innerHeight) > 1.5;
    var cols = n <= 3 ? n : n === 4 ? (landscape ? 4 : 2) : n <= 6 ? 3 : 4;
    return { cols: cols, rows: Math.ceil(n / cols) };
  }

  function metricRow(name, label, value, level) {
    return '<div class="fm"><span class="fm-ic" style="--c:' + (level ? level.color : C.grey) + '">' + icon(name) + '</span>' +
      '<span class="fm-l">' + label + '</span><span class="fm-v">' + value + '</span>' + (level ? chip(level) : '<span></span>') + '</div>';
  }

  function fitCard(id) {
    var st = stationById(id), d = state.details[id] || {};
    function wrap(inner) {
      return '<div class="fcell"><article class="fc" data-open="' + esc(id) + '" title="Show full details">' + inner + '</article></div>';
    }
    var head = '<header class="fc-h">' + (id === state.nearestId ? '<span class="fc-near" title="Nearest to you">' + icon('pin') + '</span>' : '') +
      '<h3>' + esc(st ? st.label : 'Station ' + id) + '</h3>';
    if (d.error && !d.rows) return wrap(head + '</header><p class="fc-msg">' + esc(d.error) + '</p>');
    if (!d.rows) return wrap(head + '</header><p class="fc-msg muted">Loading…</p>');
    var s = summarize(d.rows);
    if (!s) {
      return wrap(head + '</header><div class="fc-msg">' + (st ? '<span class="pill ' + st.state + '">' + STATES[st.state].label + '</span>' : '') +
        '<p>No data in the last ' + CONFIG.historyHours + ' hours.</p>' +
        (st && st.timeText ? '<p class="muted">Last report: ' + esc(st.timeText) + (st.state === 'clock' ? ' (clock set wrong)' : '') + '</p>' : '') + '</div>');
    }
    var fresh = (Date.now() - s.time) / 60000 <= CONFIG.lateAfterMin;
    head += '<span class="fc-age ' + (fresh ? 'live' : 'late') + '" title="' + (fresh ? 'Live' : 'Delayed') + '"><i class="dot"></i>' +
      clock(s.time) + '</span></header>';
    var cond = condition(s), adv = advice(s);
    var hero = '<div class="fc-hero">' + scene(cond.scene, s.night) +
      '<div class="fc-now"><div class="fc-t">' + (s.temp == null ? '—' : Math.round(s.temp) + '°') + '</div>' +
      '<div class="fc-w">' + esc(cond.word) + '</div></div>' +
      '<div class="fc-hi"><span class="fc-hl">Heat index</span><b>' + (s.hi == null ? '—' : Math.round(s.hi) + '°C') + '</b>' + chip(s.heat) + '</div></div>';
    var wind = s.windKmh == null ? '—' : Math.round(s.windKmh) + ' km/h' + (s.windKmh >= 2 && s.dir != null ? ' ' + compassPoint(s.dir) : '');
    var rows = metricRow('rain', 'Rain', s.rain1h == null ? '—' : fmt(s.rain1h) + ' mm/h', s.rainLv) +
      metricRow('wind', 'Wind', wind, s.windLv) +
      metricRow('drop', 'Humidity', s.rh == null ? '—' : Math.round(s.rh) + '%', levelOf(HUMID_LEVELS, s.rh)) +
      metricRow('sun', 'Sunshine', s.solar == null ? '—' : Math.round(s.solar) + ' W/m²', levelOf(SUN_LEVELS, s.solar)) +
      metricRow('gauge', 'Pressure', s.pressure == null ? '—' : fmt(s.pressure, 0) + ' hPa', levelOf(PRESSURE_LEVELS, s.ptrend));
    var advHtml = '<div class="advice fc-adv ' + adv.tone + '">' +
      icon(adv.tone === 'good' ? 'check' : adv.tone === 'info' ? 'info' : 'alert') + '<span>' + esc(adv.text) + '</span></div>';
    return wrap(head + hero + '<div class="fc-rows">' + rows + '</div>' + advHtml);
  }

  function fitView() {
    var ids = shownIds();
    if (!ids.length) return weatherView();
    var g = fitGrid(ids.length);
    return '<div class="fit" style="grid-template-columns:repeat(' + g.cols + ',minmax(0,1fr));grid-template-rows:repeat(' +
      g.rows + ',minmax(0,1fr))">' + ids.map(fitCard).join('') + '</div>';
  }

  // ---------- render: station picker ----------

  function pickerView() {
    var q = state.pickerQuery.trim().toLowerCase();
    var now = Date.now();
    var list = state.stations.slice();
    list.forEach(function (s) { assess(s, now); });
    list.sort(function (a, b) {
      if (state.here && a.distance != null && b.distance != null) return a.distance - b.distance;
      return a.label.localeCompare(b.label);
    });
    var rows = list.filter(function (s) {
      return !q || s.name.toLowerCase().indexOf(q) !== -1 || s.siteId.indexOf(q) !== -1;
    }).map(function (s) {
      var on = state.selected.indexOf(s.id) !== -1;
      var nearest = s.id === state.nearestId;
      return '<label class="pick-row' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-pick="' + esc(s.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pick-name">' + esc(s.label) + (nearest ? '<em>Nearest to you' + (on ? '' : ' — shown when there is a free slot') + '</em>' : '') + '</span>' +
        '<span class="pick-km">' + (s.distance != null ? Math.round(s.distance) + ' km' : '') + '</span>' +
        '<span class="pill ' + s.state + '">' + STATES[s.state].label + '</span></label>';
    }).join('');
    return '<div class="sheet" role="dialog" aria-label="Choose stations">' +
      '<div class="sheet-h"><h2>Choose stations</h2><button class="btn primary" data-act="close-picker">Done</button></div>' +
      groupsPanel() +
      '<p class="muted">Select up to ' + CONFIG.maxShown + ' stations (' + state.selected.length + ' selected). ' +
      (state.here ? 'Closest stations are listed first.' : 'Turn on location to sort by distance.') + '</p>' +
      '<div class="search">' + icon('search') + '<input type="search" id="wn-pick-q" placeholder="Search a town, province or station ID" value="' +
      esc(state.pickerQuery) + '"></div>' +
      '<div class="pick-list">' + (rows || '<p class="muted">No stations match.</p>') + '</div></div>';
  }

  function groupsPanel() {
    var cur = currentGroup();
    var chips = state.groups.map(function (g) {
      return '<span class="gchip' + (cur === g ? ' on' : '') + '"><button class="gload" data-group-load="' + esc(g.name) + '" title="Show this group">' +
        esc(g.name) + ' <span class="muted">' + g.ids.length + '</span></button>' +
        '<button class="gdel" data-group-del="' + esc(g.name) + '" title="Delete this group" aria-label="Delete group ' + esc(g.name) + '">' + icon('close') + '</button></span>';
    }).join('');
    return '<section class="groups"><div class="groups-h"><b>Groups</b>' +
      (cur ? '<span class="muted">Showing “' + esc(cur.name) + '”</span>' : '') + '</div>' +
      (chips ? '<div class="gchips">' + chips + '</div>' : '<p class="muted small">No saved groups yet. Select stations, name them, and save.</p>') +
      '<div class="gsave"><input type="text" id="wn-group-name" maxlength="40" placeholder="Name this selection, e.g. Davao Region" value="' +
      esc(state.groupName || (cur ? cur.name : '')) + '"><button class="btn" data-act="save-group">' + icon('plus') + 'Save group</button></div></section>';
  }

  // ---------- render: status board ----------

  function boardView() {
    var now = Date.now(), b = state.board;
    var all = scopedStations();
    all.forEach(function (s) { assess(s, now); });
    var counts = { all: all.length, ok: 0, late: 0, stale: 0, clock: 0, offline: 0, nodata: 0,
      bad: all.filter(function (s) { return s.level === 'bad'; }).length,
      battery: all.filter(function (s) { return s.issues.some(function (i) { return i.field === 'battery'; }); }).length };
    all.forEach(function (s) { counts[s.state]++; });
    var chips = [['all', 'All', ''], ['ok', 'Reporting', 'ok'], ['late', 'Late', 'late'], ['stale', 'Stale', 'stale'],
      ['clock', 'Wrong clock', 'offline'], ['offline', 'Offline', 'offline'], ['nodata', 'No data', 'nodata'],
      ['bad', 'Bad values', 'bad'], ['battery', 'Low battery', 'warn']]
      .map(function (c) {
        return '<button class="chip ' + c[2] + (b.filter === c[0] ? ' on' : '') + '" data-filter="' + c[0] + '">' +
          '<span class="n">' + counts[c[0]] + '</span> ' + c[1] + '</button>';
      }).join('');
    var q = b.query.trim().toLowerCase();
    var rows = all.filter(function (s) {
      if (b.filter === 'bad' && s.level !== 'bad') return false;
      if (b.filter === 'battery' && !s.issues.some(function (i) { return i.field === 'battery'; })) return false;
      if (STATES[b.filter] && s.state !== b.filter) return false;
      return !q || s.name.toLowerCase().indexOf(q) !== -1 || s.siteId.indexOf(q) !== -1;
    });
    function sv(s, k) {
      if (k === 'severity') return STATES[s.state].rank * 10 + (s.level === 'bad' ? 0 : s.level === 'warn' ? 1 : 2);
      if (k === 'name') return s.label.toLowerCase();
      if (k === 'age') return s.ageMin == null ? Infinity : s.ageMin;
      return s[k] == null ? -Infinity : s[k];
    }
    rows.sort(function (x, y) {
      var a = sv(x, b.sort.key), c = sv(y, b.sort.key);
      return a < c ? -b.sort.dir : a > c ? b.sort.dir : x.label.localeCompare(y.label);
    });
    var cols = [['severity', 'Status'], ['name', 'Station'], ['temp', 'Temp °C'], ['pressure', 'Pressure hPa'], ['wind', 'Wind ' + CONFIG.windUnit],
      ['rain', 'Rain mm'], ['battery', 'Battery V'], ['age', 'Last data'], [null, 'Flags']];
    var head = '<tr>' + cols.map(function (c) {
      if (!c[0]) return '<th>' + c[1] + '</th>';
      var arrow = b.sort.key === c[0] ? (b.sort.dir > 0 ? ' ▲' : ' ▼') : '';
      var n = ['temp', 'pressure', 'wind', 'rain', 'battery'].indexOf(c[0]) !== -1;
      return '<th class="sortable' + (n ? ' num' : '') + '" data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('') + '</tr>';
    var body = rows.map(function (s) {
      var flagged = {};
      s.issues.forEach(function (i) { flagged[i.field] = i.level; });
      var cells = LIST_FIELDS.map(function (f) {
        var v = s[f.key];
        return '<td class="num' + (flagged[f.key] ? ' v-' + flagged[f.key] : '') + '">' +
          (v == null ? '<span class="muted">—</span>' : esc(v)) + '</td>';
      }).join('');
      return '<tr class="st-' + s.state + '"><td><span class="pill ' + s.state + '">' + STATES[s.state].label + '</span></td>' +
        '<td><button class="link strong" data-show="' + esc(s.id) + '">' + esc(s.label) + '</button>' +
        '<span class="sid">' + esc(s.siteId) + '</span></td>' + cells +
        '<td class="time' + (flagged.time ? ' v-bad' : '') + '">' + (s.timeText
          ? '<b>' + ageText(s.ageMin) + '</b><span class="sid">' + esc(s.timeText) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="flags">' + s.issues.map(function (i) { return '<span class="flag ' + i.level + '">' + esc(i.text) + '</span>'; }).join('') + '</td></tr>';
    }).join('');
    return '<div class="board"><div class="board-bar">' + scopeSwitch() + chips +
      '<div class="search">' + icon('search') + '<input type="search" id="wn-board-q" placeholder="Search station or ID" value="' + esc(b.query) + '"></div></div>' +
      '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' +
      (body || '<tr><td colspan="9" class="muted center">No stations match.</td></tr>') + '</tbody></table></div>' +
      '<p class="fine">Reporting: last data within ' + CONFIG.lateAfterMin + ' min · Late: within ' + CONFIG.staleAfterMin / 60 + ' h · Stale: within ' +
      CONFIG.offlineAfterMin / 1440 + ' days · Offline: older. Bad values are missing-value codes (' + CONFIG.sentinels.join(', ') +
      ') or readings outside Temp ' + CONFIG.limits.temp.join('–') + ' °C, Pressure ' + CONFIG.limits.pressure.join('–') +
      ' hPa, Wind ' + CONFIG.limits.wind.join('–') + ' ' + CONFIG.windUnit + ', Rain ' + CONFIG.limits.rain.join('–') + ' mm, Battery ' +
      CONFIG.limits.battery.join('–') + ' V. Low battery: below ' + CONFIG.lowBatteryV + ' V. Select a station to see its weather.</p></div>';
  }

  // ---------- maintenance assessment ----------
  //
  // Follows WMO practice for automatic weather station data (WMO-No. 8; WMO guidelines on
  // quality control procedures for AWS data): gross range, step (rate of change),
  // persistence (stuck sensor) and internal consistency tests, plus data completeness,
  // logger clock and power supply checks. Thresholds are set for 10-minute data.

  var QC = {
    windowHours: 24,
    slotsPerHour: 6,
    completenessCheck: 0.9,        // below this share of expected records → Check
    completenessFault: 0.6,        // below this → Fault
    gapCheckMin: 60,               // longest gap at least this long → Check
    step: { temp: 3, rh: 15, pressure: 1, solar: 800 },            // max change between 10-min values
    flat: { temp: 0.1, rh: 1, pressure: 0.1 },                     // min variation …
    flatHours: { temp: 2, rh: 6, pressure: 3 },                    // … expected within this time
    windStuckHours: 2,             // identical non-zero wind speed this long → Fault
    calmHours: 12,                 // wind exactly 0 this long → Check (stuck cups or very calm)
    vaneStuckHours: 6,             // direction within ±10° while wind ≥ 1 m/s this long → Fault
    vaneSpread: 10,
    rhHigh: 100.5,                 // RH above this → sensor over-reads
    rhSaturatedHours: 8,           // RH ≥ 99.5% this long → wet / saturated sensor
    rainStep: 50,                  // mm in 10 min — beyond any plausible rate
    totalMismatch: 0.3,            // mm difference between total increase and 10-min rain
    nightSolar: 20,                // W/m² allowed at night (8 PM–4 AM)
    dullDayMax: 150,               // highest daytime solar below this → dirty dome / fault
    battery: { check: 12.0, fault: 11.5, charged: 13.0 },
    gross: { rh: [1, 110] }        // QC gross limits where they differ from display limits (RH 100–110 = over-reading, tested separately)
  };

  var COMPONENTS = [
    { key: 'comms', name: 'Data transmission', icon: 'signal' },
    { key: 'clock', name: 'Logger clock', icon: 'clock' },
    { key: 'power', name: 'Power supply', icon: 'battery' },
    { key: 'temp', name: 'Air temperature', icon: 'thermo' },
    { key: 'rh', name: 'Relative humidity', icon: 'drop' },
    { key: 'pressure', name: 'Pressure', icon: 'gauge' },
    { key: 'wind', name: 'Wind', icon: 'wind' },
    { key: 'rain', name: 'Rain gauge', icon: 'rain' },
    { key: 'solar', name: 'Solar radiation', icon: 'sun' }
  ];
  var RESULT = {
    ok: { label: 'OK', rank: 0 }, check: { label: 'Check', rank: 1 },
    fault: { label: 'Fault', rank: 2 }, na: { label: 'Not assessed', rank: -1 }
  };
  var OVERALL = {
    good: { label: 'Good', rank: 0, say: 'All checks passed. Continue routine maintenance.' },
    attention: { label: 'Needs attention', rank: 1, say: 'Some readings look doubtful. Review at the next routine visit.' },
    maintenance: { label: 'Needs maintenance', rank: 2, say: 'A fault was found. Schedule a maintenance visit.' },
    offline: { label: 'Offline', rank: 3, say: 'No data received in the last 24 hours. A site visit is needed.' },
    pending: { label: 'Not assessed', rank: -1, say: 'Run the assessment to check this station.' }
  };

  function phtHour(ms) { var d = new Date(ms + 8 * 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60; }
  function isNight(ms) { var h = phtHour(ms); return h >= 20 || h < 4; }
  function isDay(ms) { var h = phtHour(ms); return h >= 9 && h < 15; }
  function hrs(ms) { var h = ms / 3600000; return h >= 10 ? Math.round(h) + ' h' : (Math.round(h * 10) / 10) + ' h'; }

  var MAX_STEP_MS = 20 * 60000;   // a longer gap between records breaks a run

  // Longest run of consecutive values (no data gaps) that stay within `tol` of each other.
  function longestFlat(rows, get, tol, keep) {
    var best = { ms: 0 }, start = -1, lo = 0, hi = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = get(rows[i]);
      if (i > 0 && rows[i].t - rows[i - 1].t > MAX_STEP_MS) start = -1;
      var ok = v != null && (!keep || keep(rows[i], v));
      if (ok && start >= 0 && Math.max(hi, v) - Math.min(lo, v) <= tol) {
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      } else if (ok) {
        start = i; lo = hi = v;
      } else {
        start = -1;
      }
      if (start >= 0) {
        var ms = rows[i].t - rows[start].t;
        if (ms > best.ms) best = { ms: ms, value: v, from: rows[start].t, to: rows[i].t };
      }
    }
    return best;
  }
  function angleDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function component(key) {
    var c = COMPONENTS.filter(function (x) { return x.key === key; })[0];
    return { key: key, name: c.name, icon: c.icon, result: 'ok', findings: [], actions: [] };
  }
  function flag(c, result, finding, actions) {
    if (RESULT[result].rank > RESULT[c.result].rank) c.result = result;
    c.findings.push({ result: result, text: finding });
    (actions || []).forEach(function (a) { if (c.actions.indexOf(a) === -1) c.actions.push(a); });
  }

  var ACT = {
    comms: 'Check the modem signal, SIM load / data plan and antenna; confirm the logger transmission schedule.',
    commsVisit: 'Visit the site: check power, logger and communications; download data stored on the logger.',
    clock: 'Synchronize the logger clock (GPS/NTP) to Philippine time and check the clock (RTC) battery.',
    battery: 'Measure battery voltage under load; replace the battery if it does not hold charge.',
    charging: 'Clean the solar panel, check its tilt and shading, and test the charge controller and wiring.',
    probe: 'Inspect the temperature/humidity probe and radiation shield; compare with a reference instrument and recalibrate or replace.',
    rhFilter: 'Clean or replace the humidity sensor filter; check for water in the radiation shield.',
    baro: 'Compare with a traveling standard barometer; check the sensor connection and pressure port.',
    cups: 'Check that the anemometer cups spin freely; inspect bearings and cable.',
    vane: 'Check that the wind vane turns freely and is aligned to true north; inspect bearings and cable.',
    gauge: 'Clean the rain gauge funnel and tipping bucket (debris, insects, nests); level the gauge and do a field calibration.',
    counter: 'Check the logger rain counter settings and the gauge cable for spurious pulses.',
    pyrano: 'Clean the pyranometer dome, check that it is level, and check its wiring.',
    sensorWire: 'Check the sensor cable and logger channel; the sensor is not sending readings.'
  };

  function assessStation(st, rows) {
    var now = Date.now(), from = now - QC.windowHours * 3600000;
    rows = (rows || []).filter(function (r) { return r.t >= from - 600000 && r.t <= now + QC.windowHours * 3600000; });
    var comps = {};
    COMPONENTS.forEach(function (c) { comps[c.key] = component(c.key); });

    // --- Data transmission (completeness, gaps, latency)
    var expected = QC.windowHours * QC.slotsPerHour;
    var stamps = {};
    rows.forEach(function (r) { stamps[r.t] = (stamps[r.t] || 0) + 1; });
    var unique = Object.keys(stamps).length;
    var share = Math.min(1, unique / expected);
    var c = comps.comms;
    var lastAge = st && st.time != null ? (now - st.time) / 60000 : null;
    if (!rows.length) {
      var when = !st || !st.timeText ? '' : st.state === 'clock'
        ? ' (the logger reports the year ' + st.timeText.slice(0, 4) + ', so its data may be filed under the wrong date)'
        : ' (last report ' + st.timeText + ', ' + ageText(lastAge) + ')';
      flag(c, 'fault', 'No records received in the last ' + QC.windowHours + ' hours' + when + '.',
        st && st.state === 'clock' ? [ACT.clock, ACT.commsVisit] : [ACT.commsVisit, ACT.comms]);
    } else {
      var sorted = rows.slice().sort(function (a, b) { return a.t - b.t; });
      var gap = { ms: sorted[0].t - from, at: from };
      for (var i = 1; i < sorted.length; i++) {
        var g = sorted[i].t - sorted[i - 1].t;
        if (g > gap.ms) gap = { ms: g, at: sorted[i - 1].t };
      }
      var tail = now - sorted[sorted.length - 1].t;
      if (tail > gap.ms) gap = { ms: tail, at: sorted[sorted.length - 1].t };
      c.metrics = { received: unique, expected: expected, share: share, gapMs: gap.ms };
      var pct = Math.round(share * 100) + '% of expected records (' + unique + ' of ' + expected + ')';
      if (share < QC.completenessFault) flag(c, 'fault', 'Only ' + pct + ' received.', [ACT.comms, ACT.commsVisit]);
      else if (share < QC.completenessCheck) flag(c, 'check', pct + ' received.', [ACT.comms]);
      else c.findings.push({ result: 'ok', text: pct + ' received.' });
      if (gap.ms - 600000 >= QC.gapCheckMin * 60000) {
        flag(c, 'check', 'Longest gap: ' + hrs(gap.ms - 600000) + ' after ' + clock(gap.at) + '.', [ACT.comms]);
      }
      if (lastAge != null && lastAge > CONFIG.lateAfterMin) flag(c, 'check', 'Latest report was ' + ageText(lastAge) + '.', [ACT.comms]);
    }

    // --- Logger clock
    c = comps.clock;
    if (st && st.state === 'clock') {
      flag(c, 'fault', 'Latest timestamp is in the future (' + st.timeText + ').', [ACT.clock]);
    }
    var offGrid = rows.filter(function (r) { return Math.round(r.t / 60000) % 10 !== 0; }).length;
    var dups = Object.keys(stamps).filter(function (k) { return stamps[k] > 1; }).length;
    if (offGrid) flag(c, 'check', offGrid + ' record(s) not on the 10-minute schedule.', [ACT.clock]);
    if (dups) flag(c, 'check', dups + ' duplicated timestamp(s).', [ACT.clock]);
    if (!rows.length && c.result === 'ok') c.result = 'na';
    else if (c.result === 'ok') c.findings.push({ result: 'ok', text: 'Records are on the 10-minute schedule with no duplicates.' });

    // --- Power supply
    c = comps.power;
    var volts = rows.map(function (r) { return r.raw && r.raw.battery; }).filter(function (v) { return v != null && v > 0 && v < 30; });
    var dayVolts = rows.filter(function (r) { return isDay(r.t); }).map(function (r) { return r.raw && r.raw.battery; })
      .filter(function (v) { return v != null && v > 0 && v < 30; });
    if (volts.length) {
      var vmin = Math.min.apply(null, volts), vmax = Math.max.apply(null, volts);
      c.metrics = { min: vmin, max: vmax, last: volts[volts.length - 1] };
      var range = 'Battery ' + fmt(vmin) + '–' + fmt(vmax) + ' V over ' + QC.windowHours + ' h.';
      if (vmin < QC.battery.fault) flag(c, 'fault', range + ' Dropped below ' + QC.battery.fault + ' V.', [ACT.battery, ACT.charging]);
      else if (vmin < QC.battery.check) flag(c, 'check', range + ' Dropped below ' + QC.battery.check + ' V.', [ACT.battery, ACT.charging]);
      else c.findings.push({ result: 'ok', text: range });
      if (dayVolts.length >= 6 && Math.max.apply(null, dayVolts) < QC.battery.charged) {
        flag(c, 'check', 'No charging seen: daytime voltage stayed below ' + QC.battery.charged + ' V.', [ACT.charging]);
      }
    } else if (st && st.battery != null && st.battery > 0) {
      if (st.battery < QC.battery.fault) flag(c, 'fault', 'Last reported battery ' + st.battery + ' V.', [ACT.battery, ACT.charging]);
      else c.findings.push({ result: 'ok', text: 'Last reported battery ' + st.battery + ' V.' });
    } else {
      c.result = 'na';
    }

    // --- Sensors (only when there are records to test)
    function sensor(key, rawKey, limKey, label, unitText, act) {
      var comp = comps[key];
      if (!rows.length) { comp.result = 'na'; return null; }
      var vals = rows.map(function (r) { return r.raw ? r.raw[rawKey] : null; });
      var present = vals.filter(function (v) { return v != null; });
      if (!present.length) { flag(comp, 'fault', 'No ' + label + ' readings received.', [ACT.sensorWire]); return null; }
      var lim = QC.gross[limKey] || CONFIG.limits[limKey];
      var bad = present.filter(function (v) { return CONFIG.sentinels.indexOf(v) !== -1 || v < lim[0] || v > lim[1]; });
      if (bad.length) {
        var share = bad.length / present.length;
        flag(comp, share > 0.1 ? 'fault' : 'check', bad.length + ' reading(s) outside the plausible range ' + lim[0] + '–' + lim[1] + ' ' + unitText +
          ' (e.g. ' + bad[0] + ').', [act]);
      }
      return rows.filter(function (r) { return r.raw && valid(limKey, r.raw[rawKey]); });
    }
    // rainSkip: ignore steps when rain fell (a downpour can drop temperature and raise humidity quickly).
    function stepTest(comp, good, rawKey, max, label, unitText, act, rainSkip) {
      var n = 0, worst = 0;
      for (var i = 1; i < good.length; i++) {
        if (good[i].t - good[i - 1].t > 600000) continue;
        if (rainSkip && ((good[i].raw.rain || 0) > 0 || (good[i - 1].raw.rain || 0) > 0)) continue;
        var d = Math.abs(good[i].raw[rawKey] - good[i - 1].raw[rawKey]);
        if (d > max) { n++; worst = Math.max(worst, d); }
      }
      if (n) flag(comp, 'check', n + ' sudden jump(s) in ' + label + ' (up to ' + fmt(worst) + ' ' + unitText + ' in 10 min; limit ' + max + ').', [act]);
    }
    function flatTest(comp, good, rawKey, tol, hours, label, act) {
      var run = longestFlat(good, function (r) { return r.raw[rawKey]; }, tol);
      if (run.ms >= hours * 3600000) {
        var long = run.ms >= 3 * hours * 3600000;
        flag(comp, long ? 'fault' : 'check', label + ' barely changed (within ' + tol + ') for ' + hrs(run.ms) + ' around ' + run.value +
          ' (' + clock(run.from) + '–' + clock(run.to) + ')' + (long ? ' — sensor appears stuck.' : ' — may be stuck.'), [act]);
      }
    }

    var good = sensor('temp', 'temp', 'temp', 'temperature', '°C', ACT.probe);
    if (good) {
      stepTest(comps.temp, good, 'temp', QC.step.temp, 'temperature', '°C', ACT.probe, true);
      flatTest(comps.temp, good, 'temp', QC.flat.temp, QC.flatHours.temp, 'Temperature', ACT.probe);
      var inverted = good.filter(function (r) { return r.raw.tmin != null && r.raw.tmax != null && r.raw.tmin > r.raw.tmax + 0.05; }).length;
      if (inverted) flag(comps.temp, 'check', inverted + ' record(s) with minimum above maximum.', [ACT.probe]);
      if (comps.temp.result === 'ok') comps.temp.findings.push({ result: 'ok', text: 'Range, step and persistence tests passed.' });
    }

    good = sensor('rh', 'rh', 'rh', 'humidity', '%', ACT.probe);
    if (good) {
      var over = rows.filter(function (r) { return r.raw && r.raw.rh != null && r.raw.rh > QC.rhHigh && r.raw.rh <= 110; }).length;
      if (over) flag(comps.rh, 'check', over + ' reading(s) above 100%.', [ACT.probe]);
      var wet = longestFlat(good, function (r) { return r.raw.rh >= 99.5 ? 100 : null; }, 0);
      if (wet.ms >= QC.rhSaturatedHours * 3600000) flag(comps.rh, 'check', 'At 100% for ' + hrs(wet.ms) + ' — sensor may be wet or saturated.', [ACT.rhFilter]);
      stepTest(comps.rh, good, 'rh', QC.step.rh, 'humidity', '%', ACT.probe, true);
      flatTest(comps.rh, good.filter(function (r) { return r.raw.rh < 95; }), 'rh', QC.flat.rh, QC.flatHours.rh, 'Humidity', ACT.probe);
      var dewBad = good.filter(function (r) { var dp = dewPoint(r.raw.temp, r.raw.rh); return dp != null && r.raw.temp != null && dp > r.raw.temp + 0.1; }).length;
      if (dewBad) flag(comps.rh, 'check', dewBad + ' record(s) with dew point above air temperature.', [ACT.probe]);
      if (comps.rh.result === 'ok') comps.rh.findings.push({ result: 'ok', text: 'Range, step and persistence tests passed.' });
    }

    good = sensor('pressure', 'pressure', 'pressure', 'pressure', 'hPa', ACT.baro);
    if (good) {
      stepTest(comps.pressure, good, 'pressure', QC.step.pressure, 'pressure', 'hPa', ACT.baro);
      flatTest(comps.pressure, good, 'pressure', QC.flat.pressure, QC.flatHours.pressure, 'Pressure', ACT.baro);
      if (comps.pressure.result === 'ok') comps.pressure.findings.push({ result: 'ok', text: 'Range, step and persistence tests passed.' });
    }

    good = sensor('wind', 'wind', 'wind', 'wind speed', CONFIG.windUnit, ACT.cups);
    if (good) {
      var stuck = longestFlat(good, function (r) { return r.raw.wind; }, 0, function (r, v) { return v > 0; });
      if (stuck.ms >= QC.windStuckHours * 3600000) {
        flag(comps.wind, 'fault', 'Wind speed fixed at ' + stuck.value + ' ' + CONFIG.windUnit + ' for ' + hrs(stuck.ms) + '.', [ACT.cups]);
      }
      var calm = longestFlat(good, function (r) { return r.raw.wind; }, 0, function (r, v) { return v === 0; });
      if (calm.ms >= QC.calmHours * 3600000) {
        flag(comps.wind, 'check', 'Wind speed 0 for ' + hrs(calm.ms) + ' — cups may be stuck (or it was very calm).', [ACT.cups]);
      }
      var vane = { ms: 0 }, start = -1;
      for (var k = 0; k < good.length; k++) {
        var r = good[k], d = r.raw.dir, moving = r.raw.wind != null && r.raw.wind >= (CONFIG.windUnit === 'm/s' ? 1 : 3.6);
        if (k > 0 && r.t - good[k - 1].t > MAX_STEP_MS) start = -1;
        if (d != null && moving && start >= 0 && angleDiff(d, good[start].raw.dir) <= QC.vaneSpread) {
          var ms = r.t - good[start].t;
          if (ms > vane.ms) vane = { ms: ms, dir: good[start].raw.dir };
        } else {
          start = d != null && moving ? k : -1;
        }
      }
      if (vane.ms >= QC.vaneStuckHours * 3600000) {
        flag(comps.wind, 'fault', 'Wind direction fixed near ' + Math.round(vane.dir) + '° for ' + hrs(vane.ms) + ' while the wind was blowing.', [ACT.vane]);
      }
      var badDir = rows.filter(function (r) { return r.raw && r.raw.dir != null && (r.raw.dir < 0 || r.raw.dir > 360); }).length;
      if (badDir) flag(comps.wind, 'check', badDir + ' wind direction value(s) outside 0–360°.', [ACT.vane]);
      if (comps.wind.result === 'ok') comps.wind.findings.push({ result: 'ok', text: 'Speed and direction tests passed.' });
    }

    good = sensor('rain', 'rain', 'rain', 'rainfall', 'mm', ACT.gauge);
    if (good) {
      var big = good.filter(function (r) { return r.raw.rain > QC.rainStep; }).length;
      if (big) flag(comps.rain, 'check', big + ' ten-minute total(s) above ' + QC.rainStep + ' mm.', [ACT.counter]);
      var mism = 0;
      for (var j = 1; j < good.length; j++) {
        var a = good[j - 1].raw.total, b = good[j].raw.total;
        if (a == null || b == null || b < a || good[j].t - good[j - 1].t > 600000) continue;   // reset or gap
        if (Math.abs((b - a) - good[j].raw.rain) > QC.totalMismatch) mism++;
      }
      if (mism) flag(comps.rain, 'check', mism + ' record(s) where the running total does not match the 10-minute rainfall.', [ACT.counter]);
      var clearRain = good.filter(function (r) { return r.raw.rain > 0 && r.raw.solar != null && r.raw.solar > 600 && r.raw.rh != null && r.raw.rh < 60; }).length;
      if (clearRain >= 2) flag(comps.rain, 'check', clearRain + ' rain record(s) under strong sun and dry air — possible false tips.', [ACT.gauge, ACT.counter]);
      if (comps.rain.result === 'ok') {
        var tot = good.reduce(function (sum, r) { return sum + r.raw.rain; }, 0);
        comps.rain.findings.push({ result: 'ok', text: 'Tests passed. ' + fmt(tot) + ' mm recorded in ' + QC.windowHours + ' h.' });
      }
    }

    good = sensor('solar', 'solar', 'solar', 'solar radiation', 'W/m²', ACT.pyrano);
    if (good) {
      var night = good.filter(function (r) { return isNight(r.t) && r.raw.solar > QC.nightSolar; });
      if (night.length) {
        flag(comps.solar, 'check', night.length + ' night-time reading(s) above ' + QC.nightSolar + ' W/m² (up to ' +
          Math.round(Math.max.apply(null, night.map(function (r) { return r.raw.solar; }))) + ') — sensor offset or wrong logger clock.', [ACT.pyrano, ACT.clock]);
      }
      var day = good.filter(function (r) { return isDay(r.t); });
      if (day.length >= 12) {
        var dmax = Math.max.apply(null, day.map(function (r) { return r.raw.solar; }));
        if (dmax < QC.dullDayMax) flag(comps.solar, 'check', 'Midday maximum only ' + Math.round(dmax) + ' W/m² — dirty dome or sensor fault (or a very overcast day).', [ACT.pyrano]);
      }
      stepTest(comps.solar, good, 'solar', QC.step.solar, 'solar radiation', 'W/m²', ACT.pyrano);
      if (comps.solar.result === 'ok') comps.solar.findings.push({ result: 'ok', text: 'Day/night and range tests passed.' });
    }

    var list = COMPONENTS.map(function (x) { return comps[x.key]; });
    var worst = Math.max.apply(null, list.map(function (x) { return RESULT[x.result].rank; }));
    var overall = !rows.length ? 'offline' : worst >= 2 ? 'maintenance' : worst === 1 ? 'attention' : 'good';
    var top = null;
    list.forEach(function (x) {
      x.findings.forEach(function (f) {
        if (f.result !== 'ok' && (!top || RESULT[f.result].rank > RESULT[top.result].rank)) top = { result: f.result, text: x.name + ': ' + f.text };
      });
    });
    return { overall: overall, components: list, top: top, rows: rows, expected: expected, from: from, to: now };
  }

  // Station's assessment, or null when its data has not been loaded yet.
  function maintFor(st) {
    var d = state.details[st.id];
    assess(st, Date.now());
    var noData = st.state === 'offline' || st.state === 'nodata' || st.state === 'clock';
    if (d && d.rows) return assessStation(st, d.rows);
    if (noData) return assessStation(st, []);
    return null;
  }

  function scanAll() {
    if (state.scan && state.scan.running) return;
    var now = Date.now();
    var queue = scopedStations().filter(function (s) {
      assess(s, now);
      return s.state === 'ok' || s.state === 'late' || s.state === 'stale';
    }).map(function (s) { return s.id; });
    var scan = state.scan = { running: true, total: queue.length, done: 0, started: now };
    function next() {
      if (!scan.running || !queue.length) return Promise.resolve();
      var id = queue.shift();
      var d = state.details[id] = state.details[id] || {};
      d.loading = true;
      return fetchHistory(id).then(function (rows) { d.rows = rows; d.error = null; d.at = Date.now(); })
        .catch(function (err) {
          if (err instanceof SignedOut) { state.listError = 'signedout'; scan.running = false; }
          d.error = (err && err.message) || 'Could not load this station.';
        })
        .then(function () { d.loading = false; scan.done++; renderSoon(); return next(); });
    }
    render();
    // Two requests at a time keeps the scan to a couple of minutes without loading the server.
    Promise.all([next(), next()]).then(function () {
      scan.running = false;
      scan.finished = Date.now();
      render();
    });
  }

  var renderTimer = null;
  function renderSoon() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () { renderTimer = null; render(); }, 400);
  }

  function resultPill(result) { return '<span class="res ' + result + '">' + RESULT[result].label + '</span>'; }
  function overallPill(o) { return '<span class="ovr ' + o + '">' + OVERALL[o].label + '</span>'; }

  function maintView() {
    if (state.maint.open) return maintReport(state.maint.open);
    var m = state.maint;
    var rows = scopedStations().map(function (st) { return { st: st, a: maintFor(st) }; });
    var counts = { all: rows.length, good: 0, attention: 0, maintenance: 0, offline: 0, pending: 0 };
    rows.forEach(function (r) { counts[r.a ? r.a.overall : 'pending']++; });

    var scan = state.scan;
    var bar;
    if (scan && scan.running) {
      var pct = scan.total ? Math.round(scan.done / scan.total * 100) : 0;
      bar = '<div class="scan"><div class="scan-t"><b>Assessing stations… ' + scan.done + ' of ' + scan.total + '</b>' +
        '<button class="btn" data-act="maint-stop">Stop</button></div><div class="prog"><span style="width:' + pct + '%"></span></div></div>';
    } else {
      bar = '<div class="scan"><div class="scan-t"><span>' + (scan && scan.finished
        ? 'Last assessment finished ' + clock(scan.finished) + ' · ' + QC.windowHours + '-hour window'
        : state.scope === 'selected'
          ? 'Assess the selected stations from their last ' + QC.windowHours + ' hours of uploaded data.'
          : 'Assess every reporting station from its last ' + QC.windowHours + ' hours of uploaded data (about 2 minutes).') + '</span>' +
        '<button class="btn primary" data-act="maint-scan">' + icon('refresh') +
        (state.scope === 'selected' ? 'Assess selected' : scan ? 'Re-assess all' : 'Assess all stations') + '</button></div></div>';
    }

    var chips = [['all', 'All', ''], ['maintenance', 'Needs maintenance', 'maintenance'], ['attention', 'Needs attention', 'attention'],
      ['offline', 'Offline', 'offline'], ['good', 'Good', 'good'], ['pending', 'Not assessed', 'pending']].map(function (c) {
      return '<button class="chip m-' + c[2] + (m.filter === c[0] ? ' on' : '') + '" data-mfilter="' + c[0] + '"><span class="n">' + counts[c[0]] + '</span> ' + c[1] + '</button>';
    }).join('');

    var q = m.query.trim().toLowerCase();
    var shown = rows.filter(function (r) {
      var o = r.a ? r.a.overall : 'pending';
      if (m.filter !== 'all' && o !== m.filter) return false;
      return !q || r.st.name.toLowerCase().indexOf(q) !== -1 || r.st.siteId.indexOf(q) !== -1;
    });
    shown.sort(function (x, y) {
      var a = OVERALL[x.a ? x.a.overall : 'pending'].rank, b = OVERALL[y.a ? y.a.overall : 'pending'].rank;
      return b - a || x.st.label.localeCompare(y.st.label);
    });

    var head = '<tr><th>Station</th><th>Status</th>' + COMPONENTS.map(function (c) {
      return '<th class="cc" title="' + c.name + '">' + icon(c.icon) + '</th>';
    }).join('') + '<th>Main finding</th></tr>';
    var body = shown.map(function (r) {
      var a = r.a, o = a ? a.overall : 'pending';
      var cells = COMPONENTS.map(function (c, i) {
        var res = a ? a.components[i].result : 'na';
        return '<td class="cc"><i class="dotc ' + res + '" title="' + c.name + ': ' + RESULT[res].label + '"></i></td>';
      }).join('');
      var d = state.details[r.st.id];
      var finding = a ? (a.top ? esc(a.top.text) : '<span class="muted">No problems found</span>')
        : d && d.loading ? '<span class="muted">Loading…</span>' : '<span class="muted">Not assessed yet</span>';
      return '<tr class="mrow" data-maint-open="' + esc(r.st.id) + '"><td><b>' + esc(r.st.label) + '</b><span class="sid">' + esc(r.st.siteId) + '</span></td>' +
        '<td>' + overallPill(o) + '</td>' + cells + '<td class="mf">' + finding + '</td></tr>';
    }).join('');

    return '<div class="maint">' + bar +
      '<div class="board-bar">' + scopeSwitch() + chips + '<div class="search">' + icon('search') +
      '<input type="search" id="wn-maint-q" placeholder="Search station or ID" value="' + esc(m.query) + '"></div></div>' +
      '<div class="table-wrap"><table class="mtable"><thead>' + head + '</thead><tbody>' +
      (body || '<tr><td colspan="12" class="muted center">No stations match.</td></tr>') + '</tbody></table></div>' +
      '<p class="fine">Checks follow WMO practice for automatic weather station data (WMO-No. 8 and the WMO guidelines on quality control of AWS data): ' +
      'range, step, persistence and internal-consistency tests on each sensor, plus data completeness, logger clock and power supply. ' +
      'Thresholds are set for 10-minute data. Select a station for its full report and recommended actions.</p></div>';
  }

  function completenessStrip(a) {
    var n = a.expected, have = {};
    a.rows.forEach(function (r) { have[Math.floor((r.t - a.from) / 600000)] = true; });
    var cells = '';
    for (var i = 0; i < n; i++) {
      cells += '<rect x="' + (i * 4) + '" y="0" width="3.2" height="14" rx="1" fill="' + (have[i] ? C.green : C.red) + '" opacity="' + (have[i] ? 1 : 0.55) + '"/>';
    }
    return '<svg class="strip" viewBox="0 0 ' + (n * 4) + ' 14" preserveAspectRatio="none" aria-label="Records received in each 10-minute slot">' + cells + '</svg>' +
      '<div class="lv-ends"><span>' + clock(a.from) + '</span><span>Each bar is one 10-minute record · red = missing</span><span>now</span></div>';
  }

  function rawSpark(rows, key, color, lines) {
    var pts = rows.filter(function (r) { return r.raw && valid(key === 'battery' ? 'battery' : key, r.raw[key]); })
      .map(function (r) { return { t: r.t, v: r.raw[key] }; });
    if (pts.length < 2) return '';
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    var vals = pts.map(function (p) { return p.v; }).concat(lines || []);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 0.5) { lo -= 0.25; hi += 0.25; }
    function y(v) { return round(46 - 42 * (v - lo) / (hi - lo), 1); }
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + round(2 + 296 * (p.t - t0) / Math.max(1, t1 - t0), 1) + ' ' + y(p.v); }).join(' ');
    var guides = (lines || []).map(function (v) {
      return '<line x1="0" x2="300" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + C.red + '" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }).join('');
    return '<svg class="mspark" viewBox="0 0 300 50" preserveAspectRatio="none" aria-hidden="true">' + guides + '<path d="' + d +
      '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' +
      '<div class="lv-ends"><span>' + fmt(Math.min.apply(null, pts.map(function (p) { return p.v; }))) + ' min</span><span>' +
      fmt(Math.max.apply(null, pts.map(function (p) { return p.v; }))) + ' max</span></div>';
  }

  var COMP_SPARK = { power: ['battery', C.green], temp: ['temp', C.orange], rh: ['rh', C.teal], pressure: ['pressure', C.indigo],
    wind: ['wind', C.teal], rain: ['rain', C.blue], solar: ['solar', C.yellow] };

  function maintReport(id) {
    var st = stationById(id);
    if (!st) { state.maint.open = null; return maintView(); }
    var d = state.details[id];
    var a = maintFor(st);
    var back = '<button class="btn" data-act="maint-back">' + icon('back') + 'All stations</button>';
    if (!a && d && d.error && !d.loading) {
      return '<div class="report">' + back + '<div class="card"><h2>' + esc(st.label) + '</h2><p class="msg">' + esc(d.error) + '</p></div></div>';
    }
    if (!a) {
      if (!d || (!d.loading && !d.rows)) loadOne(id);
      return '<div class="report">' + back + '<div class="card"><h2>' + esc(st.label) + '</h2><p class="msg muted">Loading the last ' +
        QC.windowHours + ' hours of data…</p></div></div>';
    }
    var o = OVERALL[a.overall];
    var comps = a.components.map(function (c) {
      var spark = COMP_SPARK[c.key] && a.rows.length
        ? rawSpark(a.rows, COMP_SPARK[c.key][0], COMP_SPARK[c.key][1], c.key === 'power' ? [QC.battery.check] : null) : '';
      return '<section class="mcomp ' + c.result + '"><header>' + '<span class="tile-ic" style="--c:' +
        (c.result === 'fault' ? C.red : c.result === 'check' ? C.yellow : c.result === 'ok' ? C.green : C.grey) + '">' + icon(c.icon) + '</span>' +
        '<h3>' + c.name + '</h3>' + resultPill(c.result) + '</header>' +
        (c.findings.length ? '<ul class="finds">' + c.findings.map(function (f) { return '<li class="' + f.result + '">' + esc(f.text) + '</li>'; }).join('') + '</ul>'
          : c.result === 'na' ? '<p class="muted small">No data to test.</p>' : '') +
        (c.key === 'comms' && a.rows.length ? completenessStrip(a) : spark) +
        (c.actions.length ? '<div class="acts"><b>Recommended action</b><ul>' + c.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
        '</section>';
    }).join('');
    var counts = { fault: 0, check: 0 };
    a.components.forEach(function (c) { if (counts[c.result] != null) counts[c.result]++; });
    return '<div class="report">' +
      '<div class="report-bar">' + back + '<button class="btn" data-act="maint-print">' + icon('print') + 'Print report</button></div>' +
      '<article class="card">' +
      '<header class="rep-h"><div><div class="tagline">Station maintenance report</div><h2>' + esc(st.label) + '</h2>' +
      '<div class="sub">Station ' + esc(st.siteId) + (st.lat != null ? ' · approx. ' + st.lat.toFixed(3) + '°N, ' + st.lon.toFixed(3) + '°E' : '') + '</div></div>' +
      '<div class="rep-o">' + overallPill(a.overall) + '<div class="sub">Assessed ' + clock(a.to) + ' · data from ' + clock(a.from) + ' (' + QC.windowHours + ' h)</div></div></header>' +
      '<div class="advice ' + (a.overall === 'good' ? 'good' : a.overall === 'attention' ? 'warn' : 'danger') + '">' +
      icon(a.overall === 'good' ? 'check' : 'alert') + '<p>' + o.say +
      (counts.fault || counts.check ? ' (' + [counts.fault ? counts.fault + ' fault' + (counts.fault > 1 ? 's' : '') : '', counts.check ? counts.check + ' to check' : ''].filter(Boolean).join(', ') + ')' : '') +
      '</p></div>' +
      '<div class="mcomps">' + comps + '</div>' +
      '<section class="tile wide routine"><header class="tile-h"><span class="tile-ic" style="--c:' + C.blue + '">' + icon('check') + '</span>Routine site visit checklist</header>' +
      '<ul class="checklist">' + [
        'Check the site: fence, vegetation cut low, no new obstructions near the sensors.',
        'Clean the radiation shield, rain gauge funnel and bucket, pyranometer dome and solar panel.',
        'Check that the anemometer and wind vane turn freely and the vane points to true north.',
        'Check cables, connectors, grounding and the enclosure seal; look for water, insects or corrosion.',
        'Check the battery voltage, charge controller and logger clock; download stored data.',
        'Compare readings with reference instruments; record any sensor change or calibration in the station log.'
      ].map(function (x) { return '<li><span class="box"></span>' + x + '</li>'; }).join('') + '</ul></section>' +
      '<p class="fine">Assessment uses the station’s uploaded 10-minute data and WMO-style quality-control tests. ' +
      'Findings marked Check can also be caused by unusual weather; confirm on site before replacing equipment.</p>' +
      '</article></div>';
  }

  function loadOne(id) {
    var d = state.details[id] = state.details[id] || {};
    if (d.loading) return;
    d.loading = true;
    fetchHistory(id).then(function (rows) { d.rows = rows; d.error = null; d.at = Date.now(); })
      .catch(function (err) { d.error = (err && err.message) || 'Could not load this station.'; })
      .then(function () { d.loading = false; render(); });
  }

  // ---------- render: page ----------

  function render() {
    var main = document.getElementById('wn-main');
    if (!main) return;
    // Keep the focused search box (and caret) when re-rendering.
    var active = document.activeElement && document.activeElement.id;
    var caret = active && document.activeElement.selectionStart;

    document.getElementById('wn-tab-weather').classList.toggle('on', state.view === 'weather');
    document.getElementById('wn-tab-board').classList.toggle('on', state.view === 'board');
    document.getElementById('wn-tab-maint').classList.toggle('on', state.view === 'maint');
    document.getElementById('wn-pick-n').textContent = state.selected.length ? ' (' + state.selected.length + ')' : '';
    var gsel = document.getElementById('wn-group'), cur = currentGroup();
    gsel.hidden = !state.groups.length;
    gsel.innerHTML = (cur ? '' : '<option value="">' + (state.selected.length ? 'Unsaved selection' : 'Choose a group') + '</option>') +
      state.groups.map(function (g) { return '<option value="' + esc(g.name) + '"' + (g === cur ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');

    var status = [];
    if (state.refreshing) status.push('Updating…');
    else if (state.listAt) status.push('Updated ' + clock(state.listAt));
    if (state.nextRefresh && !state.refreshing) {
      var left = Math.max(0, Math.round((state.nextRefresh - Date.now()) / 60000));
      status.push('next in ' + (left < 1 ? '<1' : left) + ' min');
    }
    document.getElementById('wn-status').textContent = status.join(' · ');

    var err = '';
    if (state.listError === 'signedout') {
      err = '<div class="note bad">' + icon('alert') + '<span>You have been signed out. <a href="/admin/aws">Sign in again</a>, then open AutoWx again.</span></div>';
    } else if (state.listError) {
      err = '<div class="note bad">' + icon('alert') + '<span>' + esc(state.listError) + '</span></div>';
    }
    var fitting = state.view === 'weather' && state.fit && shownIds().length > 0;
    main.classList.toggle('fit-mode', fitting);
    var fitBtn = document.getElementById('wn-fit');
    fitBtn.innerHTML = state.fit ? icon('list') + 'Details' : icon('grid') + 'Fit screen';
    fitBtn.title = state.fit ? 'Show full details for each station' : 'Show all selected stations on one screen';
    document.documentElement.style.setProperty('--top-h', document.querySelector('.top').offsetHeight + 'px');
    main.innerHTML = err + (state.view === 'board' ? boardView() : state.view === 'maint' ? maintView() : fitting ? fitView() : weatherView());

    var sheet = document.getElementById('wn-picker');
    sheet.hidden = !state.picker;
    if (state.picker) {
      var oldList = sheet.querySelector('.pick-list');
      var scroll = oldList ? oldList.scrollTop : 0;
      sheet.innerHTML = pickerView();
      var newList = sheet.querySelector('.pick-list');
      if (newList) newList.scrollTop = scroll;
    }

    if (active) {
      var el = document.getElementById(active);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text box */ } }
    }
  }

  // ---------- page shell ----------

  var FONT = ['Regular', 400, 'SemiBold', 600, 'Bold', 700, 'ExtraBold', 800];
  var fontFaces = '';
  for (var fi = 0; fi < FONT.length; fi += 2) {
    fontFaces += '@font-face{font-family:WNunito;font-weight:' + FONT[fi + 1] + ';font-display:swap;' +
      'src:url(/fonts/Nunito/Nunito-' + FONT[fi] + '.woff2) format("woff2")}';
  }

  var CSS = fontFaces + [
    ':root{--bg:#f3f5f9;--card:#fff;--panel:#f7f9fc;--text:#16213a;--muted:#5e6b80;--line:#e3e8f0;--glass:#eef2f7;--glass-line:#cfd8e4;',
    '--brand:#2f6bff;--shadow:0 1px 2px rgba(16,33,70,.06),0 6px 18px rgba(16,33,70,.06);',
    '--good:#1d8a5a;--good-bg:#e4f5ec;--info:#2457c5;--info-bg:#e8efff;--warn:#9a5b00;--warn-bg:#fff2d9;--danger:#b4232a;--danger-bg:#fde5e5;',
    '--ok:#1d8a5a;--ok-bg:#e4f5ec;--late:#9a5b00;--late-bg:#fff2d9;--stale:#b54708;--stale-bg:#ffe8d6;--off:#b4232a;--off-bg:#fde5e5;',
    '--none:#5d6573;--none-bg:#eceff3;--bad:#b4232a;--bad-bg:#fde5e5}',
    '@media (prefers-color-scheme:dark){:root{--bg:#0e1420;--card:#161e2e;--panel:#1b2436;--text:#e8edf7;--muted:#9aa7bd;--line:#273248;',
    '--glass:#232e44;--glass-line:#38465f;--brand:#6f9bff;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 20px rgba(0,0,0,.25);',
    '--good:#5ccf95;--good-bg:#14301f;--info:#8fb0ff;--info-bg:#1a2647;--warn:#f2c14e;--warn-bg:#352a10;--danger:#ff8a8a;--danger-bg:#3d1a1d;',
    '--ok:#5ccf95;--ok-bg:#14301f;--late:#f2c14e;--late-bg:#352a10;--stale:#f79a5b;--stale-bg:#3b2416;--off:#ff8a8a;--off-bg:#3d1a1d;',
    '--none:#a7afbd;--none-bg:#262e3c;--bad:#ff8a8a;--bad-bg:#3d1a1d}}',
    '*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);',
    'font:15px/1.5 WNunito,ui-rounded,"SF Pro Rounded",-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}',
    'button,input{font:inherit;color:inherit}b{font-weight:800}',
    '.ic{width:18px;height:18px;flex:none}',
    // Top bar
    '.top{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:10px 24px;',
    'background:color-mix(in srgb,var(--card) 92%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}',
    '.brand{display:flex;align-items:center;gap:10px}',
    '.brand svg{width:36px;height:36px;flex:none}',
    '.wm{font-weight:800;font-size:20px;letter-spacing:-.4px;line-height:1.05}.wm span{color:var(--brand)}',
    '.tagline{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted)}',
    '.tabs{display:flex;gap:2px;background:var(--glass);padding:3px;border-radius:10px}',
    '.tabs button{border:0;background:none;padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer;color:var(--muted)}',
    '.tabs button.on{background:var(--card);color:var(--text);box-shadow:var(--shadow)}',
    '.top-r{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '#wn-status{color:var(--muted);font-size:13px;margin-right:4px}',
    '.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);padding:7px 13px;',
    'border-radius:10px;font-weight:700;cursor:pointer;text-decoration:none;color:var(--text);line-height:1.2}',
    '.btn:hover{border-color:var(--brand)}.btn.primary{background:#2f6bff;border-color:#2f6bff;color:#fff}',
    '.icon-btn{border:1px solid var(--line);background:var(--card);width:34px;height:34px;border-radius:10px;display:grid;place-items:center;',
    'cursor:pointer;color:var(--muted);flex:none}.icon-btn:hover{color:var(--text);border-color:var(--brand)}',
    '.link{border:0;background:none;padding:0;color:var(--brand);font-weight:700;cursor:pointer;text-decoration:underline}',
    '.link.strong{color:var(--text);text-decoration:none;text-align:left}.link.strong:hover{color:var(--brand);text-decoration:underline}',
    'main{max-width:1440px;margin:0 auto;padding:20px 24px 40px}',
    '.note{display:flex;gap:10px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:12px;',
    'padding:10px 14px;margin-bottom:14px}.note .ic{margin-top:2px;color:var(--brand)}',
    '.note.bad{background:var(--danger-bg);color:var(--danger);border-color:transparent}.note.bad .ic{color:inherit}.note a{color:inherit;font-weight:800}',
    '.muted{color:var(--muted)}.center{text-align:center}',
    '.fine{font-size:12px;color:var(--muted);margin:12px 2px 0}',
    '.empty{text-align:center;padding:56px 20px}.empty .scene{width:96px;height:96px}.empty p{font-size:18px;font-weight:700}',
    // Station cards
    '.cards{display:grid;gap:20px}.cards.multi{grid-template-columns:repeat(auto-fill,minmax(min(100%,640px),1fr))}',
    '.card{background:var(--card);border-radius:20px;padding:20px;box-shadow:var(--shadow);border:1px solid var(--line)}',
    '.card-h{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}',
    '.card-h h2{margin:0;font-size:24px;font-weight:800;letter-spacing:-.3px;line-height:1.2}.sub{color:var(--muted);font-size:13px}',
    '.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
    '.tag{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:999px;',
    'background:var(--glass);color:var(--muted)}.tag .ic{width:14px;height:14px}',
    '.tag.near{background:var(--brand);color:#fff}.tag.live{background:var(--ok-bg);color:var(--ok)}.tag.late{background:var(--late-bg);color:var(--late)}',
    '.dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}',
    '.tag.live .dot{box-shadow:0 0 0 3px color-mix(in srgb,currentColor 25%,transparent)}',
    // Hero
    '.hero{display:grid;grid-template-columns:auto 1fr minmax(240px,1.1fr);align-items:center;gap:18px;margin:16px 0;',
    'padding:16px;border-radius:16px;background:var(--panel);border:1px solid var(--line)}',
    '.scene{width:88px;height:88px;display:block}',
    '.hero-t{font-size:56px;font-weight:800;line-height:1;letter-spacing:-2px}',
    '.hero-w{font-size:19px;font-weight:800;margin-top:4px}.hero-f{color:var(--muted);font-weight:700}',
    '.advice{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;font-weight:700}',
    '.advice p{margin:0}.advice .ic{width:22px;height:22px;margin-top:1px}',
    '.advice.good{background:var(--good-bg);color:var(--good)}.advice.info{background:var(--info-bg);color:var(--info)}',
    '.advice.warn{background:var(--warn-bg);color:var(--warn)}.advice.danger{background:var(--danger-bg);color:var(--danger)}',
    // Tiles
    '.tiles{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}',
    '.tile{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column}',
    '.tile.wide{margin-top:12px}',
    '.tile-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)}',
    '.tile-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--c);',
    'background:color-mix(in srgb,var(--c) 14%,transparent)}.tile-ic .ic{width:17px;height:17px}',
    '.tile-b{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}',
    '.val{font-size:34px;font-weight:800;line-height:1.1;letter-spacing:-.8px}.val small{font-size:15px;font-weight:700;color:var(--muted);margin-left:3px;letter-spacing:0}',
    '.tile-main{display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
    '.tile-pic{flex:none}.pic{height:64px;width:auto;display:block}',
    '.lvl{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:13px;padding:3px 10px;border-radius:999px;',
    'color:var(--text);background:color-mix(in srgb,var(--c) 16%,transparent)}',
    '.lvl i{width:8px;height:8px;border-radius:50%;background:var(--c)}',
    '.lvl.outline{background:none;box-shadow:inset 0 0 0 1.5px var(--c);margin-left:4px}',
    '.tile-main .lvl + .lvl{margin-left:0}',
    '.lv{margin-top:12px}.lv-track{position:relative;display:flex;gap:3px;height:8px}',
    '.lv-seg{flex:1;border-radius:4px;opacity:.3}.lv-seg.on{opacity:1}',
    '.lv-thumb{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--card);border:3px solid;',
    'transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.lv-ends{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--muted);margin-top:5px}',
    '.say{margin:10px 0 0;font-size:13.5px;font-weight:600}',
    '.foot{margin-top:auto;padding-top:10px;font-size:12.5px;color:var(--muted)}.foot b{color:var(--text)}',
    '.glass{fill:var(--glass);stroke:var(--glass-line);stroke-width:2}.ring{stroke:var(--glass-line);stroke-dasharray:3 5}',
    '.tick{stroke:var(--glass-line);stroke-width:2}.cmp-t{font-size:13px;font-weight:800;fill:var(--muted)}',
    '.spark{width:100%;height:26px;display:block;margin-top:6px}',
    '.day{width:100%;height:auto;display:block;margin-top:8px}.grid{stroke:var(--line)}.axis{stroke:var(--glass-line);stroke-width:1.5}',
    '.ax{font-size:11px;fill:var(--muted);font-weight:700}',
    '.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12.5px;color:var(--muted);font-weight:700;margin-top:4px}',
    '.legend i{display:inline-block;width:16px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}',
    '.legend i.dash{height:0;border-top:2.5px dashed;border-radius:0}',
    '.msg{font-size:16px;font-weight:700;margin:14px 0 0}',
    // Picker
    '#wn-picker{position:fixed;inset:0;z-index:10;background:rgba(10,18,35,.45);display:flex;justify-content:center;align-items:flex-start;padding:6vh 16px}',
    '#wn-picker[hidden]{display:none}',
    '.sheet{background:var(--card);border-radius:20px;padding:20px;width:min(640px,100%);max-height:86vh;display:flex;flex-direction:column;box-shadow:var(--shadow)}',
    '.sheet-h{display:flex;justify-content:space-between;align-items:center}.sheet-h h2{margin:0;font-size:20px}',
    '.search{position:relative;display:flex;align-items:center}.search .ic{position:absolute;left:12px;color:var(--muted)}',
    '.search input{width:100%;padding:9px 12px 9px 38px;border-radius:10px;border:1px solid var(--line);background:var(--panel)}',
    '.search input:focus{outline:2px solid var(--brand);outline-offset:-1px}',
    '.pick-list{overflow:auto;margin-top:10px;border-top:1px solid var(--line)}',
    '.pick-row{display:flex;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line);cursor:pointer}',
    '.pick-row.on{background:var(--panel)}.pick-row input{width:17px;height:17px;accent-color:var(--brand)}',
    '.pick-name{flex:1;font-weight:700}.pick-name em{display:block;font-style:normal;color:var(--brand);font-size:12px}',
    '.pick-km{color:var(--muted);font-size:13px;width:64px;text-align:right}',
    '.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}',
    '.pill.ok{color:var(--ok);background:var(--ok-bg)}.pill.late{color:var(--late);background:var(--late-bg)}',
    '.pill.stale{color:var(--stale);background:var(--stale-bg)}.pill.offline,.pill.clock{color:var(--off);background:var(--off-bg)}',
    '.pill.nodata{color:var(--none);background:var(--none-bg)}',
    // Status board
    '.board-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}.board-bar .search{margin-left:auto;width:260px}',
    '.chip{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:5px 12px;cursor:pointer;font-weight:700}',
    '.chip .n{font-weight:800}.chip.on{outline:2px solid var(--brand);outline-offset:-1px}',
    '.chip.ok .n{color:var(--ok)}.chip.late .n{color:var(--late)}.chip.stale .n{color:var(--stale)}.chip.offline .n,.chip.bad .n{color:var(--off)}',
    '.chip.nodata .n{color:var(--none)}.chip.warn .n{color:var(--late)}',
    '.table-wrap{overflow-x:auto;background:var(--card);border-radius:14px;border:1px solid var(--line)}',
    'table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}',
    'th{font-size:12px;color:var(--muted);white-space:nowrap;background:var(--panel)}th.sortable{cursor:pointer}',
    '.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.sid{display:block;color:var(--muted);font-size:12px}.time{white-space:nowrap}',
    'tr.st-offline td:not(:first-child):not(.flags),tr.st-clock td:not(:first-child):not(.flags),tr.st-nodata td:not(:first-child):not(.flags){opacity:.6}',
    '.v-bad{color:var(--bad);background:var(--bad-bg);font-weight:800}.v-warn{color:var(--late);background:var(--late-bg);font-weight:800}',
    '.flag{display:inline-block;margin:0 4px 3px 0;padding:1px 7px;border-radius:6px;font-size:12px}',
    '.flag.bad{color:var(--bad);background:var(--bad-bg)}.flag.warn{color:var(--late);background:var(--late-bg)}',
    // Fit-to-screen overview (sizes scale with each card's box)
    'main.fit-mode{max-width:none;padding:12px 16px}',
    '.fit{display:grid;gap:12px;height:calc(100vh - var(--top-h,64px) - 24px);min-height:300px}',
    '.fcell{container-type:size;min-width:0;min-height:0}',
    '.fc{height:100%;display:flex;flex-direction:column;gap:.6em;background:var(--card);border:1px solid var(--line);border-radius:16px;',
    'padding:.9em 1em;box-shadow:var(--shadow);overflow:hidden;cursor:pointer;font-size:clamp(9px,min(4.2cqw,3.4cqh),24px)}',
    '.fc:hover{border-color:var(--brand)}',
    '.fc .ic{width:1.1em;height:1.1em}',
    '.fc-h{display:flex;align-items:center;gap:.45em}',
    '.fc-h h3{flex:1;margin:0;font-size:1.15em;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.fc-near{color:var(--brand);display:flex}',
    '.fc-age{display:inline-flex;align-items:center;gap:.4em;font-size:.8em;font-weight:700;padding:.15em .65em;border-radius:999px;white-space:nowrap}',
    '.fc-age.live{background:var(--ok-bg);color:var(--ok)}.fc-age.late{background:var(--late-bg);color:var(--late)}',
    '.fc-hero{display:flex;align-items:center;gap:.8em}.fc-hero .scene{width:4.4em;height:4.4em;flex:none}',
    '.fc-now{min-width:0}.fc-t{font-size:2.9em;font-weight:800;line-height:1;letter-spacing:-.04em}',
    '.fc-w{font-weight:800;font-size:.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.fc-hi{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:.2em;text-align:right;flex:none}',
    '.fc-hl{font-size:.7em;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.fc-hi b{font-size:1.3em;line-height:1.1}',
    '.fc .lvl{font-size:.78em;padding:.15em .6em;gap:.4em}.fc .lvl i{width:.6em;height:.6em}',
    '.fc-rows{display:flex;flex-direction:column;justify-content:space-evenly;gap:.25em;flex:1;min-height:0}',
    '.fm{display:grid;grid-template-columns:1.8em 5.4em minmax(0,1fr) auto;align-items:center;gap:.55em}',
    '.fm-ic{width:1.8em;height:1.8em;border-radius:.5em;display:grid;place-items:center;color:var(--c);',
    'background:color-mix(in srgb,var(--c) 14%,transparent)}',
    '.fm-l{color:var(--muted);font-weight:700;font-size:.9em}.fm-v{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.fc-adv{padding:.55em .75em;border-radius:.7em;font-size:.85em;gap:.5em}.fc-adv .ic{width:1.25em;height:1.25em;margin-top:.05em}',
    '.fc-adv span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.fc-msg{margin:auto 0;font-weight:700;text-align:center}.fc-msg p{margin:.5em 0 0}.fc-msg .pill{font-size:.85em}',
    '@container (max-height:250px){.fc-adv{display:none}}',
    '@container (max-height:190px){.fm:nth-child(n+4){display:none}.fc-hero .scene{display:none}}',
    '@container (max-width:250px){.fm{grid-template-columns:1.8em minmax(0,1fr) auto}.fm-l{display:none}.fc-hi .lvl{display:none}}',
    '@container (max-width:190px){.fm .lvl{display:none}.fm{grid-template-columns:1.8em minmax(0,1fr)}}',
    // Groups and scope
    '.gsel{font:inherit;font-weight:700;padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text);max-width:200px}',
    '.gsel[hidden]{display:none}',
    '.groups{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:12px 0 4px;background:var(--panel)}',
    '.groups-h{display:flex;justify-content:space-between;gap:8px;font-size:14px}',
    '.gchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.gchip{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;background:var(--card);overflow:hidden}',
    '.gchip.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}',
    '.gload{border:0;background:none;padding:5px 6px 5px 12px;font-weight:700;cursor:pointer}',
    '.gdel{border:0;background:none;padding:5px 9px 5px 4px;cursor:pointer;color:var(--muted);display:flex}.gdel:hover{color:var(--danger)}.gdel .ic{width:14px;height:14px}',
    '.gsave{display:flex;gap:8px;margin-top:10px}.gsave input{flex:1;min-width:0;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card)}',
    '.seg{display:inline-flex;gap:2px;background:var(--glass);padding:3px;border-radius:10px;margin-right:4px}',
    '.seg button{border:0;background:none;padding:5px 12px;border-radius:8px;font-weight:700;cursor:pointer;color:var(--muted);white-space:nowrap}',
    '.seg button.on{background:var(--card);color:var(--text);box-shadow:var(--shadow)}',
    // Maintenance
    '.scan{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:12px}',
    '.scan-t{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '.prog{height:8px;border-radius:4px;background:var(--glass);margin-top:10px;overflow:hidden}.prog span{display:block;height:100%;background:var(--brand);transition:width .3s}',
    '.chip.m-maintenance .n{color:var(--danger)}.chip.m-attention .n{color:var(--warn)}.chip.m-offline .n{color:var(--muted)}',
    '.chip.m-good .n{color:var(--good)}.chip.m-pending .n{color:var(--muted)}',
    '.ovr{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}',
    '.ovr.good{color:var(--good);background:var(--good-bg)}.ovr.attention{color:var(--warn);background:var(--warn-bg)}',
    '.ovr.maintenance{color:var(--danger);background:var(--danger-bg)}.ovr.offline{color:#fff;background:#5b6b8c}.ovr.pending{color:var(--muted);background:var(--glass)}',
    '.res{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}',
    '.res.ok{color:var(--good);background:var(--good-bg)}.res.check{color:var(--warn);background:var(--warn-bg)}',
    '.res.fault{color:var(--danger);background:var(--danger-bg)}.res.na{color:var(--muted);background:var(--glass)}',
    '.mtable th.cc,.mtable td.cc{text-align:center;padding-left:4px;padding-right:4px;color:var(--muted)}.mtable th .ic{width:16px;height:16px}',
    '.mrow{cursor:pointer}.mrow:hover td{background:var(--panel)}.mf{min-width:220px;font-size:13px}',
    '.dotc{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle}',
    '.dotc.ok{background:' + C.green + '}.dotc.check{background:' + C.yellow + '}.dotc.fault{background:' + C.red + '}.dotc.na{background:var(--glass-line)}',
    '.report-bar{display:flex;justify-content:space-between;gap:8px;margin-bottom:12px}',
    '.rep-h{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px}',
    '.rep-h h2{margin:2px 0 0;font-size:24px}.rep-o{text-align:right}.rep-o .ovr{font-size:14px;padding:4px 14px}',
    '.report .advice{margin-bottom:14px}',
    '.mcomps{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))}',
    '.mcomp{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card)}',
    '.mcomp.fault{border-color:color-mix(in srgb,' + C.red + ' 45%,var(--line))}.mcomp.check{border-color:color-mix(in srgb,' + C.yellow + ' 55%,var(--line))}',
    '.mcomp header{display:flex;align-items:center;gap:8px}.mcomp h3{flex:1;margin:0;font-size:15px}',
    '.finds{margin:10px 0 0;padding:0;list-style:none;font-size:13.5px}',
    '.finds li{padding-left:16px;position:relative;margin:4px 0}',
    '.finds li:before{content:"";position:absolute;left:2px;top:.55em;width:7px;height:7px;border-radius:50%;background:' + C.green + '}',
    '.finds li.check:before{background:' + C.yellow + '}.finds li.fault:before{background:' + C.red + '}',
    '.acts{margin-top:10px;padding:8px 10px;border-radius:10px;background:var(--panel);font-size:13px}',
    '.acts ul{margin:4px 0 0;padding-left:18px}.acts li{margin:2px 0}',
    '.strip{width:100%;height:14px;display:block;margin-top:10px}.mspark{width:100%;height:44px;display:block;margin-top:10px}',
    '.routine{margin-top:14px}.checklist{list-style:none;padding:0;margin:8px 0 0;font-size:14px}',
    '.checklist li{display:flex;gap:10px;align-items:flex-start;margin:6px 0}',
    '.box{width:15px;height:15px;border:2px solid var(--glass-line);border-radius:4px;flex:none;margin-top:2px}',
    '.small{font-size:13px}',
    '@media print{.top,.report-bar,.no-print{display:none!important}body{background:#fff!important}',
    'main{padding:0!important;max-width:none}.card{box-shadow:none!important;border:0!important;padding:0!important}',
    '.mcomp{break-inside:avoid}.routine{break-inside:avoid}}',
    // Narrow screens
    '@media (max-width:820px){.hero{grid-template-columns:auto 1fr}.advice{grid-column:1/-1}}',
    '@media (max-width:600px){.top{padding:10px 16px}main{padding:14px 16px 32px}.tagline{display:none}',
    '.hero-t{font-size:46px}.scene{width:72px;height:72px}.card{padding:14px;border-radius:16px}.card-h h2{font-size:20px}',
    '.board-bar .search{width:100%}#wn-status{width:100%;order:9}}'
  ].join('');

  var SHELL =
    '<div class="top"><div class="brand">' + logoMark('wn-logo-sky') +
    '<div><div class="wm">Auto<span>Wx</span></div><div class="tagline">PAGASA weather stations</div></div></div>' +
    '<div class="tabs"><button id="wn-tab-weather" data-view="weather">Weather</button>' +
    '<button id="wn-tab-board" data-view="board">Station status</button>' +
    '<button id="wn-tab-maint" data-view="maint">Maintenance</button></div>' +
    '<div class="top-r"><span id="wn-status"></span>' +
    '<button class="btn" data-act="locate" title="Show the station nearest to you">' + icon('pin') + 'Near me</button>' +
    '<button class="btn" data-act="fit" id="wn-fit"></button>' +
    '<select id="wn-group" class="gsel" aria-label="Station group" title="Switch station group"></select>' +
    '<button class="btn primary" data-act="pick">' + icon('plus') + 'Stations<span id="wn-pick-n"></span></button>' +
    '<button class="icon-btn" data-act="refresh" title="Update now" aria-label="Update now">' + icon('refresh') + '</button>' +
    '<a class="icon-btn" href="/admin/aws" title="Back to the collection system" aria-label="Back to the collection system">' + icon('exit') + '</a></div></div>' +
    '<main id="wn-main"></main><div id="wn-picker" hidden></div>';

  document.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>AutoWx</title>' +
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + encodeURIComponent(logoMark('wn-fav-sky', 64)) + '">' +
    '<style>' + CSS + '</style>';
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
  document.body.innerHTML = SHELL;

  // ---------- events ----------

  document.body.addEventListener('click', function (e) {
    var t = e.target;
    var el;
    if ((el = t.closest('[data-view]'))) {
      state.view = el.getAttribute('data-view'); state.maint.open = null; save(); render(); return;
    }
    if ((el = t.closest('[data-act]'))) {
      var act = el.getAttribute('data-act');
      if (act === 'pick') { state.picker = true; state.pickerQuery = ''; render(); var q = document.getElementById('wn-pick-q'); if (q) q.focus(); }
      else if (act === 'close-picker') { state.picker = false; render(); loadShown(); }
      else if (act === 'locate') { state.view = 'weather'; save(); locate(); }
      else if (act === 'refresh') refresh();
      else if (act === 'maint-scan') scanAll();
      else if (act === 'save-group') { var nm = document.getElementById('wn-group-name'); if (saveGroup(nm && nm.value)) render(); }
      else if (act === 'maint-stop') { if (state.scan) state.scan.running = false; render(); }
      else if (act === 'maint-back') { state.maint.open = null; render(); window.scrollTo(0, 0); }
      else if (act === 'maint-print') window.print();
      else if (act === 'fit') { state.fit = !state.fit; state.view = 'weather'; save(); render(); window.scrollTo(0, 0); }
      return;
    }
    if ((el = t.closest('[data-group-load]'))) { loadGroup(el.getAttribute('data-group-load')); render(); loadShown(); return; }
    if ((el = t.closest('[data-group-del]'))) { deleteGroup(el.getAttribute('data-group-del')); render(); return; }
    if ((el = t.closest('[data-scope]'))) { state.scope = el.getAttribute('data-scope'); save(); render(); return; }
    if ((el = t.closest('[data-maint-open]'))) {
      state.maint.open = el.getAttribute('data-maint-open'); render(); window.scrollTo(0, 0); return;
    }
    if ((el = t.closest('[data-mfilter]'))) { state.maint.filter = el.getAttribute('data-mfilter'); render(); return; }
    if ((el = t.closest('[data-open]'))) {
      // From the overview, open the full card for that station.
      var idx = shownIds().indexOf(el.getAttribute('data-open'));
      state.fit = false; save(); render();
      var card = document.querySelectorAll('.cards > .card')[idx];
      if (card) card.scrollIntoView({ block: 'start' });
      return;
    }
    if ((el = t.closest('[data-remove]'))) {
      var rid = el.getAttribute('data-remove');
      state.selected = state.selected.filter(function (x) { return x !== rid; });
      save(); render(); return;
    }
    if ((el = t.closest('[data-show]'))) {
      var sid = el.getAttribute('data-show');
      if (state.selected.indexOf(sid) === -1 && sid !== state.nearestId) {
        state.selected.unshift(sid);
        state.selected = state.selected.slice(0, CONFIG.maxShown - (state.nearestId ? 1 : 0));
      }
      state.view = 'weather'; save(); render(); loadShown(); window.scrollTo(0, 0); return;
    }
    if ((el = t.closest('[data-filter]'))) { state.board.filter = el.getAttribute('data-filter'); render(); return; }
    if ((el = t.closest('[data-sort]'))) {
      var k = el.getAttribute('data-sort'), s = state.board.sort;
      state.board.sort = s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 };
      render(); return;
    }
    if (t.id === 'wn-picker') { state.picker = false; render(); loadShown(); }
  });

  document.body.addEventListener('change', function (e) {
    if (e.target.id === 'wn-group') {
      if (e.target.value) { loadGroup(e.target.value); render(); loadShown(); window.scrollTo(0, 0); }
      return;
    }
    var id = e.target.getAttribute && e.target.getAttribute('data-pick');
    if (!id) return;
    if (e.target.checked) {
      if (state.selected.length >= CONFIG.maxShown) {
        e.target.checked = false;
        alert('You can show up to ' + CONFIG.maxShown + ' stations at once. Remove one first.');
        return;
      }
      state.selected.push(id);
    } else {
      state.selected = state.selected.filter(function (x) { return x !== id; });
    }
    save(); render();
  });

  document.body.addEventListener('input', function (e) {
    if (e.target.id === 'wn-pick-q') { state.pickerQuery = e.target.value; render(); }
    if (e.target.id === 'wn-board-q') { state.board.query = e.target.value; render(); }
    if (e.target.id === 'wn-maint-q') { state.maint.query = e.target.value; render(); }
    if (e.target.id === 'wn-group-name') state.groupName = e.target.value;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.picker) { state.picker = false; render(); loadShown(); }
    if (e.key === 'Enter' && e.target.id === 'wn-group-name') { if (saveGroup(e.target.value)) render(); }
  });

  // Re-flow the overview grid when the window changes shape.
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state.fit) render(); }, 150);
  });

  // Keep "updated … ago" fresh between refreshes.
  setInterval(function () { if (!state.picker) render(); }, 60000);

  window.__autowx = { refresh: refresh, state: state, config: CONFIG };

  render();
  refresh().then(function () { locate(); });
})();
