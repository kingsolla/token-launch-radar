/* Token Radar dashboard v2 (model radar-3). Static, no network: figures come from window.RADAR in data.js. */
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = 1; });

  var state = { q: '', category: 'all', chain: 'all', wl: false, score50: false, verdict: 'all', deposit: 1000, sort: 'implied', dir: -1, view: 'board', slug: null, saq: '' };

  var HAS_FARM = DATA.rows.length > 0 && DATA.rows[0].farm_net_usd !== undefined;
  var HAS_METHOD = !!DATA.method;
  var SET_ASIDE = Array.isArray(DATA.set_aside) ? DATA.set_aside : [];
  var LIVE_COMPS = Array.isArray(DATA.live_comps) ? DATA.live_comps : (DATA.live || []);

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtSigned(n, dec) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var d = dec === undefined ? 2 : dec;
    return (n < 0 ? '−$' : '+$') + Math.abs(n).toFixed(d);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function fmtMult(n) { return '×' + n.toFixed(2); }
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 2e8) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasNote(chain) {
    var c = chain.toLowerCase();
    if (c === 'ethereum') return 'about $3 to $8 of gas per transaction on Ethereum';
    if (c === 'solana') return 'about $0.01 of gas per transaction on Solana';
    if (c === 'bitcoin') return 'about $1 to $3 of fees per transaction on Bitcoin';
    if (['base', 'arbitrum', 'optimism', 'polygon', 'ink', 'mode', 'blast', 'zksync', 'linea', 'scroll', 'world chain'].indexOf(c) >= 0) {
      return 'under $0.10 of gas per transaction on ' + chain;
    }
    return 'about $0.50 of gas per transaction on ' + chain;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral, borrow a small amount against it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' — half USDC, half the paired asset — and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in an app on the destination chain.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position, then close it after a day.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and place one small market position on an outcome you have researched.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' through ' + name + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active in the same wallet.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('aggregator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' strategy vault on ' + chain + ' and leave the position to accrue.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one native app there — a swap or a deposit — from the same wallet.";
    if (c.indexOf('payment') >= 0) return 'Fund $' + capital + ' on ' + name + ' and make one real payment or transfer through it from the same wallet.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' and vote once on an active proposal from the same wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function isBlocked(p) {
    if (p.mcap_usd != null || p.gecko_id != null || p.symbol != null) return true;
    if (['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'].indexOf(p.category) >= 0) return true;
    if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name || '')) return true;
    var w = (p.name || '').toLowerCase().split(/[^a-z0-9]+/);
    return w.indexOf('wrapped') >= 0 || w.indexOf('staked') >= 0 || w.indexOf('staking') >= 0;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(chain);
    var action = actionFor(p, capital, chain);
    if (isBlocked(p)) action += ' Only do this if you already use the protocol: its launch score is low, so this is not a farm — it is ordinary use.';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper, never in a screenshot or a chat.', cost: gas + ' for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet shows repeated use instead of a single deposit.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit to game it.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page from the link it publishes itself, and never pay anyone to claim for you.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind in the reverse order — claim, withdraw, bridge back — and check the funds land.', cost: gas + ' to unwind', time: '15 minutes to unwind' }
    ];
  }
  window.RADAR_DEBUG = { farmSteps: farmSteps, stepText: stepText, WATCHLIST: WATCHLIST };

  function chainCost(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return { gas: 6, bridge: 12 };
    if (c === 'solana') return { gas: 0.05, bridge: 2 };
    return { gas: 1, bridge: 2.5 };
  }
  function farmCalc(r, dep) {
    var gas = r.farm_gas_usd !== undefined ? r.farm_gas_usd : chainCost(chainOf(r)).gas;
    var bridge = r.farm_bridge_usd !== undefined ? r.farm_bridge_usd : chainCost(chainOf(r)).bridge;
    var hold = r.farm_hold_days !== undefined ? r.farm_hold_days : holdDaysFor(r.age_days);
    var minutes = r.farm_minutes !== undefined ? r.farm_minutes : 45 + 10 * Math.ceil(hold / 7);
    var fixed = gas + bridge;
    var cost = fixed + dep * 0.04 * hold / 365;
    var lo = r.band_low_usd !== undefined ? r.band_low_usd : r.implied_value_usd * 0.30;
    var hi = r.band_high_usd !== undefined ? r.band_high_usd : r.implied_value_usd * 4.03;
    function netFor(v) { return dep / (r.tvl_usd + dep) * 0.10 * v - cost; }
    var net = netFor(r.implied_value_usd);
    var netLo = netFor(lo), netHi = netFor(hi);
    var verdict = netLo > 0 ? 'ROBUST' : net > 0 ? 'FARM' : netHi > 0 ? 'THIN' : 'SKIP';
    var slice = dep / (r.tvl_usd + dep) * 0.10 * r.implied_value_usd;
    var beImplied = cost * (r.tvl_usd + dep) / (dep * 0.10);
    var beOdds = slice > 0 ? Math.min(1, cost / slice) : null;
    var minDep = null;
    var A = 0.10 * r.implied_value_usd, rr = 0.04 * hold / 365;
    if (rr > 0) {
      var bq = fixed + rr * r.tvl_usd - A, disc = bq * bq - 4 * rr * fixed * r.tvl_usd;
      if (disc >= 0) {
        var r1 = (-bq - Math.sqrt(disc)) / (2 * rr), r2 = (-bq + Math.sqrt(disc)) / (2 * rr);
        if (r1 > 0) minDep = r1; else if (r2 > 0) minDep = r2;
      }
    } else if (A > fixed) minDep = fixed * r.tvl_usd / (A - fixed);
    return { slice: slice, cost: cost, fixed: fixed, tbill: dep * 0.04 * hold / 365, net: net, netLo: netLo, netHi: netHi, netPh: net / (minutes / 60), verdict: verdict, beImplied: beImplied, beOdds: beOdds, minDep: minDep, hold: hold, minutes: minutes };
  }
  function verdictOf(r) { return HAS_FARM && state.deposit === 1000 && r.farm_verdict ? r.farm_verdict : farmCalc(r, state.deposit).verdict; }
  function netOf(r) { return HAS_FARM && state.deposit === 1000 && r.farm_net_usd !== undefined ? r.farm_net_usd : farmCalc(r, state.deposit).net; }
  function netPhOf(r) { return HAS_FARM && state.deposit === 1000 && r.farm_net_per_hour_usd !== undefined ? r.farm_net_per_hour_usd : farmCalc(r, state.deposit).netPh; }
  var VERDICT_ORDER = { ROBUST: 0, FARM: 1, THIN: 2, SKIP: 3 };
  function bestPerHour() {
    var best = null, bestV = -Infinity;
    DATA.rows.forEach(function (r) { var v = netPhOf(r); if (v > bestV) { bestV = v; best = r; } });
    return { row: best, value: bestV };
  }

  function isWatchlist(r) { return !!WATCHLIST[r.slug]; }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !isWatchlist(r)) return false;
      if (state.score50 && r.launch_score < 50) return false;
      if (state.verdict !== 'all' && verdictOf(r) !== state.verdict) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'curve') { av = a.curve_value_usd; bv = b.curve_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'score') { av = a.launch_score; bv = b.launch_score; }
      else if (key === 'net') { av = netOf(a); bv = netOf(b); }
      else if (key === 'netph') { av = netPhOf(a); bv = netPhOf(b); }
      else if (key === 'verdict') { av = VERDICT_ORDER[verdictOf(a)]; bv = VERDICT_ORDER[verdictOf(b)]; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  var wlOnBoard = DATA.rows.filter(isWatchlist).length;
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
  var top = DATA.rows[0];
  var bt = DATA.calibration.backtest;
  var M = DATA.method || null;

  function headerHtml() {
    var tabs = [['board', 'Board'], ['method', 'Method'], ['setaside', 'Set aside (' + SET_ASIDE.length + ')'], ['live', 'Live comps (' + LIVE_COMPS.length + ')']];
    var nav = tabs.map(function (t) {
      return '<button type="button" class="tab' + (state.view === t[0] ? ' on' : '') + '" data-view="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    return '<header class="top"><div class="brand"><span class="mark" aria-hidden="true"></span><b>Token Radar</b><span>' + esc(DATA.model_version) + ' · expected-value model</span>' +
      (DATA.sample ? '<span class="wl">SAMPLE DATA</span>' : '') + '</div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>Source <b>DefiLlama</b></span><span>Floor <b>' + fmtUsd(DATA.floor_usd) + '</b></span></div></header>' +
      '<nav class="tabs" aria-label="Views">' + nav + '</nav>';
  }
  function barHtml(pct) {
    return '<div class="bar" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, Math.round(pct))) + '%"></i></div>';
  }
  function scoreCell(r) {
    var cls = r.launch_score < 35 ? ' score-cell low' : ' score-cell';
    return '<td class="' + cls + '"><span class="num">' + r.launch_score + ' / 100</span>' + barHtml(r.launch_score) + '</td>';
  }
  function verdictBadge(v) { return '<span class="badge v-' + v.toLowerCase() + '">' + v + '</span>'; }
  function sortTh(key, label, numeric) {
    var active = state.sort === key;
    var arrow = active ? '<span class="arr" aria-hidden="true">' + (state.dir < 0 ? '▼' : '▲') + '</span>' : '';
    return '<th scope="col"' + (numeric ? ' class="num"' : '') + '><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }
  function footHtml() {
    return '<footer class="foot"><p>Snapshot ' + esc(DATA.as_of) + ' · source: DefiLlama protocol index (' + esc(DATA.source) + ') · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' · model ' + esc(DATA.model_version) + '.</p>' +
      '<p>No network: every figure on this page comes from data.js beside it. Implied values are a model’s expected values, not prices and not a promise a token will launch.</p></footer>';
  }

  function categories() {
    var seen = {}, out = [];
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; if (!seen[c]) { seen[c] = 1; out.push(c); } });
    return out.sort();
  }
  function chains() {
    var counts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 20);
  }
  function options(list, current, allLabel) {
    var h = '<option value="all"' + (current === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>';
    list.forEach(function (v) { h += '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    return h;
  }
  function verdictOptions() {
    var h = '<option value="all"' + (state.verdict === 'all' ? ' selected' : '') + '>All verdicts</option>';
    ['ROBUST', 'FARM', 'THIN', 'SKIP'].forEach(function (v) {
      h += '<option value="' + v + '"' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>';
    });
    return h;
  }
  function boardTableHtml() {
    var list = sortedRows(filteredRows());
    var countHtml = '<span class="count"><b>' + list.length + '</b> of ' + DATA.board_size + ' rows' +
      (state.wl ? ' · watchlist only' : '') + (state.score50 ? ' · launch score ≥ 50' : '') +
      (state.verdict !== 'all' ? ' · verdict ' + state.verdict : '') + ' · deposit $' + state.deposit.toLocaleString('en-US') + '</span>';
    if (list.length === 0) {
      return countHtml + '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category to see the board again.</p>' +
        '<button class="btn" type="button" data-clear="1">Clear filters</button></div></div>';
    }
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gcls = r.change_7d === null ? '' : (r.change_7d >= 0 ? ' pos' : ' neg');
      var net = netOf(r), netPh = netPhOf(r), v = verdictOf(r);
      var ncls = net >= 0 ? ' pos' : ' neg';
      var range = (r.rank_low !== undefined && r.rank_high !== undefined) ? '<span class="sub2">rank #' + r.rank_low + '–#' + r.rank_high + '</span>' : '';
      return '<tr data-protocol="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + (isWatchlist(r) ? '<span class="wl">★ Watchlist</span>' : '') + '</b>' +
        '<span class="sub2">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ') || 'chain unlisted') + '</span></div></td>' +
        '<td class="bar-cell"><span class="num">' + fmtUsd(r.implied_value_usd) + '</span>' + barHtml(r.implied_value_usd / maxImplied * 100) + range + '</td>' +
        '<td class="num">' + fmtUsd(r.curve_value_usd) + '</td>' +
        scoreCell(r) +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num' + gcls + '">' + growth + '</td>' +
        '<td class="num' + ncls + '">' + fmtSigned(net, 2) + '</td>' +
        '<td class="num' + ncls + '">' + fmtSigned(netPh, 2) + '/h</td>' +
        '<td>' + verdictBadge(v) + '</td></tr>';
    }).join('');
    return countHtml + '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan. Net dollars at a $' + state.deposit.toLocaleString('en-US') + ' deposit.</caption>' +
      '<thead><tr>' + sortTh('rank', 'Rank') + sortTh('name', 'Protocol') + sortTh('implied', 'Implied value', true) +
      sortTh('curve', 'If launched', true) + sortTh('score', 'Launch score', true) + sortTh('tvl', 'TVL', true) +
      sortTh('change', '7d', true) + sortTh('net', 'Net $', true) + sortTh('netph', 'Net / hour', true) + sortTh('verdict', 'Verdict') + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function boardHtml() {
    var pod = DATA.rows.slice(0, 3).map(function (r) {
      return '<button type="button" class="pod" data-protocol="' + esc(r.slug) + '">' +
        '<span class="rank">RANK ' + r.rank + ' · ' + esc(r.category || 'Other') + '</span>' +
        '<span class="nm"><b>' + esc(r.name) + '</b><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></span>' +
        barHtml(r.implied_value_usd / maxImplied * 100) +
        '<span class="sub">TVL ' + fmtUsd(r.tvl_usd) + ' · score ' + r.launch_score + '/100 · if launched ' + fmtUsd(r.curve_value_usd) + '</span></button>';
    }).join('');
    var bph = bestPerHour();
    var bestHtml = bph.row ? '<div class="best"><span>Best per hour at $' + state.deposit.toLocaleString('en-US') + '</span><button type="button" data-protocol="' + esc(bph.row.slug) + '"><b>' + esc(bph.row.name) + '</b> ' + fmtSigned(bph.value, 2) + '/h · ' + verdictBadge(verdictOf(bph.row)) + '</button><span class="muted">net after gas, bridge and T-bill cost.</span></div>' : '';
    return '<div class="shell">' + headerHtml() +
      '<section class="hero"><div><h1>' + DATA.board_size + ' pre-token protocols, ranked by implied value</h1>' +
      '<p class="lede">Implied value is an <b>expected value</b>: <code>implied = value-if-launched × launch chance</code>. ' +
      'The board prices what a launch would be worth, then weights it by how likely a launch is — ' +
      'so a giant with a faint launch chance can rank below a smaller protocol far more likely to launch. ' +
      'Every row is scored by the same fit to this snapshot; no name is special-cased.</p></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><span>Rows scored</span><b>' + DATA.board_size + '</b><small>' + wlOnBoard + ' of ' + DATA.watchlist_size + ' watchlist on the board</small></div>' +
      '<div class="kpi"><span>Top implied value</span><b>' + fmtUsd(top.implied_value_usd) + '</b><small>' + esc(top.name) + ', rank 1</small></div>' +
      '<div class="kpi"><span>Set aside, with reasons</span><b>' + SET_ASIDE.length + '</b><small>non-rankable pre-token protocols</small></div>' +
      '<div class="kpi"><span>Size curve, LOO error</span><b>' + bt.curve_median_log10_err.toFixed(3) + ' dex</b><small>×' + Math.pow(10, bt.curve_median_log10_err).toFixed(2) + ' · ' + (bt.curve_within_2x * 100).toFixed(1) + '% within 2× (n=' + bt.comps_n + ')</small></div>' +
      '</div></section>' +
      '<div class="podium">' + pod + '</div>' + bestHtml +
      '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + options(categories(), state.category, 'All categories') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + options(chains(), state.chain, 'All chains') + '</select></div>' +
      '<div class="field"><label for="verdict">Verdict</label><select id="verdict" aria-label="Filter by farm verdict">' + verdictOptions() + '</select></div>' +
      '<div class="field"><label>Deposit</label><div class="seg" role="group" aria-label="Deposit size">' +
      '<button type="button" class="' + (state.deposit === 1000 ? 'on' : '') + '" data-deposit="1000">$1,000</button>' +
      '<button type="button" class="' + (state.deposit === 10000 ? 'on' : '') + '" data-deposit="10000">$10,000</button></div></div>' +
      '<div class="checks">' +
      '<label class="check' + (state.wl ? ' on' : '') + '"><input type="checkbox" id="wl" ' + (state.wl ? 'checked' : '') + '> Watchlist only</label>' +
      '<label class="check' + (state.score50 ? ' on' : '') + '"><input type="checkbox" id="score50" ' + (state.score50 ? 'checked' : '') + '> Launch score ≥ 50</label>' +
      '</div></div><div id="board-panel">' + boardTableHtml() + '</div>' +
      '<section class="method"><div class="panel"><h2>How implied value is computed</h2>' +
      '<p><b>Implied value = nilai-bila-launch × peluang launch (expected value).</b> The size curve is fitted fresh on this snapshot’s ' + bt.comps_n + ' live tokens: ' +
      'log<sub>10</sub>(mcap) = ' + DATA.calibration.size_a.toFixed(4) + ' + ' + DATA.calibration.size_b.toFixed(4) + '·log<sub>10</sub>(TVL). ' +
      'A bounded, shrunk category tilt (capped at ±0.30 dex) adjusts it, then growth and maturity multipliers, then the launch probability: 0.55 × category factor × age factor × growth factor, clamped to [0.05, 0.95].</p>' +
      '<div class="formula">implied = curve(TVL) × 10^tilt × growth × maturity × launch probability</div>' +
      '<p>Leave-one-out backtest on the ' + bt.comps_n + ' live comps: the size curve alone predicts market cap with median |log<sub>10</sub> error| ' + bt.curve_median_log10_err.toFixed(3) + ' dex (×' + Math.pow(10, bt.curve_median_log10_err).toFixed(2) + '), ' + (bt.curve_within_2x * 100).toFixed(1) + '% within 2× and ' + (bt.curve_within_3x * 100).toFixed(1) + '% within 3×. ' +
      'Curve + tilt: ' + bt.tilt_median_log10_err.toFixed(3) + ' dex, ' + (bt.tilt_within_2x * 100).toFixed(1) + '% within 2×. A flat global-median multiple is worse (' + bt.global_median_log10_err.toFixed(3) + ' dex). Nobody has a precise model here; the honest edge is not overstating precision.</p>' +
      '<p>Farm verdicts are net dollars, not raw implied value: slice = deposit/(TVL+deposit) × 10% × implied, minus gas + bridge on the cheapest chain and a 4%/yr T-bill cost over the hold. ROBUST pays even at the low end of the value band (P25); FARM at the point; THIN only at the top (P75); SKIP nowhere. The deposit toggle recomputes every net and verdict on this page.</p>' +
      '<p><a data-view-link="method" href="#/method">Full method →</a></p>' +
      '</div><div class="panel"><h2>Set aside: already trading</h2>' +
      '<p>' + DATA.live_size + ' live-token protocols are set aside from the ranking — the market prices them, not the model. Another ' + SET_ASIDE.length + ' pre-token protocols fail the strict launch filter; <a data-view-link="setaside" href="#/set-aside">each one is listed with its reason →</a></p>' +
      '<div class="live-list">' + LIVE_COMPS.map(function (r) {
        return '<div><span>' + esc(r.name) + '</span><b class="num">' + fmtUsd(r.mcap_usd) + '</b></div>';
      }).join('') + '</div></div></section>' +
      footHtml() + '</div>';
  }

  function methodHtml() {
    if (!M) {
      return '<div class="shell">' + headerHtml() + '<div class="panel pad"><h2>Method</h2><p class="muted">This build ships no method object.</p></div>' + footHtml() + '</div>';
    }
    var c = M.curve || {}, dd = M.dedupe || {}, ft = M.fits || {}, pr = M.params || {}, bs = M.bootstrap || {};
    var tl = pr.tilt || {}, g = pr.growth || {}, mt = pr.maturity || {}, lp = pr.launch_prob || {};
    var full = (M.ablation || []).filter(function (a) { return a.variant === 'full'; })[0] || {};
    var flat = M.flat_dex || {};
    function kv(label, value) { return '<tr><td>' + label + '</td><td class="num">' + value + '</td></tr>'; }
    var coefRows = kv('Size curve (log<sub>10</sub> mcap on log<sub>10</sub> TVL)', 'a = ' + (c.a !== undefined ? c.a.toFixed(4) : 'n/a') + ' · b = ' + (c.b !== undefined ? c.b.toFixed(4) : 'n/a'))
      + kv('Comps fitted on', (dd.raw_n !== undefined ? dd.raw_n + ' raw' : 'n/a') + ' → ' + (dd.families_n !== undefined ? dd.families_n + ' families, one per ticker' : 'n/a'))
      + kv('Slope, OLS raw → robust fit on families', (ft.raw_ols && ft.raw_ols.b !== undefined ? ft.raw_ols.b.toFixed(4) : 'n/a') + ' → ' + (ft.fam_huber && ft.fam_huber.b !== undefined ? ft.fam_huber.b.toFixed(4) : 'n/a'))
      + kv('Robust fit', esc(c.fit || 'n/a'))
      + kv('Category tilt', 'shrunk median, k=' + (tl.shrink_k !== undefined ? tl.shrink_k : 'n/a') + ', cap ±' + (tl.cap_dex !== undefined ? tl.cap_dex.toFixed(2) : 'n/a') + ' dex')
      + kv('Growth multiplier', '1 + ' + (g.weight !== undefined ? g.weight : 'n/a') + ' × clamp(change 7d, ' + (g.floor_pct !== undefined ? g.floor_pct : 'n/a') + '%, +' + (g.cap_pct !== undefined ? g.cap_pct : 'n/a') + '%)')
      + kv('Maturity multiplier', (mt.floor !== undefined ? mt.floor : 'n/a') + ' + min(age, ' + (mt.days !== undefined ? mt.days : 'n/a') + 'd)/' + (mt.days !== undefined ? mt.days : 'n/a') + ' × ' + (mt.range !== undefined ? mt.range : 'n/a'))
      + kv('Launch probability', (lp.base !== undefined ? lp.base : 'n/a') + ' × category × age × growth, clamped [' + ((lp.clamp || [])[0] !== undefined ? lp.clamp[0] : 'n/a') + ', ' + ((lp.clamp || [])[1] !== undefined ? lp.clamp[1] : 'n/a') + ']')
      + kv('Bootstrap', (bs.refits !== undefined ? bs.refits : 'n/a') + ' refits, seed ' + (bs.seed !== undefined ? bs.seed : 'n/a') + ' · band P25–P75 · rank range P10–P90');
    var wfRows = kv('Forward (train first 60%, predict the rest)', full.wf_forward_dex !== undefined ? full.wf_forward_dex.toFixed(3) + ' dex' : 'n/a')
      + kv('Reverse (train last 40%, test the first 60%)', full.wf_reverse_dex !== undefined ? full.wf_reverse_dex.toFixed(3) + ' dex' : 'n/a')
      + kv('Split by year (pre-2024 → 2024+)', full.split_2024_dex !== undefined ? full.split_2024_dex.toFixed(3) + ' dex' : 'n/a')
      + kv('Flat multiple, same forward test', flat.wf_forward_dex !== undefined ? flat.wf_forward_dex.toFixed(3) + ' dex' : 'n/a')
      + kv('Five-fold holdout', full.five_fold_dex !== undefined ? full.five_fold_dex.toFixed(3) + ' dex' : 'n/a');
    var ab = (M.ablation || []).map(function (a) {
      return '<tr><td>' + esc(a.variant) + '</td><td class="num">' + a.loo_fam_dex.toFixed(3) + ' dex</td><td class="num">' + (a.loo_fam_within_2x * 100).toFixed(1) + '%</td><td class="num">' + a.wf_forward_dex.toFixed(3) + ' dex</td><td class="num">' + a.median_of_tests_dex.toFixed(3) + ' dex</td></tr>';
    }).join('') + (flat.variant ? '<tr><td>' + esc(flat.variant) + '</td><td class="num">' + flat.loo_fam_dex.toFixed(3) + ' dex</td><td class="num">' + (flat.loo_fam_within_2x * 100).toFixed(1) + '%</td><td class="num">' + flat.wf_forward_dex.toFixed(3) + ' dex</td><td class="num">' + flat.median_of_tests_dex.toFixed(3) + ' dex</td></tr>' : '');
    var sel = M.selection || {};
    var notes = (sel.optimism_note ? '<li>' + esc(sel.optimism_note) + '</li>' : '') + ((sel.keep_drop || []).map(function (k) { return '<li><b>' + esc(k.term) + ' — ' + esc(k.decision) + '.</b> ' + esc(k.evidence) + '</li>'; }).join(''));
    return '<div class="shell">' + headerHtml() +
      '<div class="page-head"><h1>Method — what was fitted, and what the blind tests say</h1>' +
      '<p class="lede">Every number below is computed from this snapshot at build time. dex = log<sub>10</sub> error; × = plain factor; 1 dex = 2.303 ln.</p></div>' +
      '<div class="method-grid"><div class="panel pad"><h2>Formula</h2>' +
      '<div class="formula">' + esc(M.formula || 'implied = curve(TVL) × 10^tilt × growth × maturity × launchProb') + '</div>' +
      '<table class="tbl"><tbody>' + coefRows + '</tbody></table></div>' +
      '<div class="panel pad"><h2>Walk-forward — the model tested on the future</h2>' +
      '<p class="muted">' + esc(sel.rule || 'Expanding window, comps sorted by listed_at.') + '</p>' +
      '<table class="tbl"><tbody>' + wfRows + '</tbody></table></div></div>' +
      '<div class="panel pad"><h2>Ablation — every term has to earn its place</h2>' +
      '<p class="muted">Median |log<sub>10</sub> error| (families) and share within 2×: leave-one-out and walk-forward forward, plus the median across all five blind tests, which picks the production variant. A term stays only if the blind test keeps it.</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Variant</th><th scope="col" class="num">LOO error</th><th scope="col" class="num">LOO within 2×</th><th scope="col" class="num">WF forward error</th><th scope="col" class="num">Median of 5 tests</th></tr></thead><tbody>' + ab + '</tbody></table></div></div>' +
      '<div class="panel pad"><h2>Honest notes</h2><ul class="notes">' + notes + '</ul></div>' +
      footHtml() + '</div>';
  }

  function setAsideHtml() {
    var q = state.saq.trim().toLowerCase();
    var list = SET_ASIDE.filter(function (r) {
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.reason).toLowerCase().indexOf(q) >= 0;
    });
    var counts = {};
    SET_ASIDE.forEach(function (r) { counts[r.reason] = (counts[r.reason] || 0) + 1; });
    var chips = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) {
      return '<span class="chip">' + esc(k) + ' · <b>' + counts[k] + '</b></span>';
    }).join('');
    var rows = list.map(function (r) {
      return '<tr><td><b>' + esc(r.name) + '</b><br><span class="sub2">' + esc(r.slug) + '</span></td><td>' + esc(r.category || 'Other') + '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td><td>' + esc(r.reason) + '</td></tr>';
    }).join('');
    return '<div class="shell">' + headerHtml() +
      '<div class="page-head"><h1>Set aside — ' + SET_ASIDE.length + ' pre-token protocols not ranked</h1>' +
      '<p class="lede">Each one fails the strict launch filter for a stated reason: already trading, a versioned pool, a wrapped or staked product, or a category that is a product of a token that already trades.</p></div>' +
      '<div class="chips" style="margin-bottom:12px">' + chips + '</div>' +
      '<div class="controls"><div class="field"><label for="saq">Search set aside</label><input type="search" id="saq" placeholder="Name, category or reason" value="' + esc(state.saq) + '" aria-label="Search the set-aside list"></div></div>' +
      '<span class="count"><b>' + list.length + '</b> of ' + SET_ASIDE.length + ' rows</span>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th scope="col">Protocol</th><th scope="col">Category</th><th scope="col" class="num">TVL</th><th scope="col">Why it is set aside</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      footHtml() + '</div>';
  }

  function liveHtml() {
    var a = DATA.calibration.size_a, b = DATA.calibration.size_b;
    var rows = LIVE_COMPS.map(function (r, i) {
      var mult = r.multiple !== undefined ? r.multiple : (r.mcap_usd && r.tvl_usd ? r.mcap_usd / r.tvl_usd : null);
      var resid = r.residual_dex !== undefined ? r.residual_dex : (r.mcap_usd && r.tvl_usd ? Math.log10(r.mcap_usd) - (a + b * Math.log10(r.tvl_usd)) : null);
      var rcls = resid === null ? '' : (resid >= 0 ? ' pos' : ' neg');
      return '<tr><td class="rank">' + (i + 1) + '</td><td><b>' + esc(r.name) + '</b><br><span class="sub2">' + esc(r.category || 'Other') + '</span></td><td class="num">' + fmtUsd(r.mcap_usd) + '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + (mult === null ? 'n/a' : '×' + mult.toFixed(2)) + '</td><td class="num' + rcls + '">' + (resid === null ? 'n/a' : (resid >= 0 ? '+' : '') + resid.toFixed(2) + ' dex') + '</td></tr>';
    }).join('');
    return '<div class="shell">' + headerHtml() +
      '<div class="page-head"><h1>Live comps — the traded anchors</h1>' +
      '<p class="lede">These ' + LIVE_COMPS.length + ' tokens already trade, so the market prices them — the model does not. The size curve is fitted to them: log<sub>10</sub>(mcap) = ' + a.toFixed(4) + ' + ' + b.toFixed(4) + '·log<sub>10</sub>(TVL). Residual is the anchor’s distance from that curve, in dex.</p></div>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th scope="col">#</th><th scope="col">Token</th><th scope="col" class="num">Market cap</th><th scope="col" class="num">TVL</th><th scope="col" class="num">Multiple</th><th scope="col" class="num">vs curve</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      footHtml() + '</div>';
  }

  function detailHtml(r) {
    var cal = DATA.calibration;
    var d = r.derivation || null;
    var tilt = (r.category && cal.tilts[r.category] !== undefined) ? cal.tilts[r.category] : 0;
    var tiltMult = Math.pow(10, tilt);
    var prob = r.launch_prob !== undefined ? r.launch_prob : r.launch_score / 100;
    var curve = d ? d.curve_usd : r.curve_value_usd;
    var growth = d ? d.growth_mult : r.growth_multiplier;
    var maturity = d ? d.maturity_mult : r.maturity_multiplier;
    var tiltM = d ? d.tilt_mult : tiltMult;
    var recomputed = curve * tiltM * growth * maturity * prob;
    var diffPct = Math.abs(recomputed - r.implied_value_usd) / r.implied_value_usd * 100;
    var catRate = (r.category && cal.category_token_rates[r.category] !== undefined) ? cal.category_token_rates[r.category] : DATA.model.global_token_rate;
    var scoreNote = r.launch_score >= 50
      ? 'Above average for its kind: more than half of comparable protocols record a token.'
      : (r.launch_score >= 35
        ? 'Around the middle: a launch is plausible, not likely — the value comes mostly from size.'
        : 'Well below average: a launch is a long shot. It ranks on expected value anyway, so size is doing the work.');
    var steps = farmSteps(r).map(function (s) {
      return '<li>' + esc(s.text) + '<div class="chips"><span class="chip">Cost: <b>' + esc(s.cost) + '</b></span><span class="chip">Time: <b>' + esc(s.time) + '</b></span></div></li>';
    }).join('');
    var fc = farmCalc(r, state.deposit);
    var band = (r.band_low_usd !== undefined && r.band_high_usd !== undefined)
      ? '<div><span>Value band, P25–P75</span><b>' + fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(r.band_high_usd) + '</b></div>'
      : '';
    var rankRange = (r.rank_low !== undefined && r.rank_high !== undefined)
      ? '<div><span>Rank range, P10–P90</span><b>#' + r.rank_low + ' – #' + r.rank_high + '</b></div>' : '';
    var comps = (r.nearest_comps || []).map(function (c) {
      return '<tr><td><b>' + esc(c.name) + '</b></td><td class="num">' + fmtUsd(c.tvl_usd) + '</td><td class="num">' + fmtUsd(c.mcap_usd) + '</td><td class="num">×' + (c.multiple !== undefined ? c.multiple.toFixed(2) : 'n/a') + '</td></tr>';
    }).join('');
    return '<div class="shell">' + headerHtml() +
      '<button type="button" class="back" data-back="1">← Back to the board</button>' +
      '<div class="detail-head"><div><span class="rank-chip">RANK ' + r.rank + ' OF ' + DATA.board_size + '</span>' +
      '<h1>' + esc(r.name) + (isWatchlist(r) ? '<span class="wl">★ Watchlist</span>' : '') + '</h1>' +
      '<p class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).join(', ') || 'chain unlisted') + ' · ' + fmtAge(r.age_days) + ' old · TVL ' + fmtUsd(r.tvl_usd) + '</p></div></div>' +
      '<div class="ev-hero"><div><span class="lbl">Implied value — expected value</span><div class="big">' + fmtFull(r.implied_value_usd) + '</div></div>' +
      '<div class="curve">Value if launched<br><b class="num">' + fmtFull(r.curve_value_usd) + '</b></div>' +
      '<div class="curve">Launch score<br><b class="num">' + r.launch_score + ' / 100</b></div>' +
      '<div class="curve">Farm verdict at $' + state.deposit.toLocaleString('en-US') + '<br>' + verdictBadge(verdictOf(r)) + '</div></div>' +
      '<div class="chain">' +
      '<div class="factor"><span>Value if launched</span><b>' + fmtUsd(curve) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Category tilt</span><b>' + fmtMult(tiltM) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Growth</span><b>' + fmtMult(growth) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Maturity</span><b>' + fmtMult(maturity) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Launch chance</span><b>' + Math.round(prob * 100) + '%</b></div><span class="op">=</span>' +
      '<div class="factor result"><span>Implied value</span><b>' + fmtUsd(r.implied_value_usd) + '</b></div></div>' +
      '<div class="detail-grid"><div>' +
      '<p class="why">' + esc(r.why) + '</p>' +
      '<p class="muted" style="font-size:13px;margin-top:8px">Recomputed from these factors: ' + fmtFull(recomputed) + ' — within ' + diffPct.toFixed(1) + '% of the board’s ' + fmtFull(r.implied_value_usd) + ' (launch score is rounded). Category tilt ' + (tilt >= 0 ? '+' : '') + tilt.toFixed(3) + ' dex; ' + Math.round(catRate * 100) + '% of ' + esc(r.category || 'uncategorised') + ' protocols record a token.</p>' +
      (r.case_against ? '<p class="against"><b>Case against:</b> ' + esc(r.case_against) + '</p>' : '') +
      '<h2 style="margin-top:16px">Launch score</h2>' +
      '<div class="gauge' + (r.launch_score < 35 ? ' low' : '') + '">' + barHtml(r.launch_score) +
      '<div class="lbl"><span>Model score, 0–100</span><b>' + r.launch_score + ' / 100</b></div></div>' +
      '<p class="muted" style="margin-top:10px">' + scoreNote + '</p>' +
      '<div class="facts2">' +
      '<div><span>TVL</span><b>' + fmtFull(r.tvl_usd) + '</b></div>' +
      '<div><span>TVL change, 7d</span><b>' + fmtPct(r.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + fmtAge(r.age_days) + '</b></div>' +
      '<div><span>First listed</span><b>' + esc(r.listed_at || 'unknown') + '</b></div>' +
      '<div><span>Chains</span><b>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</b></div>' +
      '<div><span>Category token rate</span><b>' + Math.round(catRate * 100) + '%</b></div>' +
      band + rankRange +
      '</div>' +
      (comps ? '<h2 style="margin-top:16px">Nearest traded comps</h2><div class="panel"><div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Token</th><th scope="col" class="num">TVL</th><th scope="col" class="num">Market cap</th><th scope="col" class="num">Multiple</th></tr></thead><tbody>' + comps + '</tbody></table></div></div>' : '') +
      '<p class="caveat">Launch score is a model score from this snapshot’s cross-section, not a measured probability that ' + esc(r.name) + ' will launch. The implied value is an expected value under that score — a ranking aid, not a price.</p>' +
      '</div><div><h2>Farm economics — netted to the dollar</h2>' +
      '<div class="seg" role="group" aria-label="Deposit size" style="margin-bottom:10px">' +
      '<button type="button" class="' + (state.deposit === 1000 ? 'on' : '') + '" data-deposit="1000">$1,000</button>' +
      '<button type="button" class="' + (state.deposit === 10000 ? 'on' : '') + '" data-deposit="10000">$10,000</button></div>' +
      '<div class="facts2" style="margin-top:0">' +
      '<div><span>Deposit</span><b>$' + state.deposit.toLocaleString('en-US') + '</b></div>' +
      '<div><span>Verdict</span><b>' + verdictBadge(fc.verdict) + '</b></div>' +
      '<div><span>Expected slice (10% × implied, pro-rata)</span><b>' + fmtSigned(fc.slice, 2) + '</b></div>' +
      '<div><span>Cost: gas + bridge $' + fc.fixed.toFixed(2) + ' + T-bill $' + fc.tbill.toFixed(2) + '</span><b>' + fmtSigned(-fc.cost, 2) + '</b></div>' +
      '<div><span>Net dollars</span><b>' + fmtSigned(fc.net, 2) + '</b></div>' +
      '<div><span>Net per hour (' + fc.minutes + ' min active)</span><b>' + fmtSigned(fc.netPh, 2) + '/h</b></div>' +
      '<div><span>Break-even implied value</span><b>' + fmtUsd(fc.beImplied) + '</b></div>' +
      '<div><span>Break-even odds (min. launch chance)</span><b>' + (fc.beOdds === null || !isFinite(fc.beOdds) ? 'n/a' : (fc.beOdds * 100).toFixed(1) + '%') + '</b></div>' +
      '<div><span>Min. deposit (net &gt; 0)</span><b>' + (fc.minDep === null ? 'none — never pays' : '$' + Math.round(fc.minDep).toLocaleString('en-US')) + '</b></div>' +
      '<div><span>Hold</span><b>' + fc.hold + ' days</b></div>' +
      '</div>' +
      '<p class="muted" style="font-size:13px;margin-top:8px">Net at the band: low end ' + fmtSigned(fc.netLo, 2) + ' · high end ' + fmtSigned(fc.netHi, 2) + '. The verdict comes from the band, not the point — ROBUST pays at the low end, FARM at the point, THIN only at the top.</p>' +
      '<h2 style="margin-top:16px">Farm plan — six steps, costed</h2>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="caveat">Costed from this protocol’s own record: ' + fmtUsd(r.tvl_usd) + ' of TVL sets the position size, ' + esc(chainOf(r)) + ' sets the gas, age sets the hold. Never pay anyone to claim for you.</p>' +
      '</div></div>' +
      '<footer class="foot"><p>Snapshot ' + esc(DATA.as_of) + ' · model ' + esc(DATA.model_version) + ' · size curve log<sub>10</sub>(mcap) = ' + DATA.calibration.size_a.toFixed(4) + ' + ' + DATA.calibration.size_b.toFixed(4) + '·log<sub>10</sub>(TVL), fitted on ' + bt.comps_n + ' live comps.</p></footer>' +
      '</div>';
  }

  function parseHash() {
    var h = window.location.hash.replace(/^#\/?/, '');
    state.wl = false; state.verdict = 'all';
    if (h.indexOf('protocol/') === 0) {
      var slug = decodeURIComponent(h.slice('protocol/'.length).split('/')[0]);
      var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
      if (row) { state.view = 'detail'; state.slug = slug; return; }
    }
    if (h === 'method') { state.view = 'method'; state.slug = null; return; }
    if (h === 'set-aside') { state.view = 'setaside'; state.slug = null; return; }
    if (h === 'live') { state.view = 'live'; state.slug = null; return; }
    if (h === 'filter=watchlist' || h === 'watchlist') state.wl = true;
    if (h.indexOf('verdict=') === 0) state.verdict = h.slice('verdict='.length).toUpperCase();
    state.view = 'board';
    state.slug = null;
  }
  function writeHash() {
    var next = state.view === 'detail' ? '#/protocol/' + state.slug
      : state.view === 'method' ? '#/method'
      : state.view === 'setaside' ? '#/set-aside'
      : state.view === 'live' ? '#/live'
      : (state.wl ? '#/filter=watchlist' : (state.verdict !== 'all' ? '#/verdict=' + state.verdict : '#/'));
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }
  function renderBoardTable() {
    var panel = document.getElementById('board-panel');
    if (panel) panel.innerHTML = boardTableHtml();
  }
  function render() {
    if (state.view === 'detail') {
      var row = DATA.rows.filter(function (r) { return r.slug === state.slug; })[0];
      if (!row) { state.view = 'board'; state.slug = null; }
      else {
        app.innerHTML = detailHtml(row);
        document.title = row.name + ' — Token Radar';
        app.setAttribute('aria-busy', 'false');
        app.setAttribute('data-ready', 'true');
        window.scrollTo(0, 0);
        return;
      }
    }
    app.innerHTML = state.view === 'method' ? methodHtml() : state.view === 'setaside' ? setAsideHtml() : state.view === 'live' ? liveHtml() : boardHtml();
    document.title = 'Token Radar — pre-token protocols ranked by implied value';
    app.setAttribute('aria-busy', 'false');
    app.setAttribute('data-ready', 'true');
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-sort]');
    if (t) {
      var key = t.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = (key === 'rank' || key === 'name') ? 1 : -1; }
      renderBoardTable();
      return;
    }
    var dep = e.target.closest('[data-deposit]');
    if (dep) { state.deposit = parseInt(dep.getAttribute('data-deposit'), 10); render(); return; }
    var view = e.target.closest('[data-view]');
    if (view) { window.location.hash = '#/' + view.getAttribute('data-view'); return; }
    var vl = e.target.closest('[data-view-link]');
    if (vl) { window.location.hash = '#/' + vl.getAttribute('data-view-link'); return; }
    var row = e.target.closest('[data-protocol]');
    if (row) { window.location.hash = '#/protocol/' + row.getAttribute('data-protocol'); return; }
    if (e.target.closest('[data-back]')) { window.location.hash = '#/'; return; }
    if (e.target.closest('[data-clear]')) {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.score50 = false; state.verdict = 'all';
      render();
    }
  });
  app.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-protocol]')) {
      e.preventDefault();
      window.location.hash = '#/protocol/' + e.target.getAttribute('data-protocol');
    }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'q') { state.q = e.target.value; renderBoardTable(); }
    else if (e.target.id === 'saq') { state.saq = e.target.value; render(); }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'category') { state.category = e.target.value; renderBoardTable(); }
    else if (e.target.id === 'chain') { state.chain = e.target.value; renderBoardTable(); }
    else if (e.target.id === 'verdict') { state.verdict = e.target.value; writeHash(); renderBoardTable(); }
    else if (e.target.id === 'wl') { state.wl = e.target.checked; writeHash(); render(); }
    else if (e.target.id === 'score50') { state.score50 = e.target.checked; renderBoardTable(); }
  });
  window.addEventListener('hashchange', function () { parseHash(); render(); });

  parseHash();
  render();
})();
