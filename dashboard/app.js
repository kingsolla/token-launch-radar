/* Token Radar dashboard (model radar-2). Static, no network: every figure comes from
   window.RADAR, written beside this page as data.js by main.ts. No fetch, no links out.
   Routes: #/ (board) · #/protocol/<slug> (detail) · #/filter=watchlist (watchlist only). */
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  /* The watchlist comes from the sealed snapshot itself: main.ts writes the snapshot's
     own watchlist array into data.js, so membership is never a name list in this file —
     the page only checks the count at render. */
  var WATCHLIST = {};
  (Array.isArray(DATA.watchlist) ? DATA.watchlist : []).forEach(function (s) { WATCHLIST[s] = 1; });

  var state = { q: '', category: 'all', chain: 'all', wl: false, score50: false, sort: 'implied', dir: -1, view: 'board', slug: null };

  /* ------------------------------------------------------------ formatting */
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

  /* ------------------------------------------------------------ farm plan
     The same derivation main.ts writes to board.json: category, chains, TVL and age
     decide the action, the capital, the hold and every cost and time. No name is
     special-cased. Every board row passes the strict filter, so no long-shot branch. */
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
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper, never in a screenshot or a chat.', cost: gas + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet shows repeated use instead of a single deposit.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit to game it.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page from the link it publishes itself, and never pay anyone to claim for you.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind in the reverse order — claim, withdraw, bridge back — and check the funds land.', cost: gas + ' to unwind', time: '15 minutes to unwind' }
    ];
  }
  /* Verification hook: the screenshot script recomputes every row's plan in-page and
     compares it with board.json, so page and board can never drift apart silently. */
  window.RADAR_DEBUG = { farmSteps: farmSteps, stepText: stepText, WATCHLIST: WATCHLIST };

  /* ------------------------------------------------------------ filtering + sorting */
  function isWatchlist(r) { return !!WATCHLIST[r.slug]; }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !isWatchlist(r)) return false;
      if (state.score50 && r.launch_score < 50) return false;
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
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  /* ------------------------------------------------------------ shared bits */
  var wlOnBoard = DATA.rows.filter(isWatchlist).length;
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
  var top = DATA.rows[0];
  var bt = DATA.calibration.backtest;

  function headerHtml() {
    return '<header class="top"><div class="brand"><span class="mark" aria-hidden="true"></span><b>Token Radar</b><span>' + esc(DATA.model_version) + ' · expected-value model</span></div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>Source <b>DefiLlama</b></span><span>Floor <b>' + fmtUsd(DATA.floor_usd) + '</b></span></div></header>';
  }
  function barHtml(pct) {
    return '<div class="bar" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, Math.round(pct))) + '%"></i></div>';
  }
  function scoreCell(r) {
    var cls = r.launch_score < 35 ? ' score-cell low' : ' score-cell';
    return '<td class="' + cls + '"><span class="num">' + r.launch_score + ' / 100</span>' + barHtml(r.launch_score) + '</td>';
  }
  function sortTh(key, label, numeric) {
    var active = state.sort === key;
    var arrow = active ? '<span class="arr" aria-hidden="true">' + (state.dir < 0 ? '▼' : '▲') + '</span>' : '';
    return '<th scope="col"' + (numeric ? ' class="num"' : '') + '><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  /* ------------------------------------------------------------ board */
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
  function boardTableHtml() {
    var list = sortedRows(filteredRows());
    var countHtml = '<span class="count" id="count"><b>' + list.length + '</b> of ' + DATA.board_size + ' rows' +
      (state.wl ? ' · watchlist only' : '') + (state.score50 ? ' · launch score ≥ 50' : '') + '</span>';
    if (list.length === 0) {
      return countHtml + '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category to see the board again.</p>' +
        '<button class="btn" type="button" data-clear="1">Clear filters</button></div></div>';
    }
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gcls = r.change_7d === null ? '' : (r.change_7d >= 0 ? ' pos' : ' neg');
      return '<tr data-protocol="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + (isWatchlist(r) ? '<span class="wl">★ Watchlist</span>' : '') + '</b>' +
        '<span class="sub2">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ') || 'chain unlisted') + '</span></div></td>' +
        '<td class="bar-cell"><span class="num">' + fmtUsd(r.implied_value_usd) + '</span>' + barHtml(r.implied_value_usd / maxImplied * 100) + '</td>' +
        '<td class="num">' + fmtUsd(r.curve_value_usd) + '</td>' +
        scoreCell(r) +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num' + gcls + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td></tr>';
    }).join('');
    return countHtml + '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortTh('rank', 'Rank') + sortTh('name', 'Protocol') + sortTh('implied', 'Implied value', true) +
      sortTh('curve', 'If launched', true) + sortTh('score', 'Launch score', true) + sortTh('tvl', 'TVL', true) +
      sortTh('change', '7d', true) + '<th scope="col" class="num">Age</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function boardHtml() {
    var pod = DATA.rows.slice(0, 3).map(function (r) {
      return '<button type="button" class="pod" data-protocol="' + esc(r.slug) + '">' +
        '<span class="rank">RANK ' + r.rank + ' · ' + esc(r.category || 'Other') + '</span>' +
        '<span class="nm"><b>' + esc(r.name) + '</b><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></span>' +
        barHtml(r.implied_value_usd / maxImplied * 100) +
        '<span class="sub">TVL ' + fmtUsd(r.tvl_usd) + ' · launch score ' + r.launch_score + '/100 · if launched ' + fmtUsd(r.curve_value_usd) + '</span></button>';
    }).join('');
    return '<div class="shell">' + headerHtml() +
      '<section class="hero"><div><h1>' + DATA.board_size + ' pre-token protocols, ranked by implied value</h1>' +
      '<p class="lede">Implied value is an <b>expected value</b>: <code>implied = value-if-launched × launch chance</code>. ' +
      'The board prices what a launch would be worth if it happened, then weights it by how likely a launch is at all — ' +
      'so a giant with a faint launch chance can rank below a smaller protocol that is far more likely to launch. ' +
      'Every row is scored by the same fit to this snapshot; no name is special-cased.</p></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><span>Rows scored</span><b>' + DATA.board_size + '</b><small>' + wlOnBoard + ' of ' + DATA.watchlist_size + ' watchlist on the board</small></div>' +
      '<div class="kpi"><span>Top implied value</span><b>' + fmtUsd(top.implied_value_usd) + '</b><small>' + esc(top.name) + ', rank 1</small></div>' +
      '<div class="kpi"><span>Early rows below floor</span><b>' + DATA.early_size + '</b><small>pre-token, under ' + fmtUsd(DATA.floor_usd) + ' TVL</small></div>' +
      '<div class="kpi"><span>Size curve, LOO error</span><b>' + bt.curve_median_log10_err.toFixed(3) + ' dex</b><small>×' + Math.pow(10, bt.curve_median_log10_err).toFixed(2) + ' · ' + (bt.curve_within_2x * 100).toFixed(1) + '% within 2× (n=' + bt.comps_n + ')</small></div>' +
      '</div></section>' +
      '<div class="podium">' + pod + '</div>' +
      '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + options(categories(), state.category, 'All categories') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + options(chains(), state.chain, 'All chains') + '</select></div>' +
      '<div class="checks">' +
      '<label class="check' + (state.wl ? ' on' : '') + '"><input type="checkbox" id="wl" ' + (state.wl ? 'checked' : '') + '> Watchlist only</label>' +
      '<label class="check' + (state.score50 ? ' on' : '') + '"><input type="checkbox" id="score50" ' + (state.score50 ? 'checked' : '') + '> Launch score ≥ 50</label>' +
      '</div></div><div id="board-panel">' + boardTableHtml() + '</div>' +
      '<section class="method"><div class="panel"><h2>How implied value is computed</h2>' +
      '<p><b>Implied value = nilai-bila-launch × peluang launch (expected value).</b> The size curve is fitted fresh on this snapshot’s ' + bt.comps_n + ' live tokens: ' +
      'log<sub>10</sub>(mcap) = ' + DATA.calibration.size_a.toFixed(4) + ' + ' + DATA.calibration.size_b.toFixed(4) + '·log<sub>10</sub>(TVL), so market cap grows roughly with the square root of TVL. ' +
      'A bounded, shrunk category tilt (capped at ±0.30 dex) adjusts it, then growth and maturity multipliers, then the launch probability: 0.55 × category factor × age factor × growth factor, clamped to [0.05, 0.95].</p>' +
      '<div class="formula">implied = curve(TVL) × 10^tilt × growth × maturity × launch probability</div>' +
      '<p>Leave-one-out backtest on the ' + bt.comps_n + ' live comps: the size curve alone predicts market cap with median |log<sub>10</sub> error| ' + bt.curve_median_log10_err.toFixed(3) + ' dex (×' + Math.pow(10, bt.curve_median_log10_err).toFixed(2) + '), ' + (bt.curve_within_2x * 100).toFixed(1) + '% within 2× and ' + (bt.curve_within_3x * 100).toFixed(1) + '% within 3×. ' +
      'Curve + tilt: ' + bt.tilt_median_log10_err.toFixed(3) + ' dex, ' + (bt.tilt_within_2x * 100).toFixed(1) + '% within 2×. A flat global-median multiple is worse (' + bt.global_median_log10_err.toFixed(3) + ' dex). Nobody has a precise model here; the honest edge is not overstating precision.</p>' +
      '<p><b>Launch score is a model score from this snapshot’s cross-section</b> — the share of protocols like this one that record a token — <b>not a measured causal probability</b> that this protocol will launch. A low score is a warning, not a rank: the board ranks on expected value, so a low-chance giant can still sit near the top.</p>' +
      '</div><div class="panel"><h2>Set aside: already trading</h2>' +
      '<p>' + DATA.live_size + ' live-token protocols are set aside from the ranking. They already trade, so the market — not the model — prices them.</p>' +
      '<div class="live-list">' + DATA.live.map(function (r) {
        return '<div><span>' + esc(r.name) + '</span><b class="num">' + fmtUsd(r.mcap_usd) + '</b></div>';
      }).join('') + '</div></div></section>' +
      '<footer class="foot"><p>Snapshot ' + esc(DATA.as_of) + ' · source: DefiLlama protocol index (' + esc(DATA.source) + ') · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' · model ' + esc(DATA.model_version) + '.</p>' +
      '<p>No network: every figure on this page comes from data.js beside it. Implied values are a model’s expected values, not prices and not a promise a token will launch.</p></footer>' +
      '</div>';
  }

  /* ------------------------------------------------------------ detail */
  function detailHtml(r) {
    var cal = DATA.calibration;
    var tilt = (r.category && cal.tilts[r.category] !== undefined) ? cal.tilts[r.category] : 0;
    var tiltMult = Math.pow(10, tilt);
    var prob = r.launch_score / 100;
    var recomputed = r.curve_value_usd * tiltMult * r.growth_multiplier * r.maturity_multiplier * prob;
    var diffPct = Math.abs(recomputed - r.implied_value_usd) / r.implied_value_usd * 100;
    var catRate = (r.category && cal.category_token_rates[r.category] !== undefined) ? cal.category_token_rates[r.category] : DATA.model.global_token_rate;
    var scoreNote = r.launch_score >= 50
      ? 'Above-average launch chance for its kind: more than half of comparable protocols record a token.'
      : (r.launch_score >= 35
        ? 'Around the middle: a launch is plausible, not likely — the value comes mostly from its size.'
        : 'Well below average: a launch is a long shot. It ranks on expected value anyway, so size is doing the work.');
    var steps = farmSteps(r).map(function (s) {
      return '<li>' + esc(s.text) + '<div class="chips"><span class="chip">Cost: <b>' + esc(s.cost) + '</b></span><span class="chip">Time: <b>' + esc(s.time) + '</b></span></div></li>';
    }).join('');
    return '<div class="shell">' + headerHtml() +
      '<button type="button" class="back" data-back="1">← Back to the board</button>' +
      '<div class="detail-head"><div><span class="rank-chip">RANK ' + r.rank + ' OF ' + DATA.board_size + '</span>' +
      '<h1>' + esc(r.name) + (isWatchlist(r) ? '<span class="wl">★ Watchlist</span>' : '') + '</h1>' +
      '<p class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).join(', ') || 'chain unlisted') + ' · ' + fmtAge(r.age_days) + ' old · TVL ' + fmtUsd(r.tvl_usd) + '</p></div></div>' +
      '<div class="ev-hero"><div><span class="lbl">Implied value — expected value</span><div class="big">' + fmtFull(r.implied_value_usd) + '</div></div>' +
      '<div class="curve">Value if launched<br><b class="num">' + fmtFull(r.curve_value_usd) + '</b></div>' +
      '<div class="curve">Launch score<br><b class="num">' + r.launch_score + ' / 100</b></div></div>' +
      '<div class="chain">' +
      '<div class="factor"><span>Value if launched</span><b>' + fmtUsd(r.curve_value_usd) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Category tilt</span><b>' + fmtMult(tiltMult) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Growth</span><b>' + fmtMult(r.growth_multiplier) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Maturity</span><b>' + fmtMult(r.maturity_multiplier) + '</b></div><span class="op">×</span>' +
      '<div class="factor"><span>Launch chance</span><b>' + Math.round(prob * 100) + '%</b></div><span class="op">=</span>' +
      '<div class="factor result"><span>Implied value</span><b>' + fmtUsd(r.implied_value_usd) + '</b></div></div>' +
      '<div class="detail-grid"><div>' +
      '<p class="why">' + esc(r.why) + '</p>' +
      '<p class="muted" style="font-size:13px;margin-top:8px">Recomputed from these factors: ' + fmtFull(recomputed) + ' — within ' + diffPct.toFixed(1) + '% of the board’s ' + fmtFull(r.implied_value_usd) + ' (the launch score is rounded to a whole number). Category tilt ' + (tilt >= 0 ? '+' : '') + tilt.toFixed(3) + ' dex; ' + Math.round(catRate * 100) + '% of ' + esc(r.category || 'uncategorised') + ' protocols record a token.</p>' +
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
      '</div>' +
      '<p class="caveat">Launch score is a model score from this snapshot’s cross-section, not a measured causal probability that ' + esc(r.name) + ' will launch. The implied value is an expected value under that score — a ranking aid, not a price.</p>' +
      '</div><div><h2>Farm plan — six steps, costed</h2>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="caveat">Costed from this protocol’s own record: ' + fmtUsd(r.tvl_usd) + ' of TVL sets the position size, ' + esc(chainOf(r)) + ' sets the gas, age sets the hold. Never pay anyone to claim for you.</p>' +
      '</div></div>' +
      '<footer class="foot"><p>Snapshot ' + esc(DATA.as_of) + ' · model ' + esc(DATA.model_version) + ' · size curve log<sub>10</sub>(mcap) = ' + DATA.calibration.size_a.toFixed(4) + ' + ' + DATA.calibration.size_b.toFixed(4) + '·log<sub>10</sub>(TVL), fitted on ' + bt.comps_n + ' live comps.</p></footer>' +
      '</div>';
  }

  /* ------------------------------------------------------------ routing + render */
  function parseHash() {
    var h = window.location.hash.replace(/^#\/?/, '');
    if (h.indexOf('protocol/') === 0) {
      var slug = decodeURIComponent(h.slice('protocol/'.length).split('/')[0]);
      var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
      if (row) { state.view = 'detail'; state.slug = slug; return; }
    }
    if (h === 'filter=watchlist' || h === 'watchlist') state.wl = true;
    state.view = 'board';
    state.slug = null;
  }
  function writeHash() {
    var next = state.view === 'detail' ? '#/protocol/' + state.slug : (state.wl ? '#/filter=watchlist' : '#/');
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
    app.innerHTML = boardHtml();
    document.title = 'Token Radar — pre-token protocols ranked by implied value';
    app.setAttribute('aria-busy', 'false');
    app.setAttribute('data-ready', 'true');
  }

  /* Events: delegation, so re-renders never drop a handler. */
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-sort]');
    if (t) {
      var key = t.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = (key === 'rank' || key === 'name') ? 1 : -1; }
      renderBoardTable();
      return;
    }
    var row = e.target.closest('[data-protocol]');
    if (row) { window.location.hash = '#/protocol/' + row.getAttribute('data-protocol'); return; }
    if (e.target.closest('[data-back]')) { window.location.hash = '#/'; return; }
    if (e.target.closest('[data-clear]')) {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.score50 = false;
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
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'category') { state.category = e.target.value; renderBoardTable(); }
    else if (e.target.id === 'chain') { state.chain = e.target.value; renderBoardTable(); }
    else if (e.target.id === 'wl') { state.wl = e.target.checked; writeHash(); render(); }
    else if (e.target.id === 'score50') { state.score50 = e.target.checked; renderBoardTable(); }
  });
  window.addEventListener('hashchange', function () { parseHash(); render(); });

  parseHash();
  render();
})();
