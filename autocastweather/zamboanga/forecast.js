// Zamboanga 24-hour forecast post builder (bookmarklet).
// Reads PAGASA pages, writes the Facebook post text, shows the latest Himawari IR1 animation.
(async function () {
  var CFG = {
    city: 'Zamboanga City',
    area: 'Zamboanga Peninsula, Basilan, Sulu, and Tawi-Tawi',
    lat: 6.9214, lon: 122.0790,
    // Rows of PAGASA's tables that cover our area, best match first.
    match: [
      /zamboanga|basilan|sulu|tawi|barmm|bangsamoro/i,
      /^(?!.*(north|east|south|central)\w* (sections? of )?mindanao).*mindanao/i,
      /rest of the country|whole country|entire country/i
    ],
    gif: 'https://src.meteopilipinas.gov.ph/repo/mtsat-colored/24hour/latest-him-colored.gif',
    weather: 'https://pagasa.dost.gov.ph/weather',
    cities: 'https://pagasa.dost.gov.ph/weather/weather-outlook-selected-philippine-cities'
  };
  var ID = 'zam-fc-panel';
  var old = document.getElementById(ID);
  if (old) old.remove();

  if (!/(^|\.)pagasa\.dost\.gov\.ph$/.test(location.hostname)) {
    if (confirm('This bookmark works on the PAGASA website.\n\nOpen pagasa.dost.gov.ph now? Then click the bookmark again.')) location.href = CFG.weather;
    return;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var PHT = 8 * 3600000;
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function ph(ms) { return new Date(ms + PHT); } // read with getUTC* to get Philippine time
  function dayNo(ms) { return Math.floor((ms + PHT) / 86400000); }
  function clock(ms, pad) {
    var d = ph(Math.round(ms / 60000) * 60000), h = d.getUTCHours(), m = d.getUTCMinutes();
    var h12 = h % 12 || 12;
    return (pad && h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
  }
  async function get(url) {
    var r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(url + ' returned ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }
  function rows(table) {
    return Array.prototype.map.call(table.rows, function (r) {
      return Array.prototype.map.call(r.cells, function (c) { return clean(c.textContent); });
    });
  }
  function tableAfter(doc, heading) {
    var h = Array.prototype.find.call(doc.querySelectorAll('h3,h4'), function (e) { return clean(e.textContent).toLowerCase() === heading.toLowerCase(); });
    if (!h) return null;
    for (var el = h; el; el = el.parentElement) {
      var t = el.querySelector('table');
      if (t) return t;
    }
    return null;
  }
  function pickRow(table) {
    var body = rows(table).slice(1).filter(function (r) { return r.length >= 4; });
    for (var i = 0; i < CFG.match.length; i++) {
      for (var j = 0; j < body.length; j++) if (CFG.match[i].test(body[j][0])) return body[j];
    }
    return body[body.length - 1];
  }

  // ---- panel ----
  var css = '#' + ID + '{position:fixed;z-index:2147483647;top:12px;right:12px;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1c1f24;border:1px solid #c9d1db;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px}'
    + '#' + ID + ' *{box-sizing:border-box}'
    + '#' + ID + ' h2{margin:0 0 4px;font-size:16px;font-weight:600}'
    + '#' + ID + ' .sub{color:#5b6573;font-size:12px;margin-bottom:10px}'
    + '#' + ID + ' textarea{width:100%;height:330px;font:13px/1.45 inherit;font-family:inherit;padding:10px;border:1px solid #c9d1db;border-radius:8px;resize:vertical;color:#1c1f24;background:#fbfcfd}'
    + '#' + ID + ' .bar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}'
    + '#' + ID + ' button,#' + ID + ' a.btn{font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;border:1px solid #0b5cad;background:#0b5cad;color:#fff;cursor:pointer;text-decoration:none}'
    + '#' + ID + ' .ghost{background:#fff!important;color:#0b5cad!important}'
    + '#' + ID + ' .x{position:absolute;top:10px;right:10px;background:none!important;border:0!important;color:#5b6573!important;font-size:20px;padding:2px 8px}'
    + '#' + ID + ' img{width:100%;border-radius:8px;border:1px solid #c9d1db;display:block}'
    + '#' + ID + ' .warn{background:#fff6e0;border:1px solid #f0c36d;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px}'
    + '#' + ID + ' .err{background:#fdecec;border-color:#e59a9a}';
  var box = document.createElement('div');
  box.id = ID;
  box.innerHTML = '<style>' + css + '</style><button class="x" title="Close">×</button>'
    + '<h2>24-Hour Public Weather Forecast</h2><div class="sub">Reading PAGASA…</div><div class="msgs"></div>'
    + '<textarea spellcheck="false"></textarea>'
    + '<div class="bar"><button class="copy">Copy text</button><a class="btn ghost" target="_blank" rel="noopener">Open GIF to save</a></div>'
    + '<div class="sub">Latest Himawari IR1 animation. Open it, then right-click → <b>Save Image As…</b> and attach the file to your post.</div>'
    + '<img alt="Latest Himawari IR1 animation">';
  document.body.appendChild(box);
  var ta = box.querySelector('textarea'), sub = box.querySelector('.sub'), msgs = box.querySelector('.msgs');
  var gifUrl = CFG.gif + '?t=' + Date.now();
  box.querySelector('img').src = gifUrl;
  box.querySelector('a.btn').href = gifUrl;
  box.querySelector('.x').onclick = function () { box.remove(); };
  box.querySelector('.copy').onclick = async function () {
    var b = this;
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
    b.textContent = 'Copied ✓';
    setTimeout(function () { b.textContent = 'Copy text'; }, 1800);
  };
  function note(text, isErr) {
    var d = document.createElement('div');
    d.className = 'warn' + (isErr ? ' err' : '');
    d.textContent = text;
    msgs.appendChild(d);
  }

  try {
    var docs = await Promise.all([get(CFG.weather), get(CFG.cities)]);
    var w = docs[0], cities = docs[1];

    // Issue time, e.g. "Issued at: 4:00 PM, 28 October 2026"
    var issueText = clean((w.querySelector('.issue') || {}).textContent);
    var im = issueText.match(/(\d{1,2}):(\d{2})\s*([AP]M),?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (!im) throw new Error('Could not read the issue time on the Daily Weather page.');
    var hr = (+im[1]) % 12 + (/pm/i.test(im[3]) ? 12 : 0);
    var mon = MONTHS.findIndex(function (m) { return m.toLowerCase() === im[5].toLowerCase(); });
    var issue = Date.UTC(+im[6], mon, +im[4], hr, +im[2]) - PHT;
    var issueD = ph(issue);
    var dateLong = MONTHS[issueD.getUTCMonth()] + ' ' + issueD.getUTCDate() + ', ' + issueD.getUTCFullYear() + ' (' + DAYS[issueD.getUTCDay()] + ')';
    var age = (Date.now() - issue) / 3600000;
    if (age > 13) note('PAGASA’s latest forecast was issued ' + Math.round(age) + ' hours ago. Check that a newer one is not due.');

    // Synopsis
    var synHead = Array.prototype.find.call(w.querySelectorAll('.panel-heading'), function (e) { return /synopsis/i.test(e.textContent); });
    var synopsis = synHead ? clean((synHead.parentElement.querySelector('.panel-body') || synHead.nextElementSibling || {}).textContent) : '';
    if (!synopsis) note('Synopsis not found — please type it in.', true);

    // Local forecast
    var fcT = tableAfter(w, 'Forecast Weather Conditions');
    var local = '';
    if (fcT) {
      var r = pickRow(fcT); // Place, Weather Condition, Caused By, Impacts
      local = r[1] + ' will prevail over ' + CFG.area + ' due to the ' + r[2] + '.';
      if (r[3] && !/^no significant impact/i.test(r[3])) local += ' ' + r[3].replace(/\.$/, '');
      if (!CFG.match[0].test(r[0])) note('Local forecast and winds taken from the row for “' + r[0] + '”.');
    } else note('Forecast Weather Conditions table not found.', true);

    // Wind and coastal waters
    var wT = tableAfter(w, 'Forecast Wind and Coastal Water Conditions');
    var wind = '';
    if (wT) {
      var wr = pickRow(wT); // Place, Speed, Direction, Coastal Water
      wind = 'Winds will be ' + wr[1] + ' from the ' + wr[2] + (/ to /i.test(wr[2]) ? ' directions' : ' direction')
        + ', and the Coastal waters will be ' + wr[3] + '.';
    } else note('Wind and Coastal Water table not found.', true);

    // Temperature from the Selected Cities outlook. Morning issue → today; afternoon issue → tomorrow.
    var forTomorrow = issueD.getUTCHours() >= 12;
    var tDay = ph(issue + (forTomorrow ? 86400000 : 0));
    var tKey = MONTHS[tDay.getUTCMonth()] + ' ' + (tDay.getUTCDate() < 10 ? '0' : '') + tDay.getUTCDate() + ', ' + tDay.getUTCFullYear();
    var panel = Array.prototype.find.call(cities.querySelectorAll('.panel'), function (p) {
      var t = p.querySelector('.panel-title');
      return t && clean(t.textContent) === CFG.city;
    });
    var temp = '';
    if (panel) {
      var tr = Array.prototype.find.call(panel.querySelectorAll('tr'), function (x) {
        return x.cells.length === 2 && clean(x.cells[0].textContent).indexOf(tKey) >= 0;
      });
      var nums = tr && clean(tr.cells[1].textContent).match(/(\d+)\s*°C\s*(\d+)\s*°C/);
      if (nums) {
        var lo = Math.min(+nums[1], +nums[2]), hi = Math.max(+nums[1], +nums[2]);
        temp = 'The forecast air temperature range for ' + (forTomorrow ? 'tomorrow' : 'today') + ' is ' + lo + '°C to ' + hi + '°C in ' + CFG.city + '.';
      }
    }
    if (!temp) note('Temperature for ' + CFG.city + ' on ' + tKey + ' not found — please type it in.', true);

    // Astronomy, calculated for the city
    function when(ms) {
      if (ms == null) return '—';
      var dd = dayNo(ms) - dayNo(issue);
      return (dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : 'on ' + MONTHS[ph(ms).getUTCMonth()] + ' ' + ph(ms).getUTCDate()) + ': ' + clock(ms, true);
    }
    var sr = Astro.next('sun', 'rise', issue, CFG.lat, CFG.lon);
    var ss = Astro.next('sun', 'set', issue, CFG.lat, CFG.lon);
    var mr = Astro.next('moon', 'rise', issue, CFG.lat, CFG.lon);
    var ms = Astro.next('moon', 'set', mr || issue, CFG.lat, CFG.lon);

    function inOrder(a, b) { // rise/set pair, earliest first
      var p = (b[1] != null && (a[1] == null || b[1] < a[1])) ? [b, a] : [a, b];
      return p.map(function (x) { return x[0] + when(x[1]); });
    }
    var issueLabel =dayNo(issue) === dayNo(Date.now()) ? ' today' : '';
    ta.value = [
      '24-HOUR PUBLIC WEATHER FORECAST',
      'Issued at: ' + clock(issue) + issueLabel + ', ' + dateLong,
      'Valid until: ' + clock(issue) + ' tomorrow',
      'SYNOPSIS: ',
      synopsis,
      'LOCAL FORECAST:',
      local,
      'FORECAST WIND AND COASTAL WATER CONDITIONS:',
      wind,
      'TEMPERATURE:',
      temp,
      'ASTRONOMICAL INFORMATION:'
    ].concat(inOrder(['🌄Sunrise ', sr], ['🌅Sunset ', ss]), inOrder(['🌇Moonrise ', mr], ['🌆Moonset ', ms])).join('\n');
    sub.textContent = 'Based on PAGASA forecast issued ' + clock(issue) + ', ' + dateLong + '. Edit below if needed, then copy.';
  } catch (e) {
    sub.textContent = 'Something went wrong.';
    note(String(e && e.message || e), true);
  }
})();
