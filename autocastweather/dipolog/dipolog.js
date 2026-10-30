// Dipolog localized 24-hour forecast post builder (bookmarklet).
// English + Cebuano text from PAGASA Mindanao PRSD's regional forecast, astronomy for Dipolog City.
(async function () {
  var CFG = {
    area: 'Zamboanga Peninsula and Misamis Occidental',
    city: 'DIPOLOG CITY',
    lat: 8.5993, lon: 123.3436, // PAGASA Dipolog synoptic station
    // Which part of the Mindanao forecast covers our area, best match first.
    match: [
      /zamboanga|misamis occidental|western mindanao/i,
      /northern mindanao/i,
      /rest of mindanao|^mindanao|whole mindanao|rest of the country|whole country/i
    ],
    gif: 'https://src.meteopilipinas.gov.ph/repo/mtsat-colored/24hour/latest-him-colored.gif',
    regional: 'https://pagasa.dost.gov.ph/regional-forecast/minprsd',
    weather: 'https://pagasa.dost.gov.ph/weather'
  };
  var ID = 'dip-fc-panel';
  var old = document.getElementById(ID);
  if (old) old.remove();
  if (!/(^|\.)pagasa\.dost\.gov\.ph$/.test(location.hostname)) {
    if (confirm('This bookmark works on the PAGASA website.\n\nOpen pagasa.dost.gov.ph now? Then click the bookmark again.')) location.href = CFG.weather;
    return;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var PHT = 8 * 3600000;
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function ph(ms) { return new Date(ms + PHT); }
  function dayNo(ms) { return Math.floor((ms + PHT) / 86400000); }
  function clock(ms) {
    var d = ph(Math.round(ms / 60000) * 60000), h = d.getUTCHours(), m = d.getUTCMinutes(), h12 = h % 12 || 12;
    return (h12 < 10 ? '0' : '') + h12 + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
  }
  // Facebook has no bold, so use Unicode bold letters like the original posts.
  function bold(s) {
    return Array.from(s).map(function (ch) {
      var c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D400 + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D41A + c - 97);
      if (c >= 48 && c <= 57) return String.fromCodePoint(0x1D7CE + c - 48);
      return ch;
    }).join('');
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- English → Cebuano (PAGASA forecast wording) ----
  var untranslated = [];
  var SKY = [
    [/^partly cloudy (skies )?to (at times )?cloudy( skies)?$/, 'panalagsang pagdag-um ngadto sa mapanganuron nga kalangitan'],
    [/^partly cloudy skies$/, 'panalagsang pagdag-um nga kalangitan'],
    [/^mostly cloudy skies$/, 'kasagarang mapanganuron nga kalangitan'],
    [/^cloudy skies$/, 'mapanganuron nga kalangitan'],
    [/^(fair weather|sunny|clear skies)$/, 'maayong panahon']
  ];
  var QUANT = { isolated: 'pat-ak pat-ak nga', scattered: 'katag-katag nga', widespread: 'kaylap nga', occasional: 'panagsang', 'at times': 'usahay' };
  var INTENS = {
    'light to moderate': 'hinay ngadto sa kasarangan nga', 'moderate to heavy': 'kasarangan ngadto sa kusog nga',
    'moderate to at times heavy': 'kasarangan ngadto sa usahay kusog nga', 'moderate to occasionally heavy': 'kasarangan ngadto sa usahay kusog nga',
    'heavy to intense': 'kusog ngadto sa grabe nga', light: 'hinay nga', moderate: 'kasarangan nga', heavy: 'kusog nga', intense: 'grabe nga'
  };
  var RAIN_TYPES = [
    [/^(rainshowers|rains?) or thunderstorms$/, 'pag-ulan, kilat o pagpanalugdog'],
    [/^(rainshowers|rains?) and thunderstorms$/, 'pag-ulan, kilat ug pagpanalugdog'],
    [/^(rainshowers|rains?)$/, 'pag-ulan'],
    [/^thunderstorms$/, 'kilat ug pagpanalugdog']
  ];
  function rainPart(p) {
    var m = p.match(/^(isolated|scattered|widespread|occasional|at times)?\s*(light to moderate|moderate to (?:at times |occasionally )?heavy|heavy to intense|light|moderate|heavy|intense)?\s*(.*)$/);
    var type = null;
    for (var i = 0; i < RAIN_TYPES.length; i++) if (RAIN_TYPES[i][0].test(m[3])) { type = RAIN_TYPES[i][1]; break; }
    if (!type) return null;
    return [m[1] && QUANT[m[1]], m[2] && INTENS[m[2]], type].filter(Boolean).join(' ');
  }
  function rain(en) {
    var p = en.toLowerCase().replace(/rain showers/g, 'rainshowers').replace(/thunderstorm\b/g, 'thunderstorms').trim();
    var whole = rainPart(p);
    if (whole) return whole;
    // e.g. "scattered rains and isolated thunderstorms"
    var parts = p.split(/ (and|or) /);
    var out = [];
    for (var i = 0; i < parts.length; i += 2) {
      var t = rainPart(parts[i]);
      if (!t) { untranslated.push(en); return en; }
      out.push(t);
      if (parts[i + 1]) out.push(parts[i + 1] === 'and' ? 'ug' : 'o');
    }
    return out.join(' ');
  }
  function sky(en) {
    var p = en.toLowerCase().trim();
    for (var i = 0; i < SKY.length; i++) if (SKY[i][0].test(p)) return SKY[i][1];
    untranslated.push(en);
    return en;
  }
  var STRENGTH = { light: 'hinay', moderate: 'kasarangan', strong: 'kusog', 'at times strong': 'usahay kusog', gale: 'kusog kaayo', 'gale-force': 'kusog kaayo' };
  var SEA = { calm: 'kalma', slight: 'hapsay', moderate: 'kasarangan', rough: 'bagis', 'at times rough': 'usahay bagis', 'very rough': 'bagis kaayo', high: 'taas', 'very high': 'taas kaayo' };
  var DIR = {
    north: 'Amihanan', northeast: 'Amihanang Silangan', east: 'Silangan', southeast: 'Habagatang Silangan',
    south: 'Habagatan', southwest: 'Habagatang Kanluran', west: 'Kanluran', northwest: 'Amihanang Kanluran', variable: 'lainlaing'
  };
  function range(en, table) {
    return en.toLowerCase().split(/ to /).map(function (w) {
      w = w.trim();
      if (table[w]) return table[w];
      untranslated.push(w);
      return w;
    }).join(' ngadto sa ');
  }
  function linker(w) { return /n$/.test(w) ? w + 'g' : w; } // Silangan → Silangang direksyon
  function windCeb(en) {
    var m = en.match(/^(.+?) winds? (?:coming )?from the (.+?)(?: directions?)?(?: with (.+?) seas?(?: \((.+?)\))?)?\.?$/i);
    if (!m) { untranslated.push(en); return en; }
    var dirs = m[2].split(/ to /i).map(function (d) { var k = d.trim().toLowerCase().replace(/[-\s]/g, ''); if (!DIR[k]) untranslated.push(d); return DIR[k] || d; });
    dirs[dirs.length - 1] = linker(dirs[dirs.length - 1]);
    var s = cap(range(m[1], STRENGTH)) + ' ang hangin gikan sa ' + dirs.join(' ngadto sa ') + ' direksyon';
    if (m[3]) s += ' og ang kadagatan ' + range(m[3], SEA) + ' ang pagbalud' + (m[4] ? ' (' + m[4] + ')' : '');
    return s + '.';
  }
  function impactCeb(en) {
    var s = en.replace(/\.$/, '');
    if (/^no significant impact/i.test(s)) return '';
    var m = s.match(/^possible (flash ?floods?|flooding)(?: or|,| and) landslides?(?: (during|due to) (.+))?$/i);
    if (!m) { untranslated.push(en); return en; }
    var out = 'Posible ang mga pagbaha o pagdahili sa yuta';
    if (m[3]) out += ' tungod sa ' + (/severe thunderstorms?/i.test(m[3]) ? 'mga severe thunderstorms' : rain(m[3]));
    return out + '.';
  }

  // ---- panel ----
  var css = '#' + ID + '{position:fixed;z-index:2147483647;top:12px;right:12px;width:min(580px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1c1f24;border:1px solid #c9d1db;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px}'
    + '#' + ID + ' *{box-sizing:border-box}'
    + '#' + ID + ' h2{margin:0 0 4px;font-size:16px;font-weight:600}'
    + '#' + ID + ' .sub{color:#5b6573;font-size:12px;margin-bottom:10px}'
    + '#' + ID + ' textarea{width:100%;height:380px;font-size:13px;line-height:1.45;font-family:inherit;padding:10px;border:1px solid #c9d1db;border-radius:8px;resize:vertical;color:#1c1f24;background:#fbfcfd}'
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
    + '<h2>Dipolog Localized 24-Hour Forecast</h2><div class="sub">Reading PAGASA…</div><div class="msgs"></div>'
    + '<textarea spellcheck="false"></textarea>'
    + '<div class="bar"><button class="copy">Copy text</button><a class="btn ghost" target="_blank" rel="noopener">Open GIF to save</a></div>'
    + '<div class="sub">Latest Himawari IR1 animation, if you want to attach it. Open it, then right-click → <b>Save Image As…</b></div>'
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
    var res = await Promise.all([fetch(CFG.regional).then(function (r) { return r.text(); }), fetch(CFG.weather).then(function (r) { return r.text(); })]);
    var html = res[0];
    var wm = html.match(/"weather":\{"issued_date":"([^"]+)","valid_date":"([^"]+)","condition":"((?:[^"\\]|\\.)*)"/);
    if (!wm) throw new Error('Could not find the Mindanao regional forecast on ' + CFG.regional);
    var issue = Date.parse(wm[1]);
    var cond = clean(JSON.parse('"' + wm[3] + '"'));
    var age = (Date.now() - issue) / 3600000;
    if (age > 13) note('The Mindanao forecast was issued ' + Math.round(age) + ' hours ago. Check that a newer one is not due.');

    // Split the forecast into area blocks ("X will experience ...") and pick ours.
    var sentences = cond.split(/(?<=\.)\s+(?=[A-Z])/);
    var blocks = [], winds = [];
    sentences.forEach(function (s) {
      if (/ will (experience|have)/i.test(s) || !blocks.length) blocks.push({ head: s, rest: [] });
      else blocks[blocks.length - 1].rest.push(s);
      if (/\bwinds?\b/i.test(s)) winds.push(s);
    });
    var block = null;
    for (var i = 0; i < CFG.match.length && !block; i++) {
      block = blocks.find(function (b) { return CFG.match[i].test(b.head.split(/ will /i)[0]); });
    }
    if (!block) block = blocks[blocks.length - 1];
    if (blocks.length > 1) note('PAGASA split Mindanao into ' + blocks.length + ' areas; used the one for “' + block.head.split(/ will /i)[0] + '”.');
    var wx = block.head.match(/ will (?:experience|have) (.+?)(?: due to (?:the )?(.+?))?\.$/i);
    if (!wx) throw new Error('Could not read the forecast sentence: ' + block.head);
    var cause = wx[2] || '';
    var skyRain = wx[1].split(/ with /i);
    var impacts = block.rest.filter(function (s) { return !/\bwinds?\b/i.test(s); });
    var wind = block.rest.filter(function (s) { return /\bwinds?\b/i.test(s); })[0] || winds[winds.length - 1] || '';

    var en = [CFG.area + ' will experience ' + wx[1] + (cause ? ' due to ' + bold(cause) : '') + '.']
      .concat(impacts.filter(function (s) { return !/^no significant impact/i.test(s); }), wind ? [wind] : []).join(' ');
    var ceb = ['Ang ' + CFG.area.replace(/ and /g, ' ug ') + ' makasinati sa ' + sky(skyRain[0])
      + (skyRain[1] ? ' inubanan sa ' + rain(skyRain[1]) : '') + (cause ? ' tungod sa ' + bold(cause) : '') + '.']
      .concat(impacts.map(impactCeb).filter(Boolean), wind ? [windCeb(wind)] : []).join(' ');

    // Synopsis: national synopsis sentences about Mindanao, else the regional cause.
    var wdoc = new DOMParser().parseFromString(res[1], 'text/html');
    var synHead = Array.prototype.find.call(wdoc.querySelectorAll('.panel-heading'), function (e) { return /synopsis/i.test(e.textContent); });
    var natSyn = synHead ? clean((synHead.parentElement.querySelector('.panel-body') || synHead.nextElementSibling || {}).textContent) : '';
    var synParts = natSyn.split(/(?<=\.)\s+(?=[A-Z])/).filter(function (s) { return /mindanao|whole country|entire country|whole archipelago/i.test(s); });
    var synopsis;
    if (synParts.length) {
      synopsis = synParts.map(function (s) {
        return s.replace(/^(.+?)( affecting| over| extending| bringing)/, function (_, a, b) { return bold(a) + b; });
      }).join(' ');
    } else if (cause) {
      synopsis = bold(cause) + ' affecting the Mindanao.';
    } else {
      synopsis = '';
      note('No weather system for Mindanao found — please type the synopsis.', true);
    }

    // Astronomy over Dipolog, from the issue time, earliest first in each pair.
    function when(ms) {
      var dd = dayNo(ms) - dayNo(issue);
      return dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : 'on ' + MONTHS[ph(ms).getUTCMonth()] + ' ' + ph(ms).getUTCDate();
    }
    var sr = Astro.next('sun', 'rise', issue, CFG.lat, CFG.lon);
    var ss = Astro.next('sun', 'set', issue, CFG.lat, CFG.lon);
    var mr = Astro.next('moon', 'rise', issue, CFG.lat, CFG.lon);
    var ms = Astro.next('moon', 'set', mr || issue, CFG.lat, CFG.lon);
    var astro = [['Sunrise', sr], ['Sunset', ss]].sort(function (a, b) { return (a[1] || 9e15) - (b[1] || 9e15); })
      .concat([['Moonrise', mr], ['Moonset', ms]].sort(function (a, b) { return (a[1] || 9e15) - (b[1] || 9e15); }));
    // Line the times up with spaces, sized for Facebook's font like the original post.
    var cv = document.createElement('canvas').getContext('2d');
    cv.font = '15px Helvetica, Arial, sans-serif';
    var sp = cv.measureText(' ').width, target = cv.measureText('Sunset today:').width + 31 * sp;
    var astroLines = astro.map(function (a) {
      var label = a[0] + ' ' + (a[1] == null ? '' : when(a[1])) + ':';
      var n = Math.max(2, Math.round((target - cv.measureText(label).width) / sp));
      return label + ' '.repeat(n) + (a[1] == null ? '—' : clock(a[1]));
    });

    var d = ph(issue), hh = d.getUTCHours(), mm = d.getUTCMinutes();
    var issueStr = (hh % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (hh < 12 ? 'AM' : 'PM')
      + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();

    ta.value = [
      'LOCALIZED 24-HOUR PUBLIC WEATHER FORECAST',
      'For ' + bold(CFG.area),
      issueStr,
      '',
      bold('SYNOPSIS:') + ' ',
      synopsis,
      '',
      bold('FORECAST:'),
      en,
      '',
      bold('KAUGALINGONG DAYALEKTO:'),
      ceb,
      '',
      bold('OVER ' + CFG.city + ':'),
      // 5 AM post gives the forecast; 5 PM post gives the computed value from local records.
      hh < 12 ? 'Highest Heat Index forecast today: __°C' : 'Highest Computed Heat Index today: __°C at __',
      '',
      bold('ASTRONOMICAL INFORMATION OVER ' + CFG.city + ':')
    ].concat(astroLines).join('\n');

    note(hh < 12 ? 'Fill in today’s highest heat index forecast (the “__” blank).' : 'Fill in the heat index from your local records (the “__” blanks).');
    if (untranslated.length) note('Not translated to Cebuano (left in English, please check): ' + untranslated.join('; '), true);
    sub.textContent = 'Based on PAGASA Mindanao forecast issued ' + issueStr + '. Edit below if needed, then copy.';
  } catch (e) {
    sub.textContent = 'Something went wrong.';
    note(String(e && e.message || e), true);
  }
})();
