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
  var STATION_COORDS = {"5":[7.6022,125.9688],"7":[14.0263,121.5918],"8":[14.6451,121.0443],"10":[17.0629,122.4293],"11":[20.7878,121.8415],"12":[16.9118,121.0614],"16":[16.7976,121.1235],"156":[12.354,121.0675],"157":[13.3204,122.086],"158":[12.5771,122.2694],"159":[11.2504,123.9991],"160":[9.707,124.1044],"161":[11.608,125.4322],"162":[9.2156,123.5138],"163":[6.4438,124.9269],"164":[7.0096,125.0905],"165":[8.147,123.846],"166":[11.0634,125.0376],"167":[18.1954,120.5927],"168":[11.0724,122.6559],"169":[14.1123,122.9557],"170":[11.0307,125.7237],"171":[15.7591,121.5627],"172":[18.0547,120.5645],"173":[17.8657,120.4572],"174":[16.7203,120.3526],"175":[16.4498,120.5901],"176":[16.6275,120.7668],"177":[16.1157,119.799],"178":[14.9738,120.1563],"179":[18.2001,121.662],"180":[17.6119,121.73],"181":[16.7054,121.6749],"182":[16.4829,121.1505],"183":[15.7135,120.9039],"184":[15.0781,120.9398],"185":[15.6865,120.4147],"186":[14.4985,121.2856],"187":[14.1791,121.2218],"188":[14.1958,120.8785],"189":[14.1058,122.0147],"190":[13.5562,123.2741],"191":[13.1905,123.5999],"192":[13.5804,124.2312],"193":[13.3593,123.7302],"194":[12.9711,124.0015],"195":[12.3867,125.3015],"196":[10.6778,124.7978],"197":[10.4269,122.9208],"198":[10.8216,122.7124],"199":[11.4302,122.5971],"200":[10.7889,122.0175],"201":[4.898,119.8218],"202":[9.4371,118.5484],"203":[9.7826,126.1564],"204":[9.2457,124.7269],"205":[8.9975,124.8846],"206":[8.9884,125.3408],"207":[9.08,126.1975],"208":[6.9522,126.2167],"209":[7.6022,125.9688],"210":[7.4471,125.8095],"211":[7.1083,124.8233],"212":[6.6191,124.7489],"213":[7.9029,125.0898],"214":[6.7441,125.3555],"215":[9.0538,125.5863],"216":[11.5618,124.3965],"217":[10.0084,125.5696],"218":[8.736,125.6015],"219":[11.4258,122.0561],"220":[16.3403,121.6831],"221":[18.0246,121.1845],"222":[9.3662,122.8048],"223":[12.5677,123.7337],"224":[11.7089,122.364],"225":[10.394,125.2002],"226":[8.2324,124.6031],"228":[20.449,121.9683],"229":[20.7878,121.8415],"230":[9.0341,117.6426],"231":[8.7736,117.839],"232":[18.4573,122.1422],"233":[18.3574,121.6375],"234":[17.0629,122.4293],"235":[15.7591,121.5627],"236":[10.9491,122.502],"237":[16.9118,121.0614],"238":[16.043,120.3338],"239":[15.45,120.62],"240":[14.0993,120.9392],"241":[14.0917,121.0562],"242":[14.0263,121.5918],"243":[14.7465,121.6491],"244":[13.8801,120.9239],"245":[13.9414,121.1643],"246":[13.7481,120.9408],"247":[8.9636,118.0004],"248":[13.5017,120.9543],"249":[13.074,120.7218],"250":[13.4146,121.1795],"251":[11.9986,120.2052],"252":[9.7805,118.7301],"253":[10.8551,121.0085],"254":[12.8479,123.9891],"255":[13.5804,124.2312],"256":[13.1389,123.7346],"257":[12.2182,123.5094],"258":[12.4996,124.6365],"259":[11.2263,125.0231],"260":[10.1325,124.8385],"261":[9.6253,123.8652],"262":[10.1508,124.3268],"263":[9.7619,123.5334],"264":[10.6919,122.5689],"265":[14.7145,121.9381],"266":[10.2922,123.9033],"267":[9.8814,123.6086],"268":[9.7905,125.4936],"269":[8.9516,125.4787],"270":[8.3656,126.3358],"271":[8.2374,122.9986],"272":[8.155,125.1306],"273":[5.861,124.9967],"274":[8.0047,124.2854],"275":[7.0648,125.6081],"276":[7.078,125.4955],"277":[6.1122,125.1722],"278":[5.988,124.6242],"279":[6.9047,122.0765],"280":[9.2685,118.4035],"281":[14.6959,122.3307],"282":[19.2613,121.4756],"283":[18.5591,120.787],"284":[18.5367,120.7655],"285":[17.4112,121.4414],"286":[17.3871,122.2379],"287":[16.3938,122.2115],"288":[14.8302,120.5086],"289":[13.5218,122.404],"290":[13.8818,123.6977],"291":[11.2133,124.3914],"292":[9.865,124.5232],"293":[10.7285,123.8254],"294":[10.6288,124.4073],"295":[10.1196,123.2739],"296":[10.0993,122.8705],"297":[9.9734,122.626],"298":[10.8961,123.4155],"299":[9.3055,123.308],"300":[9.2337,126.0604],"301":[8.1859,125.8533],"302":[7.5747,126.5616],"303":[6.1979,125.6978],"304":[6.7226,124.5206],"305":[6.4596,124.3221],"306":[7.2417,124.5176],"307":[5.8227,125.2049],"308":[8.6119,124.8934],"309":[8.5747,124.4409],"310":[7.8589,125.0525],"311":[7.9983,125.0229],"312":[7.7975,122.7619],"313":[8.4686,123.5257],"314":[7.5852,122.1405],"315":[7.825,123.4366],"316":[8.1545,123.3448],"317":[7.4532,123.3127],"327":[14.5605,121.0764],"328":[14.586,120.969],"329":[14.5872,121.1759],"330":[14.7151,121.0732],"448":[6.3313,124.9512],"457":[8.1301,124.2149]};

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
    nearOnly: false,                     // "Near me": show only the nearest station
    nearPick: saved.nearPick || null,    // {key, id} station chosen when several are equally near
    tie: null,                           // stations to choose from (equally near), while the chooser is open
    picker: false,
    pickerQuery: '',
    board: { filter: 'all', query: '', sort: { key: 'severity', dir: 1 } },
    maint: { filter: 'all', query: '', open: null },   // maintenance tab
    zoom: null,                          // instrument zoom view {id, key, a, t0, t1}
    scan: null                           // {running, total, done, started, finished}
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view: state.view, fit: state.fit, selected: state.selected, groups: state.groups, scope: state.scope, nearPick: state.nearPick }));
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

  // Records for one station; by default the last 24 hours, or from–to (ms) for an earlier period.
  function fetchHistory(id, from, to) {
    var now = Date.now();
    if (from == null) { from = now - CONFIG.historyHours * 3600000; to = now + 30 * 60000; }
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
    p.set('length', String(Math.ceil((to - from) / 600000) + 12));
    p.set('search[value]', '');
    p.set('search[regex]', 'false');
    p.set('station_id', id);
    p.set('from_date', manilaQuery(from));
    p.set('to_date', manilaQuery(to));
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

  // ask = true when the user pressed "Near me": if several stations are equally near, let them choose.
  function locate(ask) {
    if (!navigator.geolocation) { state.geo = 'unavailable'; state.nearOnly = false; render(); return; }
    state.geo = 'asking';
    render();
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.geo = 'ok';
      chooseNearest(ask);
      render();
      loadShown();
    }, function () {
      state.geo = 'denied';
      state.nearOnly = false;
      if (!state.selected.length) state.picker = true;
      render();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  }

  // Stations that are reporting (or only a little late), have a location, and are all at the nearest distance.
  // Station locations are approximate town centres, so stations in the same town can tie.
  function nearestStations() {
    var now = Date.now(), list = [];
    state.stations.forEach(function (s) {
      assess(s, now);
      if (s.lat == null) return;
      s.distance = distanceKm(state.here, s);
      if (s.state === 'ok' || s.state === 'late') list.push(s);
    });
    list.sort(function (a, b) { return a.distance - b.distance; });
    return list.filter(function (s) { return list.length && s.distance - list[0].distance < 0.05; });
  }
  function tieKey(list) { return list.map(function (s) { return s.id; }).sort().join(','); }
  function chooseNearest(ask) {
    if (!state.here || !state.stations.length) return;
    var near = nearestStations();
    if (!near.length) { state.nearestId = null; return; }
    var key = tieKey(near), pick = state.nearPick && state.nearPick.key === key ? state.nearPick.id : null;
    if (near.length > 1 && ask) {
      state.tie = { key: key, ids: near.map(function (s) { return s.id; }) };   // open the chooser
    }
    state.nearestId = pick && near.some(function (s) { return s.id === pick; }) ? pick : near[0].id;
  }
  function chooseTie(id) {
    if (!state.tie) return;
    state.nearPick = { key: state.tie.key, id: id };
    state.nearestId = id; state.tie = null; state.nearOnly = true;
    save(); render(); loadShown(); window.scrollTo(0, 0);
  }
  function tieView() {
    var t = state.tie;
    var rows = t.ids.map(stationById).filter(Boolean).map(function (s) {
      var cur = s.id === state.nearestId;
      return '<button class="tie-row' + (cur ? ' on' : '') + '" data-tie="' + esc(s.id) + '"><span class="tie-n"><b>' + esc(s.label) + '</b>' +
        '<span class="sid">Station ' + esc(s.siteId) + ' · last report ' + esc(ageText(s.time != null ? (Date.now() - s.time) / 60000 : null)) + '</span></span>' +
        '<span class="tie-d">' + (s.distance < 10 ? fmt(s.distance) : Math.round(s.distance)) + ' km</span></button>';
    }).join('');
    return '<div class="sheet tie" role="dialog" aria-label="Choose the station to show"><div class="sheet-h"><h2>Choose a station</h2>' +
      '<button class="icon-btn" data-act="tie-close" title="Close" aria-label="Close">' + icon('close') + '</button></div>' +
      '<p class="muted small">These stations are the same distance from you. Which one should Near me show?</p>' +
      '<div class="tie-list">' + rows + '</div>' +
      '<p class="fine">Your choice is remembered for this place; press Near me again to change it.</p></div>';
  }

  // The nearest station is shown first when there is a free slot; picked stations are never pushed out.
  // After "Near me", only the nearest station is shown.
  function shownIds() {
    if (state.nearOnly) return state.nearestId ? [state.nearestId] : [];
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
    download: '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>',
    zoom: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/><path d="M11 8.5v5M8.5 11h5"/>',
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
    if (state.nearOnly && state.nearestId) {
      var ns = stationById(state.nearestId);
      out += '<div class="note near-only">' + icon('pin') + '<span>Showing only the station nearest to you' +
        (ns && ns.distance != null ? ' (' + (ns.distance < 10 ? fmt(ns.distance) : Math.round(ns.distance)) + ' km away)' : '') + '.' +
        (state.selected.length ? ' <button class="link" data-act="near-off">Show my ' + state.selected.length + ' station' + (state.selected.length > 1 ? 's' : '') + ' again</button>' : '') +
        '</span></div>';
    }
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

  // Shown on the Maintenance page and in every maintenance report (screen, PDF and JPEG).
  var WMO_NOTE = 'Checks follow WMO practice for automatic weather station data (WMO-No. 8 and the WMO guidelines on quality control of AWS data): ' +
    'range, step, persistence and internal-consistency tests on each sensor, plus data completeness, logger clock and power supply. ' +
    'Thresholds are set for 10-minute data. Select a station for its full report and recommended actions.';

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
    return { key: key, name: c.name, icon: c.icon, result: 'ok', findings: [], actions: [], marks: [] };
  }
  // Remember when a problem was seen, for the zoom chart and the readings table. No `to` = a single reading.
  function mark(c, result, from, to, label) {
    c.marks.push({ result: result, from: from, to: to == null ? null : to, label: label });
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

  // win = {from, to} (ms) assesses an earlier period; without it, the last 24 hours up to now.
  function assessStation(st, rows, win) {
    var live = !win;
    var now = live ? Date.now() : win.to, from = live ? now - QC.windowHours * 3600000 : win.from;
    var hours = Math.round((now - from) / 3600000);
    rows = (rows || []).filter(function (r) { return r.t >= from - 600000 && r.t <= (live ? now + QC.windowHours * 3600000 : now); });
    var comps = {};
    COMPONENTS.forEach(function (c) { comps[c.key] = component(c.key); });

    // --- Data transmission (completeness, gaps, latency)
    var expected = Math.max(1, Math.round((now - from) / 600000));
    var stamps = {};
    rows.forEach(function (r) { stamps[r.t] = (stamps[r.t] || 0) + 1; });
    var unique = Object.keys(stamps).length;
    var share = Math.min(1, unique / expected);
    var c = comps.comms;
    var lastAge = live && st && st.time != null ? (now - st.time) / 60000 : null;
    if (!rows.length) {
      var when = !live || !st || !st.timeText ? '' : st.state === 'clock'
        ? ' (the logger reports the year ' + st.timeText.slice(0, 4) + ', so its data may be filed under the wrong date)'
        : ' (last report ' + st.timeText + ', ' + ageText(lastAge) + ')';
      flag(c, 'fault', 'No records received ' + (live ? 'in the last ' + hours + ' hours' : 'in this period') + when + '.',
        live && st && st.state === 'clock' ? [ACT.clock, ACT.commsVisit] : [ACT.commsVisit, ACT.comms]);
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
        mark(c, 'check', gap.at, gap.at + gap.ms, 'Longest gap');
      }
      if (lastAge != null && lastAge > CONFIG.lateAfterMin) flag(c, 'check', 'Latest report was ' + ageText(lastAge) + '.', [ACT.comms]);
    }

    // --- Logger clock
    c = comps.clock;
    if (live && st && st.state === 'clock') {
      flag(c, 'fault', 'Latest timestamp is in the future (' + st.timeText + ').', [ACT.clock]);
    }
    var offGrid = rows.filter(function (r) { return Math.round(r.t / 60000) % 10 !== 0; }).length;
    var dups = Object.keys(stamps).filter(function (k) { return stamps[k] > 1; }).length;
    if (offGrid) flag(c, 'check', offGrid + ' record(s) not on the 10-minute schedule.', [ACT.clock]);
    if (dups) flag(c, 'check', dups + ' duplicated timestamp(s).', [ACT.clock]);
    rows.forEach(function (r) {
      if (Math.round(r.t / 60000) % 10 !== 0) mark(c, 'check', r.t, null, 'Off schedule');
      if (stamps[r.t] > 1) mark(c, 'check', r.t, null, 'Duplicate time');
    });
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
      var range = 'Battery ' + fmt(vmin) + '–' + fmt(vmax) + ' V over ' + hours + ' h.';
      if (vmin < QC.battery.fault) flag(c, 'fault', range + ' Dropped below ' + QC.battery.fault + ' V.', [ACT.battery, ACT.charging]);
      else if (vmin < QC.battery.check) flag(c, 'check', range + ' Dropped below ' + QC.battery.check + ' V.', [ACT.battery, ACT.charging]);
      else c.findings.push({ result: 'ok', text: range });
      rows.forEach(function (r) {
        var v = r.raw && r.raw.battery;
        if (v != null && v > 0 && v < 30 && v < QC.battery.check) mark(c, v < QC.battery.fault ? 'fault' : 'check', r.t, null, 'Low battery');
      });
      if (dayVolts.length >= 6 && Math.max.apply(null, dayVolts) < QC.battery.charged) {
        flag(c, 'check', 'No charging seen: daytime voltage stayed below ' + QC.battery.charged + ' V.', [ACT.charging]);
      }
    } else if (live && st && st.battery != null && st.battery > 0) {
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
        rows.forEach(function (r) {
          var v = r.raw ? r.raw[rawKey] : null;
          if (v != null && (CONFIG.sentinels.indexOf(v) !== -1 || v < lim[0] || v > lim[1])) {
            mark(comp, share > 0.1 ? 'fault' : 'check', r.t, null, CONFIG.sentinels.indexOf(v) !== -1 ? 'Error code ' + v : 'Out of range');
          }
        });
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
        if (d > max) { n++; worst = Math.max(worst, d); mark(comp, 'check', good[i].t, null, 'Jump of ' + fmt(d) + ' ' + unitText); }
      }
      if (n) flag(comp, 'check', n + ' sudden jump(s) in ' + label + ' (up to ' + fmt(worst) + ' ' + unitText + ' in 10 min; limit ' + max + ').', [act]);
    }
    function flatTest(comp, good, rawKey, tol, hours, label, act) {
      var run = longestFlat(good, function (r) { return r.raw[rawKey]; }, tol);
      if (run.ms >= hours * 3600000) {
        var long = run.ms >= 3 * hours * 3600000;
        mark(comp, long ? 'fault' : 'check', run.from, run.to, long ? 'Stuck' : 'Barely changed');
        flag(comp, long ? 'fault' : 'check', label + ' barely changed (within ' + tol + ') for ' + hrs(run.ms) + ' around ' + run.value +
          ' (' + clock(run.from) + '–' + clock(run.to) + ')' + (long ? ' — sensor appears stuck.' : ' — may be stuck.'), [act]);
      }
    }

    var good = sensor('temp', 'temp', 'temp', 'temperature', '°C', ACT.probe);
    if (good) {
      stepTest(comps.temp, good, 'temp', QC.step.temp, 'temperature', '°C', ACT.probe, true);
      flatTest(comps.temp, good, 'temp', QC.flat.temp, QC.flatHours.temp, 'Temperature', ACT.probe);
      var invRows = good.filter(function (r) { return r.raw.tmin != null && r.raw.tmax != null && r.raw.tmin > r.raw.tmax + 0.05; });
      invRows.forEach(function (r) { mark(comps.temp, 'check', r.t, null, 'Min above max'); });
      var inverted = invRows.length;
      if (inverted) flag(comps.temp, 'check', inverted + ' record(s) with minimum above maximum.', [ACT.probe]);
      if (comps.temp.result === 'ok') comps.temp.findings.push({ result: 'ok', text: 'Range, step and persistence tests passed.' });
    }

    good = sensor('rh', 'rh', 'rh', 'humidity', '%', ACT.probe);
    if (good) {
      var overRows = rows.filter(function (r) { return r.raw && r.raw.rh != null && r.raw.rh > QC.rhHigh && r.raw.rh <= 110; });
      overRows.forEach(function (r) { mark(comps.rh, 'check', r.t, null, 'Above 100%'); });
      var over = overRows.length;
      if (over) flag(comps.rh, 'check', over + ' reading(s) above 100%.', [ACT.probe]);
      var wet = longestFlat(good, function (r) { return r.raw.rh >= 99.5 ? 100 : null; }, 0);
      if (wet.ms >= QC.rhSaturatedHours * 3600000) mark(comps.rh, 'check', wet.from, wet.to, 'Saturated');
      if (wet.ms >= QC.rhSaturatedHours * 3600000) flag(comps.rh, 'check', 'At 100% for ' + hrs(wet.ms) + ' — sensor may be wet or saturated.', [ACT.rhFilter]);
      stepTest(comps.rh, good, 'rh', QC.step.rh, 'humidity', '%', ACT.probe, true);
      flatTest(comps.rh, good.filter(function (r) { return r.raw.rh < 95; }), 'rh', QC.flat.rh, QC.flatHours.rh, 'Humidity', ACT.probe);
      var dewRows = good.filter(function (r) { var dp = dewPoint(r.raw.temp, r.raw.rh); return dp != null && r.raw.temp != null && dp > r.raw.temp + 0.1; });
      dewRows.forEach(function (r) { mark(comps.rh, 'check', r.t, null, 'Dew point above temperature'); });
      var dewBad = dewRows.length;
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
        mark(comps.wind, 'fault', stuck.from, stuck.to, 'Speed stuck');
        flag(comps.wind, 'fault', 'Wind speed fixed at ' + stuck.value + ' ' + CONFIG.windUnit + ' for ' + hrs(stuck.ms) + '.', [ACT.cups]);
      }
      var calm = longestFlat(good, function (r) { return r.raw.wind; }, 0, function (r, v) { return v === 0; });
      if (calm.ms >= QC.calmHours * 3600000) {
        mark(comps.wind, 'check', calm.from, calm.to, 'Calm (0)');
        flag(comps.wind, 'check', 'Wind speed 0 for ' + hrs(calm.ms) + ' — cups may be stuck (or it was very calm).', [ACT.cups]);
      }
      var vane = { ms: 0 }, start = -1;
      for (var k = 0; k < good.length; k++) {
        var r = good[k], d = r.raw.dir, moving = r.raw.wind != null && r.raw.wind >= (CONFIG.windUnit === 'm/s' ? 1 : 3.6);
        if (k > 0 && r.t - good[k - 1].t > MAX_STEP_MS) start = -1;
        if (d != null && moving && start >= 0 && angleDiff(d, good[start].raw.dir) <= QC.vaneSpread) {
          var ms = r.t - good[start].t;
          if (ms > vane.ms) vane = { ms: ms, dir: good[start].raw.dir, from: good[start].t, to: r.t };
        } else {
          start = d != null && moving ? k : -1;
        }
      }
      if (vane.ms >= QC.vaneStuckHours * 3600000) {
        mark(comps.wind, 'fault', vane.from, vane.to, 'Vane stuck');
        flag(comps.wind, 'fault', 'Wind direction fixed near ' + Math.round(vane.dir) + '° for ' + hrs(vane.ms) + ' while the wind was blowing.', [ACT.vane]);
      }
      var dirRows = rows.filter(function (r) { return r.raw && r.raw.dir != null && (r.raw.dir < 0 || r.raw.dir > 360); });
      dirRows.forEach(function (r) { mark(comps.wind, 'check', r.t, null, 'Direction out of range'); });
      var badDir = dirRows.length;
      if (badDir) flag(comps.wind, 'check', badDir + ' wind direction value(s) outside 0–360°.', [ACT.vane]);
      if (comps.wind.result === 'ok') comps.wind.findings.push({ result: 'ok', text: 'Speed and direction tests passed.' });
    }

    good = sensor('rain', 'rain', 'rain', 'rainfall', 'mm', ACT.gauge);
    if (good) {
      var bigRows = good.filter(function (r) { return r.raw.rain > QC.rainStep; });
      bigRows.forEach(function (r) { mark(comps.rain, 'check', r.t, null, 'Too much for 10 min'); });
      var big = bigRows.length;
      if (big) flag(comps.rain, 'check', big + ' ten-minute total(s) above ' + QC.rainStep + ' mm.', [ACT.counter]);
      var mism = 0;
      for (var j = 1; j < good.length; j++) {
        var a = good[j - 1].raw.total, b = good[j].raw.total;
        if (a == null || b == null || b < a || good[j].t - good[j - 1].t > 600000) continue;   // reset or gap
        if (Math.abs((b - a) - good[j].raw.rain) > QC.totalMismatch) { mism++; mark(comps.rain, 'check', good[j].t, null, 'Total does not match'); }
      }
      if (mism) flag(comps.rain, 'check', mism + ' record(s) where the running total does not match the 10-minute rainfall.', [ACT.counter]);
      var clearRows = good.filter(function (r) { return r.raw.rain > 0 && r.raw.solar != null && r.raw.solar > 600 && r.raw.rh != null && r.raw.rh < 60; });
      var clearRain = clearRows.length;
      if (clearRain >= 2) clearRows.forEach(function (r) { mark(comps.rain, 'check', r.t, null, 'Rain under strong sun'); });
      if (clearRain >= 2) flag(comps.rain, 'check', clearRain + ' rain record(s) under strong sun and dry air — possible false tips.', [ACT.gauge, ACT.counter]);
      if (comps.rain.result === 'ok') {
        var tot = good.reduce(function (sum, r) { return sum + r.raw.rain; }, 0);
        comps.rain.findings.push({ result: 'ok', text: 'Tests passed. ' + fmt(tot) + ' mm recorded in ' + hours + ' h.' });
      }
    }

    good = sensor('solar', 'solar', 'solar', 'solar radiation', 'W/m²', ACT.pyrano);
    if (good) {
      var night = good.filter(function (r) { return isNight(r.t) && r.raw.solar > QC.nightSolar; });
      if (night.length) {
        night.forEach(function (r) { mark(comps.solar, 'check', r.t, null, 'Sunlight at night'); });
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
    return { overall: overall, components: list, top: top, rows: rows, expected: expected, from: from, to: now,
      hours: hours, live: live, assessedAt: Date.now() };
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

  // Stations in the Maintenance list, with counts and the ones the filter and search let through.
  function maintRows() {
    var m = state.maint;
    var rows = scopedStations().map(function (st) { return { st: st, a: maintFor(st) }; });
    var counts = { all: rows.length, good: 0, attention: 0, maintenance: 0, offline: 0, pending: 0 };
    rows.forEach(function (r) { counts[r.a ? r.a.overall : 'pending']++; });
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
    return { rows: rows, counts: counts, shown: shown };
  }

  function maintView() {
    if (state.maint.open) return maintReport(state.maint.open);
    var m = state.maint;
    var mv = maintRows(), counts = mv.counts, shown = mv.shown;

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
      '<div class="dl-bar"><span class="dl-l">' + icon('download') + '<span><b>Download report</b> · the ' + shown.length + ' station' + (shown.length === 1 ? '' : 's') +
      ' listed below' + (counts.pending && !(scan && scan.running) ? ' (assess them first for full results)' : '') + '</span></span>' +
      '<span class="dl-b"><button class="btn" data-act="net-pdf"' + (shown.length ? '' : ' disabled') + '>PDF</button>' +
      '<button class="btn" data-act="net-jpeg"' + (shown.length ? '' : ' disabled') + '>JPEG</button></span>' +
      '<span class="dl-n">For one station or one instrument, open the station below.</span></div>' +
      '<div class="table-wrap"><table class="mtable"><thead>' + head + '</thead><tbody>' +
      (body || '<tr><td colspan="12" class="muted center">No stations match.</td></tr>') + '</tbody></table></div>' +
      '<p class="fine">' + WMO_NOTE + '</p></div>';
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
        (a.rows.length ? '<div class="zoomable" data-zoom="' + c.key + '" title="Zoom in">' : '<div>') +
        (c.findings.length ? '<ul class="finds">' + c.findings.map(function (f) { return '<li class="' + f.result + '">' + esc(f.text) + '</li>'; }).join('') + '</ul>'
          : c.result === 'na' ? '<p class="muted small">No data to test.</p>' : '') +
        (c.key === 'comms' && a.rows.length ? completenessStrip(a) : spark) + '</div>' +
        (c.actions.length ? '<div class="acts"><b>Recommended action</b><ul>' + c.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="mtools no-print">' + (a.rows.length ? '<button class="btn sm" data-zoom="' + c.key + '">' + icon('zoom') + 'Zoom in</button>' : '') +
        '<span class="mt-dl">' + icon('download') + '<button class="link" data-ipdf="' + c.key + '">PDF</button>' +
        '<button class="link" data-ijpeg="' + c.key + '">JPEG</button></span></div>' +
        '</section>';
    }).join('');
    var counts = { fault: 0, check: 0 };
    a.components.forEach(function (c) { if (counts[c.result] != null) counts[c.result]++; });
    return '<div class="report">' +
      '<div class="report-bar">' + back + '<div class="rb-r"><span class="muted small">Whole station report:</span>' +
      '<button class="btn" data-act="rep-pdf">' + icon('download') + 'PDF</button>' +
      '<button class="btn" data-act="rep-jpeg">' + icon('download') + 'JPEG</button>' +
      '<button class="btn" data-act="maint-print">' + icon('print') + 'Print</button></div></div>' +
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
      '<p class="fine">' + WMO_NOTE + '</p>' +
      '<p class="fine">Assessment uses the station’s uploaded 10-minute data and WMO-style quality-control tests. ' +
      'Findings marked Check can also be caused by unusual weather; confirm on site before replacing equipment. ' +
      '<span class="no-print">Select an instrument’s chart (or Zoom in) to see its readings in detail and download that instrument’s report.</span></p>' +
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

  // ---------- instrument charts, zoom view and report downloads (PDF / JPEG) ----------
  //
  // Charts are drawn on a <canvas> so the same drawing serves the zoom view on screen and the
  // downloaded reports. Reports are laid out as A4 pages and saved as JPEG images; the PDF is a
  // small file that holds one page image per page, so no outside library is needed.

  var TEN_MIN = 600000, HOUR = 3600000;
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function phtDate(ms) { return new Date(ms + 8 * HOUR); }
  function stamp(ms) {      // "26 Nov 2026, 2:30 PM"
    var d = phtDate(ms);
    return d.getUTCDate() + ' ' + MONTH_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + clock(ms);
  }
  function fileStamp(ms) {  // "2026-11-26_1430"
    var d = phtDate(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + '_' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes());
  }
  function fileSafe(s) { return String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  function compOf(a, key) { return a.components.filter(function (x) { return x.key === key; })[0]; }

  var UNIT = { temp: '°C', rh: '%', pressure: 'hPa', wind: CONFIG.windUnit, dir: '°', rain: 'mm', total: 'mm', solar: 'W/m²', battery: 'V' };

  // Readings as sent by the station (error codes left out; out-of-range values kept so they can be seen).
  function rawPts(rows, key) {
    var pts = [];
    rows.forEach(function (r) {
      var v = r.raw ? r.raw[key] : null;
      if (v != null && CONFIG.sentinels.indexOf(v) === -1) pts.push({ t: r.t, v: v });
    });
    return pts;
  }
  // Periods with no records (longer than one missed report).
  function gapsOf(rows, from, to) {
    var gaps = [], prev = from - TEN_MIN;
    rows.forEach(function (r) {
      if (r.t - prev > 2 * TEN_MIN) gaps.push({ from: prev, to: r.t });
      prev = r.t;
    });
    if (to - prev > 2 * TEN_MIN) gaps.push({ from: prev, to: to });
    return gaps.map(function (g) { return { from: Math.max(g.from, from), to: g.to }; });
  }
  // Night (8 PM–4 AM), used to shade the solar chart.
  function nightsOf(from, to) {
    var out = [], d = phtDate(from), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * HOUR;
    for (var s = day0 - 4 * HOUR; s < to; s += 24 * HOUR) out.push({ from: Math.max(from, s), to: Math.min(to, s + 8 * HOUR) });
    return out.filter(function (n) { return n.to > n.from; });
  }
  // What to show for one instrument: chart panels, guide lines, readings table.
  function instrumentSpec(a, key) {
    var c = compOf(a, key), rows = a.rows;
    var spec = { key: key, comp: c, from: a.from, to: a.to, panels: [], shade: [], gaps: gapsOf(rows, a.from, a.to), marks: c.marks || [], cols: [], cells: null };
    function line(k, name, color) { return { name: name, unit: UNIT[k], color: color, pts: rawPts(rows, k), type: 'line' }; }
    if (key === 'comms') {
      var per = [];
      for (var t = a.from; t < a.to; t += HOUR) {
        var n = 0, seen = {};
        rows.forEach(function (r) { if (r.t > t && r.t <= t + HOUR && !seen[r.t]) { seen[r.t] = 1; n++; } });
        per.push({ t: t + HOUR, v: n });
      }
      spec.panels.push({ label: 'Records received per hour', unit: 'records', fixed: [0, QC.slotsPerHour + 1],
        series: [{ name: 'Records', unit: 'per hour', color: C.blue, pts: per, type: 'bar', barMs: HOUR }],
        lines: [{ v: QC.slotsPerHour, color: C.green, label: 'Expected ' + QC.slotsPerHour }] });
      spec.cols = ['Hour ending', 'Records', 'Missing'];
      spec.cells = function (t0, t1) {
        return per.filter(function (p) { return p.t > t0 && p.t - HOUR < t1; }).map(function (p) {
          var miss = Math.max(0, QC.slotsPerHour - p.v);
          return { t: p.t, cells: [clock(p.t), String(p.v), miss ? String(miss) : '—'], flag: miss ? (p.v ? 'Some records missing' : 'No records') : '', result: miss ? (p.v ? 'check' : 'fault') : '' };
        });
      };
      spec.mainSeries = per;
    } else if (key === 'clock') {
      var off = rows.map(function (r) { var m = (r.t / 60000) % 10; return { t: r.t, v: round(m > 5 ? m - 10 : m, 2) }; });
      spec.panels.push({ label: 'Minutes off the 10-minute schedule', unit: 'min', fixed: [-5, 5],
        series: [{ name: 'Offset', unit: 'min', color: C.indigo, pts: off, type: 'dot' }], lines: [{ v: 0, color: C.green, label: 'On schedule' }] });
      spec.cols = ['Time', 'Logged as', 'Offset (min)'];
      spec.cells = function (t0, t1) {
        return rows.filter(function (r) { return r.t >= t0 && r.t <= t1; }).map(function (r) {
          var m = (r.t / 60000) % 10; m = round(m > 5 ? m - 10 : m, 2);
          return { t: r.t, cells: [clock(r.t), (r.raw && r.raw.at) || '—', m ? fmt(m, 2) : '0'] };
        });
      };
      spec.mainSeries = off;
    } else {
      var P = {
        power: { s: [line('battery', 'Battery', C.green)], unit: 'V',
          lines: [{ v: QC.battery.charged, color: C.blue, label: 'Charging ' + QC.battery.charged + ' V' },
            { v: QC.battery.check, color: C.yellow, label: 'Check ' + QC.battery.check + ' V' }, { v: QC.battery.fault, color: C.red, label: 'Fault ' + QC.battery.fault + ' V' }],
          cols: [['battery', 'Battery (V)']] },
        temp: { s: [line('temp', 'Average', C.orange), line('tmax', 'Max', '#f4a259'), line('tmin', 'Min', '#f6c08a')], unit: '°C',
          cols: [['temp', 'Temp (°C)'], ['tmin', 'Min'], ['tmax', 'Max']] },
        rh: { s: [line('rh', 'Humidity', C.teal)], unit: '%', lines: [{ v: 100, color: C.red, label: '100%' }],
          cols: [['rh', 'RH (%)'], ['dew', 'Dew point (°C)'], ['temp', 'Temp (°C)']] },
        pressure: { s: [line('pressure', 'Pressure', C.indigo)], unit: 'hPa', cols: [['pressure', 'Pressure (hPa)']] },
        wind: { s: [line('wind', 'Speed', C.teal)], unit: CONFIG.windUnit, floor0: true, cols: [['wind', 'Speed (' + CONFIG.windUnit + ')'], ['dir', 'Direction']] },
        rain: { s: [{ name: '10-min rain', unit: 'mm', color: C.blue, pts: rawPts(rows, 'rain'), type: 'bar', barMs: TEN_MIN }], unit: 'mm', floor0: true,
          cols: [['rain', '10-min (mm)'], ['total', 'Running total (mm)']] },
        solar: { s: [line('solar', 'Solar', C.yellow)], unit: 'W/m²', floor0: true,
          lines: [{ v: QC.nightSolar, color: C.slate, label: 'Night limit ' + QC.nightSolar }], cols: [['solar', 'Solar (W/m²)']] }
      }[key];
      P.s = P.s.filter(function (x, i) { return i === 0 || x.pts.length; });
      spec.panels.push({ label: c.name, unit: P.unit, series: P.s, lines: P.lines || [], floor0: P.floor0, includeLines: key === 'power' });
      if (key === 'wind') {
        spec.panels.push({ label: 'Wind direction', unit: '°', fixed: [0, 360], ticks: [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']], h: 0.7,
          series: [{ name: 'Direction', unit: '°', color: C.violet, pts: rawPts(rows, 'dir'), type: 'dot' }], lines: [] });
      }
      if (key === 'rain') {
        var tot = rawPts(rows, 'total');
        if (tot.length) spec.panels.push({ label: 'Running total', unit: 'mm', h: 0.7, floor0: true, series: [{ name: 'Running total', unit: 'mm', color: C.indigo, pts: tot, type: 'line' }], lines: [] });
      }
      if (key === 'solar') spec.shade = nightsOf(a.from, a.to).map(function (n) { return { from: n.from, to: n.to, color: 'rgba(91,107,140,.10)', label: 'Night' }; });
      spec.cols = ['Time'].concat(P.cols.map(function (x) { return x[1]; }));
      spec.cells = function (t0, t1) {
        return rows.filter(function (r) { return r.t >= t0 && r.t <= t1; }).map(function (r) {
          return { t: r.t, cells: [clock(r.t)].concat(P.cols.map(function (x) {
            var k = x[0], v;
            if (k === 'dew') v = r.raw ? dewPoint(r.raw.temp, r.raw.rh) : null;
            else v = r.raw ? r.raw[k] : null;
            if (v == null) return '—';
            if (k === 'dir') return Math.round(v) + '° ' + compassPoint(v);
            return CONFIG.sentinels.indexOf(v) !== -1 ? String(v) : fmt(v, k === 'battery' || k === 'rain' || k === 'total' ? 2 : 1);
          })) };
        });
      };
      spec.mainSeries = P.s[0].pts;
      spec.unit = P.unit;
    }
    // Flag text and result for each table row.
    var base = spec.cells;
    spec.rowsIn = function (t0, t1) {
      return base(t0, t1).map(function (row) {
        var hits = spec.marks.filter(function (m) { return m.to == null ? Math.abs(m.from - row.t) < 30000 : row.t >= m.from && row.t <= m.to; });
        if (hits.length) {
          var worst = hits.reduce(function (w, m) { return RESULT[m.result].rank > RESULT[w].rank ? m.result : w; }, 'ok');
          row.flag = hits.map(function (m) { return m.label; }).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).join(', ');
          row.result = worst;
        }
        return row;
      }).reverse();   // newest first
    };
    return spec;
  }

  // Summary numbers for the main reading within a time range.
  function statsIn(spec, t0, t1) {
    var pts = (spec.mainSeries || []).filter(function (p) { return p.t >= t0 && p.t <= t1; });
    var vals = pts.map(function (p) { return p.v; });
    var flagged = spec.marks.filter(function (m) { return (m.to == null ? m.from : m.to) >= t0 && m.from <= t1; }).length;
    var expected = Math.max(1, Math.round((t1 - t0) / TEN_MIN));
    var recs = spec.key === 'comms' ? vals.reduce(function (s, v) { return s + v; }, 0) : pts.length;
    var out = [];
    if (spec.key === 'comms') {
      out.push(['Records', recs + ' of ' + expected], ['Missing', String(Math.max(0, expected - recs))]);
    } else if (vals.length) {
      var u = spec.key === 'clock' ? ' min' : ' ' + spec.unit;
      out.push(['Latest', fmt(vals[vals.length - 1], spec.key === 'power' ? 2 : 1) + u],
        ['Min', fmt(Math.min.apply(null, vals)) + u], ['Max', fmt(Math.max.apply(null, vals)) + u],
        ['Average', fmt(vals.reduce(function (s, v) { return s + v; }, 0) / vals.length) + u]);
      if (spec.key === 'rain') out.push(['Total', fmt(vals.reduce(function (s, v) { return s + v; }, 0)) + ' mm']);
      out.push(['Records', pts.length + ' of ' + expected]);
    } else {
      out.push(['Records', '0 of ' + expected]);
    }
    out.push(['Flagged', String(flagged)]);
    return out;
  }

  // ---- chart drawing (shared by screen and reports) ----

  function niceStep(span, n) {
    var raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  var TIME_STEPS = [10, 20, 30, 60, 120, 180, 360, 720, 1440].map(function (m) { return m * 60000; });
  function timeTick(ms) {
    var d = phtDate(ms), h = d.getUTCHours(), m = d.getUTCMinutes();
    if (!h && !m) return MONTH_SHORT[d.getUTCMonth()] + ' ' + d.getUTCDate();
    return (h % 12 || 12) + (m ? ':' + pad2(m) : '') + (h < 12 ? ' AM' : ' PM');
  }
  var RES_COLOR = { ok: C.green, check: C.yellow, fault: C.red, na: C.grey };

  // Draws the chart into ctx (in CSS/layout pixels). Returns the plot geometry for hover handling.
  function drawChart(ctx, w, h, spec, view, pal, hover, sel) {
    var L = 64, R = 16, T = 12, B = 30, GAP = 20;
    var t0 = view.t0, t1 = view.t1, span = Math.max(60000, t1 - t0);
    function X(t) { return L + (w - L - R) * (t - t0) / span; }
    ctx.save();
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h);
    ctx.font = '600 11px ' + FONT_STACK; ctx.textBaseline = 'middle';
    var top = T, bot = h - B;
    function band(from, to, color) {
      var a = Math.max(L, X(from)), b = Math.min(w - R, X(to));
      if (b > a) { ctx.fillStyle = color; ctx.fillRect(a, top, b - a, bot - top); }
    }
    spec.shade.forEach(function (s) { band(s.from, s.to, s.color); });
    spec.gaps.forEach(function (g) { band(g.from, g.to, pal.gap); });
    spec.marks.forEach(function (m) { if (m.to != null) band(m.from, m.to, m.result === 'fault' ? 'rgba(229,72,77,.16)' : 'rgba(240,180,41,.20)'); });
    if (sel) band(Math.min(sel.a, sel.b), Math.max(sel.a, sel.b), 'rgba(47,107,255,.15)');
    // vertical time grid (labels are drawn last)
    var stepMs = TIME_STEPS.filter(function (s) { return (w - L - R) * s / span >= 78; })[0] || TIME_STEPS[TIME_STEPS.length - 1];
    var tickTimes = [];
    for (var tt = Math.ceil((t0 + 8 * HOUR) / stepMs) * stepMs - 8 * HOUR; tt <= t1; tt += stepMs) tickTimes.push(tt);
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
    tickTimes.forEach(function (t) { var x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); });

    var weights = spec.panels.map(function (p) { return p.h || 1; });
    var total = weights.reduce(function (s, x) { return s + x; }, 0);
    var avail = bot - top - GAP * (spec.panels.length - 1), py = top, geo = [];
    spec.panels.forEach(function (p, pi) {
      var ph = avail * weights[pi] / total, y0 = py + 14, y1 = py + ph;
      py += ph + GAP;
      var vis = [];
      p.series.forEach(function (s) { s.pts.forEach(function (q) { if (q.t >= t0 - TEN_MIN && q.t <= t1 + TEN_MIN) vis.push(q.v); }); });
      var lo, hi;
      if (p.fixed) { lo = p.fixed[0]; hi = p.fixed[1]; }
      else {
        var vv = vis.concat(p.includeLines ? p.lines.map(function (l) { return l.v; }) : []);
        lo = vv.length ? Math.min.apply(null, vv) : 0; hi = vv.length ? Math.max.apply(null, vv) : 1;
        if (p.floor0) lo = Math.min(0, lo);
        if (hi - lo < 1e-6) {
          if (p.floor0 && lo >= 0) { lo = 0; hi = Math.max(1, hi * 1.5); } else { lo -= 1; hi += 1; }
        }
        var padv = (hi - lo) * 0.08; hi += padv; if (!p.floor0 || lo < 0) lo -= padv;
      }
      function Y(v) { return y1 - (y1 - y0) * (v - lo) / (hi - lo); }
      // panel title
      ctx.fillStyle = pal.text; ctx.textAlign = 'left'; ctx.font = '700 11.5px ' + FONT_STACK;
      ctx.fillText(p.label + (p.unit ? ' (' + p.unit + ')' : ''), L, py - ph - GAP + 6 > 0 ? y0 - 9 : y0 - 9);
      ctx.font = '600 11px ' + FONT_STACK;
      // y grid
      var ticks = p.ticks && (y1 - y0) / p.ticks.length < 16 ? p.ticks.filter(function (tk, i) { return i % 2 === 0; }) : p.ticks;
      if (!ticks) {
        var step = niceStep(hi - lo, Math.max(2, Math.floor((y1 - y0) / 36)));
        ticks = [];
        for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
          var dec = step < 1 ? Math.min(2, Math.ceil(-Math.log(step) / Math.LN10)) : 0;
          ticks.push([v, (Math.abs(v) < 1e-9 ? 0 : v).toFixed(dec)]);
        }
      }
      ticks.forEach(function (tk) {
        var y = Math.round(Y(tk[0])) + 0.5;
        ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
        ctx.fillStyle = pal.muted; ctx.textAlign = 'right'; ctx.fillText(tk[1], L - 8, y);
      });
      ctx.save();
      ctx.beginPath(); ctx.rect(L, y0 - 2, w - L - R, y1 - y0 + 4); ctx.clip();
      // guide lines
      (p.lines || []).forEach(function (l) {
        if (l.v < lo || l.v > hi) return;
        var y = Math.round(Y(l.v)) + 0.5;
        ctx.strokeStyle = l.color; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.font = '700 10.5px ' + FONT_STACK;
        ctx.fillText(l.label, w - R - 4, y - 8); ctx.font = '600 11px ' + FONT_STACK;
      });
      var visCount = 0;
      p.series[0].pts.forEach(function (q) { if (q.t >= t0 && q.t <= t1) visCount++; });
      var dots = visCount <= 90;
      p.series.forEach(function (s, si) {
        var pts = s.pts.filter(function (q) { return q.t >= t0 - (s.barMs || TEN_MIN) && q.t <= t1 + (s.barMs || TEN_MIN); });
        ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
        if (s.type === 'bar') {
          pts.forEach(function (q) {
            var xa = X(q.t - s.barMs), xb = X(q.t), y = Y(Math.max(lo, q.v)), yz = Y(Math.max(lo, 0));
            var bw = Math.max(1, xb - xa - (xb - xa > 4 ? 1.5 : 0.5));
            if (q.v > 0) ctx.fillRect(xa + 0.5, Math.min(y, yz), bw, Math.max(1, Math.abs(yz - y)));
          });
        } else if (s.type === 'dot') {
          pts.forEach(function (q) { ctx.beginPath(); ctx.arc(X(q.t), Y(q.v), 2.6, 0, 7); ctx.fill(); });
        } else {
          ctx.lineWidth = si === 0 ? 2.2 : 1.4; ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach(function (q, i) {
            var brk = !i || q.t - pts[i - 1].t > 2 * TEN_MIN;
            if (brk) ctx.moveTo(X(q.t), Y(q.v)); else ctx.lineTo(X(q.t), Y(q.v));
          });
          ctx.stroke();
          if (dots && si === 0) pts.forEach(function (q) { ctx.beginPath(); ctx.arc(X(q.t), Y(q.v), 2.4, 0, 7); ctx.fill(); });
        }
      });
      // flagged single readings: ring around the reading
      if (pi === 0 || spec.key === 'wind') {
        var main = p.series[0].pts;
        spec.marks.forEach(function (m) {
          if (m.to != null || m.from < t0 || m.from > t1) return;
          if (spec.key === 'wind' && (pi === 0) !== !/Direction/.test(m.label)) return;
          var q = null;
          main.forEach(function (x) { if (Math.abs(x.t - m.from) < 30000) q = x; });
          var y = q ? Y(Math.min(hi, Math.max(lo, q.v))) : y1 - 6;
          ctx.strokeStyle = RES_COLOR[m.result]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(X(m.from), y, 5.5, 0, 7); ctx.stroke();
        });
      }
      ctx.restore();
      ctx.strokeStyle = pal.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L + 0.5, y0 - 2); ctx.lineTo(L + 0.5, y1 + 0.5); ctx.lineTo(w - R, y1 + 0.5); ctx.stroke();
      geo.push({ p: p, y0: y0, y1: y1, Y: Y, lo: lo, hi: hi });
    });
    // time axis
    ctx.fillStyle = pal.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '600 11px ' + FONT_STACK;
    tickTimes.forEach(function (t) { ctx.fillText(timeTick(t), Math.min(w - R - 20, Math.max(L + 20, X(t))), bot + 8); });
    // hover read-out
    if (hover != null && hover >= t0 && hover <= t1) {
      var hx = Math.round(X(hover)) + 0.5;
      ctx.strokeStyle = pal.text; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, bot); ctx.stroke(); ctx.globalAlpha = 1;
      var lines = [stamp(hover)];
      geo.forEach(function (g) {
        g.p.series.forEach(function (s) {
          var best = null;
          s.pts.forEach(function (q) { if (Math.abs(q.t - hover) <= (s.barMs || TEN_MIN) / 2 && (!best || Math.abs(q.t - hover) < Math.abs(best.t - hover))) best = q; });
          if (best) {
            lines.push(s.name + ': ' + (s.name === 'Direction' ? Math.round(best.v) + '° ' + compassPoint(best.v) : fmt(best.v, Math.abs(best.v) < 20 ? 2 : 1) + ' ' + (s.unit || '')));
            ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(best.t), g.Y(Math.min(g.hi, Math.max(g.lo, best.v))), 4.5, 0, 7); ctx.fill();
          }
        });
      });
      spec.marks.forEach(function (m) {
        if (m.to == null ? Math.abs(m.from - hover) <= TEN_MIN / 2 : hover >= m.from && hover <= m.to) lines.push('⚑ ' + m.label);
      });
      spec.gaps.forEach(function (g) { if (hover > g.from && hover < g.to) lines.push('No data (' + hrs(g.to - g.from - TEN_MIN) + ')'); });
      ctx.font = '700 12px ' + FONT_STACK; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      var bw = Math.max.apply(null, lines.map(function (s) { return ctx.measureText(s).width; })) + 20, bh = lines.length * 17 + 12;
      var bx = hx + 14 + bw > w - R ? hx - 14 - bw : hx + 14, by = top + 6;
      ctx.fillStyle = pal.tipBg; ctx.strokeStyle = pal.grid;
      roundRect(ctx, bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
      lines.forEach(function (s, i) {
        ctx.fillStyle = i ? (s.charAt(0) === '⚑' ? C.red : pal.text) : pal.muted;
        ctx.font = (i ? '600' : '700') + ' 12px ' + FONT_STACK;
        ctx.fillText(s, bx + 10, by + 7 + i * 17);
      });
    }
    ctx.restore();
    return { L: L, R: R, w: w, t0: t0, t1: t1 };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  var FONT_STACK = 'WNunito,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  var PAPER = { bg: '#ffffff', text: '#16213a', muted: '#5e6b80', grid: '#e8edf4', axis: '#b8c3d3', gap: 'rgba(138,150,168,.16)', tipBg: '#ffffff', panel: '#f5f7fb' };
  function screenPalette() {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    return { bg: v('--card') || '#fff', text: v('--text'), muted: v('--muted'), grid: v('--line'), axis: v('--glass-line'),
      gap: dark ? 'rgba(160,170,190,.13)' : PAPER.gap, tipBg: v('--card') || '#fff' };
  }

  // ---- zoom view ----

  function openZoom(id, key) {
    var st = stationById(id), a = st && maintFor(st);
    if (!a) return;
    state.zoom = { id: id, key: key, a: a, t0: a.from, t1: a.to, hover: null, sel: null };
    renderZoom();
  }
  function closeZoom() { state.zoom = null; var z = document.getElementById('wn-zoom'); z.hidden = true; z.innerHTML = ''; }
  function dayStart(date) { var p = date.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) - 8 * HOUR; }   // 12 AM PHT
  function dateOf(ms) { var d = phtDate(ms); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  // Load and assess an earlier period: `days` calendar days ending on `date` (YYYY-MM-DD, Philippine time).
  function loadZoomPeriod(date, days) {
    var z = state.zoom;
    if (!z || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    var end = dayStart(date) + 24 * HOUR, from = end - days * 24 * HOUR, to = Math.min(end, Date.now());
    if (from >= to) return;
    var ticket = z.ticket = (z.ticket || 0) + 1;
    z.period = { date: date, days: days }; z.loading = true; z.error = null;
    renderZoom();
    fetchHistory(z.id, from, to).then(function (rows) {
      if (state.zoom !== z || z.ticket !== ticket) return;
      z.a = assessStation(stationById(z.id), rows, { from: from, to: to });
      z.t0 = from; z.t1 = to; z.loading = false; z.hover = null;
      renderZoom();
    }).catch(function (err) {
      if (state.zoom !== z || z.ticket !== ticket) return;
      z.loading = false;
      z.error = err instanceof SignedOut ? 'You have been signed out of cserv. Sign in again, then reopen AutoWx.' : (err && err.message) || 'Could not load that period.';
      renderZoom();
    });
  }
  function zoomLatest() {
    var z = state.zoom, a = maintFor(stationById(z.id));
    if (!a) return;
    z.ticket = (z.ticket || 0) + 1; z.period = null; z.error = null; z.loading = false;
    z.a = a; z.t0 = a.from; z.t1 = a.to; renderZoom();
  }
  function zoomStepDay(dir) {
    var z = state.zoom, cur = z.period ? z.period.date : dateOf(Date.now());
    var next = dateOf(dayStart(cur) + dir * 24 * HOUR + HOUR);
    if (dayStart(next) > Date.now()) return;
    loadZoomPeriod(next, z.period ? z.period.days : 1);
  }
  function setZoomRange(t0, t1) {
    var z = state.zoom, a = z.a, span = Math.max(30 * 60000, t1 - t0);
    if (span >= a.to - a.from) { z.t0 = a.from; z.t1 = a.to; }
    else {
      t0 = Math.max(a.from, Math.min(t0, a.to - span));
      z.t0 = t0; z.t1 = t0 + span;
    }
    renderZoom();
  }
  function rangeLabel(t0, t1) { return stamp(t0) + ' – ' + (phtDate(t0).getUTCDate() === phtDate(t1).getUTCDate() ? clock(t1) : stamp(t1)); }

  function renderZoom() {
    var z = state.zoom, box = document.getElementById('wn-zoom');
    if (!z) { closeZoom(); return; }
    var st = stationById(z.id), a = z.a, c = compOf(a, z.key), spec = z.spec = instrumentSpec(a, z.key);
    var full = z.t0 <= a.from && z.t1 >= a.to;
    var hrsShown = Math.round((z.t1 - z.t0) / HOUR * 10) / 10;
    var long = a.to - a.from > 25 * HOUR;
    var ranges = (long ? ['all', 24, 12, 6, 3] : [24, 12, 6, 3, 1]).map(function (n) {
      var on = n === 'all' ? full : Math.abs(hrsShown - n) < 0.05 && Math.abs(z.t1 - a.to) < 60000;
      return '<button class="seg' + (on ? ' on' : '') + '" data-zrange="' + n + '">' + (n === 'all' ? 'All ' + Math.round((a.to - a.from) / 86400000) + ' days' : n + ' h') + '</button>';
    }).join('');
    var today = dateOf(Date.now()), curDate = z.period ? z.period.date : today, curDays = z.period ? z.period.days : 1;
    var period = '<div class="zper"><span class="zper-l">' + icon('clock') + 'Period</span>' +
      '<button class="icon-btn" data-zday="-1" title="Previous day" aria-label="Previous day">' + icon('back') + '</button>' +
      '<input type="date" id="wn-zdate" value="' + curDate + '" max="' + today + '" aria-label="Day">' +
      '<button class="icon-btn flip" data-zday="1" title="Next day" aria-label="Next day"' + (!z.period || curDate >= today ? ' disabled' : '') + '>' + icon('back') + '</button>' +
      '<select id="wn-zdays" aria-label="Number of days">' + [1, 2, 3, 7].map(function (n) {
        return '<option value="' + n + '"' + (n === curDays ? ' selected' : '') + '>' + (n === 1 ? '1 day' : n + ' days, ending that day') + '</option>';
      }).join('') + '</select>' +
      '<button class="btn sm' + (z.period ? '' : ' on') + '" data-act="zoom-latest">Latest 24 h</button>' +
      (z.loading ? '<span class="zload">Loading and checking…</span>' : '') +
      (z.error ? '<span class="zerr">' + esc(z.error) + '</span>' : '') +
      '<span class="zper-n">' + (z.period ? 'Checked for ' + rangeLabel(a.from, a.to) : 'Showing the last 24 hours') + '</span></div>';
    var stats = statsIn(spec, z.t0, z.t1).map(function (s) { return '<div class="zst"><span>' + s[0] + '</span><b>' + esc(s[1]) + '</b></div>'; }).join('');
    var rows = spec.rowsIn(z.t0, z.t1);
    var table = '<table class="ztab"><thead><tr>' + spec.cols.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '<th>Flag</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        return '<tr class="' + (r.result || '') + '" data-zt="' + r.t + '">' + r.cells.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') +
          '<td class="zf">' + esc(r.flag || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="' + (spec.cols.length + 1) + '" class="muted center">No records in this period.</td></tr>') + '</tbody></table>';
    box.innerHTML = '<div class="zsheet" role="dialog" aria-label="' + esc(c.name) + ' — zoom view">' +
      '<header class="zh"><span class="tile-ic" style="--c:' + RES_COLOR[c.result] + '">' + icon(c.icon) + '</span>' +
      '<div class="zh-t"><div class="tagline">Instrument view</div><h2>' + esc(c.name) + ' ' + resultPill(c.result) + '</h2>' +
      '<div class="sub">' + esc(st.label) + ' · Station ' + esc(st.siteId) + '</div></div>' +
      '<div class="zh-b"><button class="btn" data-act="zoom-pdf">' + icon('download') + 'PDF</button>' +
      '<button class="btn" data-act="zoom-jpeg">' + icon('download') + 'JPEG</button>' +
      '<button class="icon-btn" data-act="zoom-close" title="Close" aria-label="Close">' + icon('close') + '</button></div></header>' +
      period +
      '<div class="zbar"><div class="segs">' + ranges + '</div>' +
      '<button class="icon-btn" data-zpan="-1" title="Earlier" aria-label="Earlier"' + (z.t0 <= a.from ? ' disabled' : '') + '>' + icon('back') + '</button>' +
      '<button class="icon-btn flip" data-zpan="1" title="Later" aria-label="Later"' + (z.t1 >= a.to ? ' disabled' : '') + '>' + icon('back') + '</button>' +
      '<span class="zrange">' + rangeLabel(z.t0, z.t1) + '</span>' +
      '<span class="zhint">Drag across the chart to zoom in' + (full ? '' : ' · double-click to show all') + '</span></div>' +
      '<div class="zchart"><canvas id="wn-zcanvas"></canvas></div>' +
      '<div class="zlegend">' + zoomLegend(spec) + '</div>' +
      '<div class="zstats">' + stats + '</div>' +
      '<div class="zgrid"><div class="zfind">' +
      (c.findings.length ? '<ul class="finds">' + c.findings.map(function (f) { return '<li class="' + f.result + '">' + esc(f.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted small">No data to test.</p>') +
      (c.actions.length ? '<div class="acts"><b>Recommended action</b><ul>' + c.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      '</div><div class="ztable"><div class="ztable-h">Readings (' + rows.length + ', newest first)</div><div class="ztable-s">' + table + '</div></div></div></div>';
    box.hidden = false;
    drawZoom();
    bindZoomCanvas();
  }
  function zoomLegend(spec) {
    var items = [];
    spec.panels.forEach(function (p) { p.series.forEach(function (s) { items.push('<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'); }); });
    if (spec.gaps.length) items.push('<span><i class="sq gap"></i>No data</span>');
    var spans = spec.marks.filter(function (m) { return m.to != null; });
    if (spans.length) {
      var fault = spans.some(function (m) { return m.result === 'fault'; });
      items.push('<span><i class="sq" style="background:' + (fault ? 'rgba(229,72,77,.3)' : 'rgba(240,180,41,.4)') + '"></i>Flagged period</span>');
    }
    if (spec.marks.some(function (m) { return m.to == null; })) items.push('<span><i class="ring"></i>Flagged reading</span>');
    if (spec.key === 'solar') items.push('<span><i class="sq night"></i>Night</span>');
    return items.join('');
  }
  function drawZoom() {
    var z = state.zoom, cv = document.getElementById('wn-zcanvas');
    if (!z || !cv) return;
    var w = cv.parentNode.clientWidth, h = Math.max(260, Math.min(460, Math.round(w * 0.42))) + (z.spec.panels.length > 1 ? 120 : 0);
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    z.geo = drawChart(ctx, w, h, z.spec, { t0: z.t0, t1: z.t1 }, screenPalette(), z.hover, z.sel);
  }
  function bindZoomCanvas() {
    var cv = document.getElementById('wn-zcanvas');
    function tAt(e) {
      var z = state.zoom, g = z.geo, r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      return g.t0 + (g.t1 - g.t0) * (x - g.L) / (g.w - g.L - g.R);
    }
    cv.addEventListener('pointermove', function (e) {
      var z = state.zoom; if (!z) return;
      var t = tAt(e);
      z.hover = t >= z.t0 && t <= z.t1 ? t : null;
      if (z.sel) z.sel.b = Math.max(z.t0, Math.min(z.t1, t));
      drawZoom();
    });
    cv.addEventListener('pointerleave', function () { var z = state.zoom; if (z && !z.sel) { z.hover = null; drawZoom(); } });
    cv.addEventListener('pointerdown', function (e) {
      var z = state.zoom, t = tAt(e);
      if (t < z.t0 || t > z.t1) return;
      z.sel = { a: t, b: t }; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerup', function () {
      var z = state.zoom; if (!z || !z.sel) return;
      var a = Math.min(z.sel.a, z.sel.b), b = Math.max(z.sel.a, z.sel.b);
      z.sel = null;
      if (b - a >= 20 * 60000) setZoomRange(a, b); else drawZoom();
    });
    cv.addEventListener('dblclick', function () { var z = state.zoom; setZoomRange(z.a.from, z.a.to); });
    cv.addEventListener('wheel', function (e) {
      var z = state.zoom; if (!z || !(e.ctrlKey || e.metaKey || e.altKey)) return;   // plain wheel keeps scrolling the page
      e.preventDefault();
      var t = tAt(e), f = e.deltaY > 0 ? 1.25 : 0.8;
      setZoomRange(t - (t - z.t0) * f, t - (t - z.t0) * f + (z.t1 - z.t0) * f);
    }, { passive: false });
  }

  // ---- report layout (A4 pages drawn on canvas) ----

  var DOC = { W: 820, H: 1160, M: 44, S: 2 };   // layout pixels; A4 proportions; drawn at 2× for sharp text
  var measureCtx = document.createElement('canvas').getContext('2d');
  function dfont(size, weight) { return (weight || 400) + ' ' + size + 'px ' + FONT_STACK; }
  function wrap(text, width, f) {
    measureCtx.font = f;
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var line = '';
      para.split(' ').forEach(function (word) {
        var test = line ? line + ' ' + word : word;
        if (measureCtx.measureText(test).width <= width || !line) line = test;
        else { out.push(line); line = word; }
      });
      out.push(line);
    });
    return out;
  }
  var PILL = { ok: ['#1d8a5a', '#e4f5ec'], check: ['#9a5b00', '#fff2d9'], fault: ['#b4232a', '#fde5e5'], na: ['#5e6b80', '#eef2f7'],
    good: ['#1d8a5a', '#e4f5ec'], attention: ['#9a5b00', '#fff2d9'], maintenance: ['#b4232a', '#fde5e5'], offline: ['#ffffff', '#5b6b8c'], pending: ['#5e6b80', '#eef2f7'] };
  function pill(ctx, x, y, text, kind, size) {   // y = top; returns width
    size = size || 11;
    ctx.font = dfont(size, 800);
    var w = ctx.measureText(text).width + size * 1.6, h = size * 1.8;
    ctx.fillStyle = PILL[kind][1]; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = PILL[kind][0]; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, x + size * 0.8, y + h / 2 + 0.5);
    return w;
  }
  function pillWidth(text, size) { size = size || 11; measureCtx.font = dfont(size, 800); return measureCtx.measureText(text).width + size * 1.6; }

  function Doc(title) { this.title = title; this.blocks = []; }
  Doc.prototype.add = function (b) { this.blocks.push(b); return this; };
  Doc.prototype.space = function (h) { return this.add({ h: h, draw: function () {} }); };
  // The JPEG image stops here (the PDF keeps everything after it).
  Doc.prototype.imageEnd = function () { this.cutAt = this.blocks.length; return this; };
  Doc.prototype.text = function (text, o) {
    o = o || {};
    var size = o.size || 12.5, f = dfont(size, o.weight), lh = Math.round(size * 1.5), indent = o.indent || 0;
    var lines = wrap(text, DOC.W - 2 * DOC.M - indent - (o.right || 0), f), after = o.after == null ? 4 : o.after;
    return this.add({ h: lines.length * lh + after, keepNext: o.keepNext, draw: function (ctx, x, y) {
      ctx.font = f; ctx.fillStyle = o.color || PAPER.text; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      lines.forEach(function (ln, i) { ctx.fillText(ln, x + indent, y + i * lh + lh / 2); });
      if (o.bullet) { ctx.fillStyle = o.bullet; ctx.beginPath(); ctx.arc(x + indent - 9, y + lh / 2, 3.5, 0, 7); ctx.fill(); }
      if (o.box) { ctx.strokeStyle = '#b8c3d3'; ctx.lineWidth = 1.5; roundRect(ctx, x + indent - 17, y + lh / 2 - 6, 12, 12, 3); ctx.stroke(); }
    } });
  };
  Doc.prototype.callout = function (text, kind) {
    var f = dfont(13, 700), lines = wrap(text, DOC.W - 2 * DOC.M - 28, f), lh = 20, h = lines.length * lh + 18;
    return this.add({ h: h + 12, draw: function (ctx, x, y) {
      ctx.fillStyle = PILL[kind][1]; roundRect(ctx, x, y, DOC.W - 2 * DOC.M, h, 10); ctx.fill();
      ctx.fillStyle = PILL[kind][0]; ctx.font = f; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      lines.forEach(function (ln, i) { ctx.fillText(ln, x + 14, y + 9 + i * lh + lh / 2); });
    } });
  };
  Doc.prototype.rule = function () {
    return this.add({ h: 14, draw: function (ctx, x, y) { ctx.fillStyle = PAPER.grid; ctx.fillRect(x, y + 6, DOC.W - 2 * DOC.M, 1.5); } });
  };
  // Report title block.
  Doc.prototype.header = function (kicker, title, sub, kind, label, right) {
    var tl = wrap(title, DOC.W - 2 * DOC.M - 200, dfont(24, 800));
    var h = Math.max(26 + tl.length * 32 + 24 + 14, 68 + (right || []).length * 17 + 12);
    return this.add({ h: h, draw: function (ctx, x, y) {
      var W = DOC.W - 2 * DOC.M;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = '#2f6bff'; ctx.font = dfont(13, 800); ctx.fillText('AutoWx', x, y + 8);
      measureCtx.font = dfont(13, 800);
      ctx.fillStyle = PAPER.muted; ctx.font = dfont(10, 700); ctx.fillText('  ·  ' + kicker.toUpperCase(), x + measureCtx.measureText('AutoWx').width, y + 8);
      ctx.fillStyle = PAPER.text; ctx.font = dfont(24, 800);
      tl.forEach(function (ln, i) { ctx.fillText(ln, x, y + 26 + i * 32 + 16); });
      ctx.fillStyle = PAPER.muted; ctx.font = dfont(12.5, 600); ctx.fillText(sub, x, y + 26 + tl.length * 32 + 12);
      if (kind) { var pw = pillWidth(label, 14); pill(ctx, x + W - pw, y + 28, label, kind, 14); }
      ctx.fillStyle = PAPER.muted; ctx.font = dfont(11.5, 600); ctx.textAlign = 'right';
      (right || []).forEach(function (r, i) { ctx.fillText(r, x + W, y + 68 + i * 17); });
      ctx.textAlign = 'left';
      ctx.fillStyle = PAPER.grid; ctx.fillRect(x, y + h - 8, W, 1.5);
    } });
  };
  // Heading for one instrument, with its result.
  Doc.prototype.section = function (title, result) {
    return this.add({ h: 34, keepNext: true, draw: function (ctx, x, y) {
      ctx.fillStyle = RES_COLOR[result]; roundRect(ctx, x, y + 6, 5, 22, 2.5); ctx.fill();
      ctx.fillStyle = PAPER.text; ctx.font = dfont(16, 800); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(title, x + 14, y + 17);
      measureCtx.font = dfont(16, 800);
      pill(ctx, x + 26 + measureCtx.measureText(title).width, y + 7, RESULT[result].label, result, 11);
    } });
  };
  Doc.prototype.chart = function (spec, view, height) {
    return this.add({ h: height + 10, draw: function (ctx, x, y) {
      ctx.save(); ctx.translate(x, y);
      drawChart(ctx, DOC.W - 2 * DOC.M, height, spec, view, PAPER, null, null);
      ctx.restore();
    } });
  };
  // Row of small figures (label above value).
  Doc.prototype.stats = function (items) {
    return this.add({ h: 58, draw: function (ctx, x, y) {
      var W = DOC.W - 2 * DOC.M, cw = W / items.length;
      items.forEach(function (s, i) {
        ctx.fillStyle = PAPER.panel; roundRect(ctx, x + i * cw + 2, y, cw - 4, 48, 8); ctx.fill();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = PAPER.muted; ctx.font = dfont(10.5, 700); ctx.fillText(s[0].toUpperCase(), x + i * cw + 12, y + 14);
        ctx.fillStyle = PAPER.text; ctx.font = dfont(14, 800); ctx.fillText(s[1], x + i * cw + 12, y + 33);
      });
    } });
  };
  // Table: cols = [{label, w (share of width)}]; rows = arrays of cells (text, or {pill: result} / {dot: result}).
  Doc.prototype.table = function (cols, rows, o) {
    o = o || {};
    var W = DOC.W - 2 * DOC.M, size = o.size || 11.5, lh = Math.round(size * 1.45), self = this;
    var xs = [], acc = 0;
    cols.forEach(function (c) { xs.push(acc); acc += c.w * W; });
    var head = { h: 26, keepNext: true, draw: function (ctx, x, y) {
      ctx.fillStyle = PAPER.panel; ctx.fillRect(x, y, W, 24);
      ctx.fillStyle = PAPER.muted; ctx.font = dfont(10, 800); ctx.textBaseline = 'middle';
      cols.forEach(function (c, i) { ctx.textAlign = c.center ? 'center' : 'left'; ctx.fillText(c.label.toUpperCase(), x + xs[i] + (c.center ? c.w * W / 2 : 6), y + 12); });
      ctx.textAlign = 'left';
    } };
    self.add(head);
    rows.forEach(function (row, ri) {
      var tint = row.tint;
      var cells = (row.cells || row).map(function (cell, i) {
        if (cell && typeof cell === 'object') return cell;
        return { lines: wrap(cell == null ? '' : cell, cols[i].w * W - 12, dfont(size, cols[i].bold ? 700 : 400)) };
      });
      var n = Math.max.apply(null, cells.map(function (c) { return c.lines ? c.lines.length : 1; }));
      var h = n * lh + 10;
      self.add({ h: h, repeatHead: head, draw: function (ctx, x, y) {
        if (tint) { ctx.fillStyle = tint; ctx.fillRect(x, y, W, h); }
        else if (ri % 2) { ctx.fillStyle = '#fafbfd'; ctx.fillRect(x, y, W, h); }
        ctx.fillStyle = PAPER.grid; ctx.fillRect(x, y + h - 1, W, 1);
        cells.forEach(function (c, i) {
          var cx = x + xs[i] + 6;
          if (c.pill) pill(ctx, cx, y + 5, RESULT[c.pill] ? RESULT[c.pill].label : OVERALL[c.pill].label, c.pill, 10);
          else if (c.dot) { ctx.fillStyle = RES_COLOR[c.dot]; ctx.beginPath(); ctx.arc(x + xs[i] + cols[i].w * W / 2, y + 5 + lh / 2, 5, 0, 7); ctx.fill(); }
          else {
            ctx.fillStyle = c.color || (cols[i].muted ? PAPER.muted : PAPER.text);
            ctx.font = dfont(size, cols[i].bold ? 700 : 400); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            c.lines.forEach(function (ln, k) { ctx.fillText(ln, cx, y + 5 + k * lh + lh / 2); });
          }
        });
      } });
    });
    return this.space(8);
  };

  // Splits blocks into pages; a table header is repeated at the top of a new page.
  Doc.prototype.paginate = function () {
    var top = DOC.M, bottom = DOC.H - DOC.M - 22 - noteHeight() - 6, pages = [[]], y = top, bl = this.blocks;
    for (var i = 0; i < bl.length; i++) {
      var b = bl[i], need = b.h;
      for (var j = i; bl[j] && bl[j].keepNext && bl[j + 1]; j++) need += bl[j + 1].h;
      need = Math.min(need, bottom - top);
      if (y + need > bottom && y > top) {
        pages.push([]); y = top;
        if (b.repeatHead) { pages[pages.length - 1].push({ b: b.repeatHead, y: y }); y += b.repeatHead.h; }
      }
      pages[pages.length - 1].push({ b: b, y: y }); y += b.h;
    }
    return pages;
  };
  function newCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(w * DOC.S); cv.height = Math.round(h * DOC.S);
    var ctx = cv.getContext('2d'); ctx.scale(DOC.S, DOC.S);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    return { cv: cv, ctx: ctx };
  }
  // The WMO statement, printed as a footnote above the page footer.
  var NOTE_LH = 12.5;
  function noteLines() { return wrap(WMO_NOTE, DOC.W - 2 * DOC.M, dfont(9, 600)); }
  function noteHeight() { return noteLines().length * NOTE_LH + 8; }
  function footnote(ctx, y) {   // y = top of the footnote
    var x = DOC.M;
    ctx.fillStyle = PAPER.grid; ctx.fillRect(x, y, 120, 1);
    ctx.fillStyle = PAPER.muted; ctx.font = dfont(9, 600); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    noteLines().forEach(function (ln, i) { ctx.fillText(ln, x, y + 6 + i * NOTE_LH + NOTE_LH / 2); });
  }
  function footer(ctx, y, title, page) {
    var x = DOC.M, W = DOC.W - 2 * DOC.M;
    ctx.fillStyle = PAPER.grid; ctx.fillRect(x, y, W, 1);
    ctx.fillStyle = PAPER.muted; ctx.font = dfont(9.5, 600); ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText('AutoWx · ' + title, x, y + 12);
    ctx.textAlign = 'right'; ctx.fillText((page ? page + ' · ' : '') + 'Generated ' + stamp(Date.now()), x + W, y + 12);
    ctx.textAlign = 'left';
  }
  Doc.prototype.pageCanvases = function () {
    var pages = this.paginate(), title = this.title;
    return pages.map(function (items, i) {
      var c = newCanvas(DOC.W, DOC.H);
      items.forEach(function (it) { it.b.draw(c.ctx, DOC.M, it.y); });
      footnote(c.ctx, DOC.H - DOC.M - 12 - noteHeight());
      footer(c.ctx, DOC.H - DOC.M - 8, title, 'Page ' + (i + 1) + ' of ' + pages.length);
      return c.cv;
    });
  };
  // One long image (no page breaks). Too tall for one image → one image per page.
  Doc.prototype.longCanvases = function () {
    var blocks = this.cutAt != null ? this.blocks.slice(0, this.cutAt) : this.blocks;
    var total = DOC.M + blocks.reduce(function (s, b) { return s + b.h; }, 0) + 16 + noteHeight() + 40 + DOC.M / 2;
    if (total * DOC.S > 30000) return this.pageCanvases();
    var c = newCanvas(DOC.W, total), y = DOC.M;
    blocks.forEach(function (b) { b.draw(c.ctx, DOC.M, y); y += b.h; });
    footnote(c.ctx, y + 12);
    footer(c.ctx, y + 16 + noteHeight(), this.title, '');
    return [c.cv];
  };

  // ---- the two reports ----

  function stationSub(st) { return 'Station ' + st.siteId + (st.lat != null ? ' · approx. ' + st.lat.toFixed(3) + '°N, ' + st.lon.toFixed(3) + '°E' : ''); }
  function mainFinding(c) {
    var bad = c.findings.filter(function (f) { return f.result !== 'ok'; });
    return (bad[0] || c.findings[0] || { text: c.result === 'na' ? 'No data to test.' : '' }).text;
  }
  // keep = the next block (a chart) stays on the same page as these lines.
  function addFindings(doc, c, keep) {
    if (!c.findings.length) doc.text(c.result === 'na' ? 'No data to test.' : 'No findings.', { color: PAPER.muted, indent: 18, keepNext: keep });
    c.findings.forEach(function (f) { doc.text(f.text, { indent: 18, bullet: RES_COLOR[f.result], keepNext: keep }); });
  }
  function addActions(doc, c) {
    if (!c.actions.length) return;
    doc.text('Recommended action', { weight: 800, size: 12, keepNext: true, after: 2 });
    c.actions.forEach(function (x) { doc.text(x, { indent: 18, bullet: '#2f6bff', size: 12 }); });
  }

  // Whole station: summary, every instrument with its 24-hour chart, actions, site visit checklist.
  function stationDoc(st, a, image) {
    var o = OVERALL[a.overall], doc = new Doc(st.label + ' — station maintenance report');
    var counts = { fault: 0, check: 0 };
    a.components.forEach(function (c) { if (counts[c.result] != null) counts[c.result]++; });
    doc.header('Station maintenance report', st.label, stationSub(st), a.overall, o.label,
      ['Assessed ' + stamp(a.to), 'Data from ' + stamp(a.from) + ' (' + QC.windowHours + ' h)']);
    doc.callout(o.say + (counts.fault || counts.check ? ' (' + [counts.fault ? counts.fault + ' fault' + (counts.fault > 1 ? 's' : '') : '',
      counts.check ? counts.check + ' to check' : ''].filter(Boolean).join(', ') + ')' : ''),
      a.overall === 'good' ? 'ok' : a.overall === 'attention' ? 'check' : a.overall === 'pending' ? 'na' : 'fault');
    doc.text('Summary', { weight: 800, size: 15, keepNext: true, after: 6 });
    doc.table([{ label: 'Instrument', w: 0.25, bold: true }, { label: 'Result', w: 0.15 }, { label: 'Main finding', w: 0.6 }],
      a.components.map(function (c) { return [c.name, { pill: c.result }, mainFinding(c)]; }));
    if (image) {
      // Short image for sharing: summary, then every recommended action, then stop.
      var acts = [];
      a.components.forEach(function (c) {
        c.actions.forEach(function (x) { if (!acts.some(function (o) { return o.x === x; })) acts.push({ c: c, x: x }); });
      });
      doc.space(4).text('Recommended action', { weight: 800, size: 15, keepNext: true, after: 6 });
      if (!acts.length) doc.text('None. Continue routine maintenance.', { indent: 18, bullet: RES_COLOR.ok });
      acts.forEach(function (o) { doc.text(o.c.name + ': ' + o.x, { indent: 18, bullet: RES_COLOR[o.c.result] }); });
      return doc;
    }
    a.components.forEach(function (c) {
      doc.space(6).section(c.name, c.result);
      addFindings(doc, c, a.rows.length > 0);
      if (a.rows.length) { doc.chart(instrumentSpec(a, c.key), { t0: a.from, t1: a.to }, c.key === 'wind' || c.key === 'rain' ? 300 : 180); }
      addActions(doc, c);
    });
    doc.imageEnd();
    doc.space(10).text('Routine site visit checklist', { weight: 800, size: 15, keepNext: true, after: 6 });
    ROUTINE.forEach(function (x) { doc.text(x, { indent: 22, box: true }); });
    doc.space(8).text('Assessment uses the station’s uploaded 10-minute data and WMO-style quality-control tests. ' +
      'Findings marked Check can also be caused by unusual weather; confirm on site before replacing equipment.', { size: 10.5, color: PAPER.muted });
    doc.text('Checked by: ______________________     Date of visit: ______________     Signature: ______________', { size: 11.5, color: PAPER.muted, before: 0 });
    return doc;
  }

  // One instrument: figures, chart for the chosen period, findings, actions and every reading.
  function instrumentDoc(st, a, key, view) {
    var c = compOf(a, key), spec = instrumentSpec(a, key);
    var doc = new Doc(st.label + ' — ' + c.name);
    doc.header('Instrument report', c.name + ' — ' + st.label, stationSub(st), c.result, RESULT[c.result].label,
      ['Period ' + rangeLabel(view.t0, view.t1), 'Assessed ' + stamp(a.assessedAt || a.to)]);
    doc.stats(statsIn(spec, view.t0, view.t1));
    doc.chart(spec, view, spec.panels.length > 1 ? 400 : 300);
    doc.text('Findings (' + (a.live === false ? 'checks for ' + rangeLabel(a.from, a.to) : QC.windowHours + '-hour assessment') + ')',
      { weight: 800, size: 14, keepNext: true, after: 4 });
    addFindings(doc, c);
    addActions(doc, c);
    doc.imageEnd();
    var rows = spec.rowsIn(view.t0, view.t1);
    doc.space(8).text('Readings (' + rows.length + ', newest first)', { weight: 800, size: 14, keepNext: true, after: 6 });
    var n = spec.cols.length;
    var cols = spec.cols.map(function (h, i) { return { label: h, w: i === 0 ? 0.14 : (0.62 - 0.14) / Math.max(1, n - 1) }; });
    cols.push({ label: 'Flag', w: 0.38 });
    doc.table(cols, rows.map(function (r) {
      return { cells: r.cells.concat([r.flag || '']), tint: r.result === 'fault' ? '#fdecec' : r.result === 'check' ? '#fff6e2' : null };
    }), { size: 10.5 });
    return doc;
  }
  var ROUTINE = [
    'Check the site: fence, vegetation cut low, no new obstructions near the sensors.',
    'Clean the radiation shield, rain gauge funnel and bucket, pyranometer dome and solar panel.',
    'Check that the anemometer and wind vane turn freely and the vane points to true north.',
    'Check cables, connectors, grounding and the enclosure seal; look for water, insects or corrosion.',
    'Check the battery voltage, charge controller and logger clock; download stored data.',
    'Compare readings with reference instruments; record any sensor change or calibration in the station log.'
  ];

  // ---- saving files ----

  function toJpeg(cv) {
    return new Promise(function (ok, fail) {
      cv.toBlob(function (b) { b ? ok(b) : fail(new Error('Could not make the image.')); }, 'image/jpeg', 0.92);
    });
  }
  // A PDF whose pages are the A4 page images.
  function makePdf(images) {
    var enc = new TextEncoder(), parts = [], len = 0, offsets = [];
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body) { offsets[n] = len; push(n + ' 0 obj\n'); body.forEach(push); push('\nendobj\n'); }
    var W = 595.28, H = 841.89, n = images.length;
    push('%PDF-1.4\n%âãÏÓ\n');
    obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    obj(2, ['<< /Type /Pages /Count ' + n + ' /Kids [' + images.map(function (_, i) { return (3 + 3 * i) + ' 0 R'; }).join(' ') + '] >>']);
    images.forEach(function (im, i) {
      var p = 3 + 3 * i, cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im' + i + ' Do Q';
      obj(p, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im' + i + ' ' + (p + 2) + ' 0 R >> >> /Contents ' + (p + 1) + ' 0 R >>']);
      obj(p + 1, ['<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream']);
      obj(p + 2, ['<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        im.bytes.length + ' >>\nstream\n', im.bytes, '\nendstream']);
    });
    var xref = len, count = 3 + 3 * n;
    push('xref\n0 ' + count + '\n0000000000 65535 f \n');
    for (var k = 1; k < count; k++) push(('000000000' + offsets[k]).slice(-10) + ' 00000 n \n');
    push('trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function saveFile(blob, name) {
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['400', '600', '700', '800'].map(function (w) { return document.fonts.load(w + ' 16px WNunito').catch(function () {}); }))
      .then(function () {}, function () {});
  }
  // Build the document, then save it as PDF or JPEG. `button` shows progress.
  function exportDoc(makeDoc, baseName, kind, button) {
    var label = button ? button.innerHTML : '';
    if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
    return fontsReady().then(function () {
      var doc = makeDoc(kind);
      if (kind === 'pdf') {
        var canvases = doc.pageCanvases();
        return Promise.all(canvases.map(function (cv) {
          return toJpeg(cv).then(function (b) { return b.arrayBuffer(); }).then(function (buf) { return { bytes: new Uint8Array(buf), w: cv.width, h: cv.height }; });
        })).then(function (imgs) { saveFile(makePdf(imgs), baseName + '.pdf'); });
      }
      var list = doc.longCanvases();
      return list.reduce(function (chain, cv, i) {
        return chain.then(function () { return toJpeg(cv); }).then(function (b) {
          saveFile(b, baseName + (list.length > 1 ? '_page' + (i + 1) : '') + '.jpg');
        });
      }, Promise.resolve());
    }).catch(function (err) {
      alert('Could not make the file: ' + ((err && err.message) || err));
    }).then(function () {
      if (button) { button.disabled = false; button.innerHTML = label; }
    });
  }
  function stationFileName(st, a, extra) {
    var when = a.live === false
      ? dateOf(a.from) + (a.to - a.from > 25 * HOUR ? '_to_' + dateOf(a.to - 1) : '')   // an earlier period: its dates
      : fileStamp(a.to);
    return 'AutoWx_' + fileSafe(st.siteId) + '_' + fileSafe(st.label) + '_' + (extra ? fileSafe(extra) + '_' : '') + 'maintenance_' + when;
  }
  function exportStation(id, kind, button) {
    var st = stationById(id), a = st && maintFor(st);
    if (!a) return;
    exportDoc(function (k) { return stationDoc(st, a, k === 'jpeg'); }, stationFileName(st, a), kind, button);
  }
  function exportInstrument(id, key, kind, button, view) {
    var st = stationById(id), z = state.zoom;
    var a = z && z.id === id && z.key === key ? z.a : st && maintFor(st);
    if (!a) return;
    view = view || (z && z.id === id && z.key === key ? { t0: z.t0, t1: z.t1 } : { t0: a.from, t1: a.to });
    exportDoc(function () { return instrumentDoc(st, a, key, view); }, stationFileName(st, a, compOf(a, key).name), kind, button);
  }

  // All stations in the list: counts, one row per station, then details and actions for those with problems.
  var SHORT = { comms: 'Tx', clock: 'Clk', power: 'Pwr', temp: 'Tmp', rh: 'RH', pressure: 'Prs', wind: 'Wnd', rain: 'Rn', solar: 'Sol' };
  function networkDoc(list, desc) {
    var doc = new Doc('AWS maintenance report');
    var counts = { maintenance: 0, attention: 0, offline: 0, good: 0, pending: 0 };
    list.forEach(function (r) { counts[r.a ? r.a.overall : 'pending']++; });
    var scan = state.scan;
    doc.header('Network maintenance report', 'Automatic weather stations', desc, null, '',
      [scan && scan.finished ? 'Assessed ' + stamp(scan.finished) : 'Report made ' + stamp(Date.now()), QC.windowHours + '-hour data window']);
    doc.stats([['Stations', String(list.length)], ['Maintenance', String(counts.maintenance)], ['Attention', String(counts.attention)],
      ['Offline', String(counts.offline)], ['Good', String(counts.good)], ['Not assessed', String(counts.pending)]]);
    var cols = [{ label: 'Station', w: 0.22, bold: true }, { label: 'ID', w: 0.06, muted: true }, { label: 'Status', w: 0.15 }]
      .concat(COMPONENTS.map(function (c) { return { label: SHORT[c.key], w: 0.035, center: true }; }))
      .concat([{ label: 'Main finding', w: 1 - 0.43 - 0.035 * COMPONENTS.length }]);
    doc.table(cols, list.map(function (r) {
      var a = r.a;
      return [r.st.label, r.st.siteId, { pill: a ? a.overall : 'pending' }]
        .concat(COMPONENTS.map(function (c, i) { return { dot: a ? a.components[i].result : 'na' }; }))
        .concat([a ? (a.top ? a.top.text : 'No problems found') : 'Not assessed yet']);
    }), { size: 10.5 });
    doc.text('Tx data transmission · Clk logger clock · Pwr power supply · Tmp air temperature · RH relative humidity · Prs pressure · ' +
      'Wnd wind · Rn rain gauge · Sol solar radiation.   Green OK · Yellow check · Red fault · Grey not assessed.', { size: 10, color: PAPER.muted, after: 10 });
    var problem = list.filter(function (r) { return r.a && r.a.overall !== 'good'; });
    if (problem.length) {
      doc.text('Details and recommended actions', { weight: 800, size: 15, keepNext: true, after: 6 });
      problem.forEach(function (r) {
        var a = r.a;
        doc.space(4).add({ h: 30, keepNext: true, draw: function (ctx, x, y) {
          ctx.fillStyle = PAPER.text; ctx.font = dfont(14, 800); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          var name = r.st.label + '  ·  ' + r.st.siteId;
          ctx.fillText(name, x, y + 14);
          measureCtx.font = dfont(14, 800);
          pill(ctx, x + measureCtx.measureText(name).width + 12, y + 4, OVERALL[a.overall].label, a.overall, 10.5);
        } });
        var acts = [];
        a.components.forEach(function (c) {
          if (c.result !== 'check' && c.result !== 'fault') return;
          c.findings.filter(function (f) { return f.result !== 'ok'; }).forEach(function (f) {
            doc.text(c.name + ': ' + f.text, { indent: 18, bullet: RES_COLOR[f.result], size: 11.5 });
          });
          c.actions.forEach(function (x) { if (acts.indexOf(x) === -1) acts.push(x); });
        });
        if (acts.length) {
          doc.text('Recommended action', { weight: 800, size: 11.5, keepNext: true, after: 1, indent: 18 });
          acts.forEach(function (x) { doc.text(x, { indent: 34, bullet: '#2f6bff', size: 11 }); });
        }
      });
    }
    doc.space(8).text('Findings marked Check can also be caused by unusual weather; confirm on site before replacing equipment.', { size: 10.5, color: PAPER.muted });
    return doc;
  }
  function exportNetwork(kind, button) {
    var v = maintRows();
    var desc = (state.scope === 'selected' ? 'Selected stations' : 'All stations') +
      (state.maint.filter !== 'all' ? ' · ' + OVERALL[state.maint.filter].label : '') +
      (state.maint.query.trim() ? ' · matching “' + state.maint.query.trim() + '”' : '') + ' · ' + v.shown.length + ' station' + (v.shown.length === 1 ? '' : 's');
    exportDoc(function () { return networkDoc(v.shown, desc); }, 'AutoWx_maintenance_' + (state.scope === 'selected' ? 'selected' : 'all') +
      (state.maint.filter !== 'all' ? '_' + state.maint.filter : '') + '_' + fileStamp(Date.now()), kind, button);
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
    sheet.hidden = !state.picker && !state.tie;
    if (state.tie && !state.picker) sheet.innerHTML = tieView();
    else if (state.picker) {
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
    '.sheet.tie{width:min(480px,100%)}.tie-list{display:flex;flex-direction:column;gap:8px;margin-top:10px;overflow:auto}',
    '.tie-row{display:flex;align-items:center;gap:12px;text-align:left;border:1px solid var(--line);background:var(--card);color:var(--text);',
    'border-radius:12px;padding:10px 14px;cursor:pointer;font:inherit}.tie-row:hover,.tie-row.on{border-color:var(--brand)}',
    '.tie-n{flex:1;display:flex;flex-direction:column}.tie-n .sid{color:var(--muted);font-size:12.5px}.tie-d{font-weight:800;color:var(--brand)}',
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
    // Maintenance downloads and the instrument zoom view
    '.btn:disabled{opacity:.55;cursor:default}.btn.sm{padding:4px 10px;font-size:12.5px;border-radius:8px}.btn.sm .ic{width:15px;height:15px}',
    '.icon-btn:disabled{opacity:.4;cursor:default}.icon-btn.flip .ic{transform:scaleX(-1)}',
    '.rb-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
    '.dl-bar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 14px;margin-bottom:12px}',
    '.dl-l{display:flex;align-items:center;gap:8px}.dl-l .ic{color:var(--brand)}.dl-b{display:flex;gap:8px}.dl-n{color:var(--muted);font-size:12.5px;margin-left:auto}',
    '.zoomable{cursor:zoom-in;border-radius:8px}.zoomable:hover{background:var(--panel)}',
    '.mtools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}',
    '.mt-dl{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}.mt-dl .ic{width:15px;height:15px}',
    '#wn-zoom{position:fixed;inset:0;z-index:11;background:rgba(10,18,35,.5);overflow:auto;padding:3vh 16px}#wn-zoom[hidden]{display:none}',
    '.zsheet{background:var(--card);border-radius:18px;padding:18px 20px 20px;max-width:1180px;margin:0 auto;box-shadow:var(--shadow)}',
    '.zh{display:flex;gap:12px;align-items:flex-start}.zh .tile-ic{margin-top:4px}.zh-t{flex:1;min-width:0}',
    '.zh h2{margin:2px 0;font-size:21px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.zh .sub{color:var(--muted);font-size:13px}',
    '.zh-b{display:flex;gap:8px;align-items:center}',
    '.zbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 8px}',
    '.segs{display:flex;gap:2px;background:var(--glass);padding:3px;border-radius:10px}',
    '.seg{border:0;background:none;padding:5px 11px;border-radius:8px;font-weight:700;cursor:pointer;color:var(--muted)}',
    '.seg.on{background:var(--card);color:var(--text);box-shadow:var(--shadow)}',
    '.zrange{font-weight:700;font-size:13.5px}.zhint{color:var(--muted);font-size:12.5px;margin-left:auto}',
    '.zper{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding:8px 10px;background:var(--panel);border-radius:12px}',
    '.zper-l{display:inline-flex;align-items:center;gap:6px;font-weight:800;margin-right:2px}.zper-l .ic{width:17px;height:17px;color:var(--brand)}',
    '.zper input,.zper select{font:inherit;font-weight:600;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)}',
    '.btn.on{background:#2f6bff;border-color:#2f6bff;color:#fff}.zper-n{color:var(--muted);font-size:12.5px;margin-left:auto}',
    '.zload{color:var(--brand);font-weight:700;font-size:13px}.zerr{color:var(--danger);font-weight:700;font-size:13px}',
    '.zchart{border:1px solid var(--line);border-radius:12px;overflow:hidden}.zchart canvas{display:block;touch-action:pan-y;cursor:crosshair}',
    '.zlegend{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin:8px 2px}',
    '.zlegend span{display:inline-flex;align-items:center;gap:6px}.zlegend i{width:14px;height:4px;border-radius:2px;display:inline-block}',
    '.zlegend i.sq{width:12px;height:12px;border-radius:3px}.zlegend i.gap{background:rgba(138,150,168,.35)}.zlegend i.flagband{background:rgba(229,72,77,.3)}',
    '.zlegend i.night{background:rgba(91,107,140,.25)}.zlegend i.ring{width:11px;height:11px;border-radius:50%;border:2px solid ' + C.red + ';background:none}',
    '.zstats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin:10px 0 14px}',
    '.zst{background:var(--panel);border-radius:10px;padding:8px 12px}.zst span{display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}',
    '.zst b{font-size:16px}',
    '.zgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px;align-items:start}',
    '.ztable{border:1px solid var(--line);border-radius:12px;overflow:hidden}.ztable-h{font-weight:800;padding:8px 12px;background:var(--panel);font-size:13px}',
    '.ztable-s{max-height:340px;overflow:auto}.ztab{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}',
    '.ztab th{position:sticky;top:0;background:var(--card);text-align:left;padding:6px 10px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--line)}',
    '.ztab td{padding:5px 10px;border-bottom:1px solid var(--line);white-space:nowrap}.ztab td.zf{white-space:normal;font-weight:700}',
    '.ztab tr.check td{background:var(--warn-bg)}.ztab tr.fault td{background:var(--danger-bg)}.ztab tr.check td.zf{color:var(--warn)}.ztab tr.fault td.zf{color:var(--danger)}',
    '@media (max-width:820px){.zgrid{grid-template-columns:1fr}.zhint{display:none}.dl-n{margin-left:0}}',
    '@media (max-width:600px){.zh{flex-wrap:wrap}.zh-t{flex:1 1 calc(100% - 60px)}.zh-b{width:100%}.zh-b .icon-btn{margin-left:auto}#wn-zoom{padding:8px}.zsheet{padding:14px}}',
    '@media print{.top,.report-bar,.no-print,#wn-zoom{display:none!important}body{background:#fff!important}',
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
    '<main id="wn-main"></main><div id="wn-picker" hidden></div><div id="wn-zoom" hidden></div>';

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
      state.view = el.getAttribute('data-view'); state.maint.open = null; closeZoom(); save(); render(); return;
    }
    if ((el = t.closest('[data-act]'))) {
      var act = el.getAttribute('data-act');
      if (act === 'pick') { state.nearOnly = false; state.tie = null; state.picker = true; state.pickerQuery = ''; render(); var q = document.getElementById('wn-pick-q'); if (q) q.focus(); }
      else if (act === 'close-picker') { state.picker = false; render(); loadShown(); }
      else if (act === 'locate') { state.view = 'weather'; state.nearOnly = true; state.fit = false; save(); locate(true); window.scrollTo(0, 0); }
      else if (act === 'near-off') { state.nearOnly = false; render(); loadShown(); }
      else if (act === 'tie-close') { state.tie = null; state.nearOnly = true; render(); loadShown(); }
      else if (act === 'refresh') refresh();
      else if (act === 'maint-scan') scanAll();
      else if (act === 'save-group') { var nm = document.getElementById('wn-group-name'); if (saveGroup(nm && nm.value)) render(); }
      else if (act === 'maint-stop') { if (state.scan) state.scan.running = false; render(); }
      else if (act === 'maint-back') { state.maint.open = null; closeZoom(); render(); window.scrollTo(0, 0); }
      else if (act === 'rep-pdf' || act === 'rep-jpeg') exportStation(state.maint.open, act === 'rep-pdf' ? 'pdf' : 'jpeg', el);
      else if (act === 'net-pdf' || act === 'net-jpeg') exportNetwork(act === 'net-pdf' ? 'pdf' : 'jpeg', el);
      else if (act === 'zoom-close') closeZoom();
      else if (act === 'zoom-latest' && state.zoom) zoomLatest();
      else if ((act === 'zoom-pdf' || act === 'zoom-jpeg') && state.zoom) exportInstrument(state.zoom.id, state.zoom.key, act === 'zoom-pdf' ? 'pdf' : 'jpeg', el);
      else if (act === 'maint-print') window.print();
      else if (act === 'fit') { state.fit = !state.fit; state.view = 'weather'; save(); render(); window.scrollTo(0, 0); }
      return;
    }
    if ((el = t.closest('[data-zoom]'))) { openZoom(state.maint.open, el.getAttribute('data-zoom')); return; }
    if ((el = t.closest('[data-ipdf]'))) { exportInstrument(state.maint.open, el.getAttribute('data-ipdf'), 'pdf', el); return; }
    if ((el = t.closest('[data-ijpeg]'))) { exportInstrument(state.maint.open, el.getAttribute('data-ijpeg'), 'jpeg', el); return; }
    if ((el = t.closest('[data-zday]')) && state.zoom) { zoomStepDay(+el.getAttribute('data-zday')); return; }
    if ((el = t.closest('[data-zrange]')) && state.zoom) {
      var za = state.zoom.a, zv = el.getAttribute('data-zrange'), zh = zv === 'all' ? za.to - za.from : +zv * HOUR;
      setZoomRange(za.to - zh, za.to); return;
    }
    if ((el = t.closest('[data-zpan]')) && state.zoom) {
      var zs = state.zoom.t1 - state.zoom.t0, zd = +el.getAttribute('data-zpan') * zs / 2;
      setZoomRange(state.zoom.t0 + zd, state.zoom.t1 + zd); return;
    }
    if (t.id === 'wn-zoom') { closeZoom(); return; }
    if ((el = t.closest('[data-tie]'))) { chooseTie(el.getAttribute('data-tie')); return; }
    if ((el = t.closest('[data-group-load]'))) { state.nearOnly = false; loadGroup(el.getAttribute('data-group-load')); render(); loadShown(); return; }
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
      state.nearOnly = false; state.view = 'weather'; save(); render(); loadShown(); window.scrollTo(0, 0); return;
    }
    if ((el = t.closest('[data-filter]'))) { state.board.filter = el.getAttribute('data-filter'); render(); return; }
    if ((el = t.closest('[data-sort]'))) {
      var k = el.getAttribute('data-sort'), s = state.board.sort;
      state.board.sort = s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 };
      render(); return;
    }
    if (t.id === 'wn-picker') {
      if (state.tie) { state.tie = null; render(); loadShown(); return; }
      state.picker = false; render(); loadShown();
    }
  });

  document.body.addEventListener('change', function (e) {
    if (state.zoom && (e.target.id === 'wn-zdate' || e.target.id === 'wn-zdays')) {
      var zdate = document.getElementById('wn-zdate').value, zdays = +document.getElementById('wn-zdays').value;
      if (zdate) loadZoomPeriod(zdate, zdays);
      return;
    }
    if (e.target.id === 'wn-group') {
      if (e.target.value) { state.nearOnly = false; loadGroup(e.target.value); render(); loadShown(); window.scrollTo(0, 0); }
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
    if (e.key === 'Escape' && state.zoom) { closeZoom(); return; }
    if (e.key === 'Escape' && state.tie) { state.tie = null; render(); loadShown(); return; }
    if (e.key === 'Escape' && state.picker) { state.picker = false; render(); loadShown(); }
    if (e.key === 'Enter' && e.target.id === 'wn-group-name') { if (saveGroup(e.target.value)) render(); }
  });

  // Re-flow the overview grid when the window changes shape.
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state.fit) render(); if (state.zoom) drawZoom(); }, 150);
  });

  // Keep "updated … ago" fresh between refreshes.
  setInterval(function () { if (!state.picker) render(); }, 60000);

  window.__autowx = { refresh: refresh, state: state, config: CONFIG };

  render();
  refresh().then(function () { locate(); });
})();
