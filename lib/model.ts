// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// This is radar-3, a rebuild of radar-2 from the top-15 benchmark
// (~/workspace/makefun-token-radar-v2/analysis/benchmark.md). The size curve is the
// same backbone — market cap grows roughly with the square root of TVL — but
// everything around it is now tested, not asserted:
//
//   1. One point per ticker. The 128 live comps are deduped by gecko_id/symbol
//      (TVL summed, mcap = max, earliest listed_at kept): on this snapshot that
//      merges 2 multi-row families — aave (v1/v2/v3/v4/horizon, 5 rows) and sushi
//      (sushiswap/v3/stellar, 3 rows) — into 128 families. The count barely moves
//      (this snapshot carries no duplicate gecko_id), but the points move: aave
//      stops being a $91M-TVL protocol with a $1.7B token (a +2.0 dex outlier)
//      and becomes the $15.5B protocol it is.
//   2. Robust fit. The curve is a Huber IRLS fit (k = 1.345, MAD scale) on the
//      families, not OLS on raw comps: log10(mcap) = 2.6199 + 0.5752*log10(TVL)
//      against OLS-on-raw 3.0247 + 0.5223*log10(TVL). A trimmed-OLS refit
//      (residual > 2.5 MAD dropped, 5 of 128) is reported alongside.
//   3. Blind-test race. Seven variants (curve / +tilt / +growth / +maturity /
//      +growth+maturity / full / flat multiple) are raced on five blind tests:
//      leave-one-out on raw comps (n = 128) and on families (n = 128),
//      walk-forward expanding-window (train the earliest 60%, predict each later
//      token from the past only), walk-forward reverse, a pre-2024/2024+ split,
//      and five-fold by slug. The production variant is the one with the best
//      median error across the five tests — full — by 0.016-0.018 dex over the
//      curve alone. The margins are small and are reported as such; the same set
//      that selects the winner also reports its numbers, so those numbers are
//      mildly optimistic for the winner (see Method in the dashboard).
//   4. Bootstrap. 200 refits (seeded, byte-identical) give every row a value
//      band (P25-P75) and a rank range (P10-P90).
//   5. Farm economics netted to dollars. slice = deposit/(TVL+deposit) x 10% x
//      implied at a $1,000 standard deposit; costs are gas + bridge on the
//      cheapest chain plus a 4%/yr T-bill charge on the hold; net $ = slice -
//      costs; break-even as the value-if-launched that would cover costs AND as
//      the minimum launch probability that would cover them (no P guessed);
//      net per active hour; an analytic minimum-deposit solver; a four-level
//      verdict (ROBUST / FARM / THIN / SKIP) read off the band, not the point.
//   6. Kept from v1, unchanged: the empirical launch probability
//      (0.55 x category factor x age factor x growth factor + hard blocks), the
//      strict 198-protocol universe plus the 2 flagged long-shots (the two
//      largest sub-floor protocols the strict filter sets aside), and the honest
//      tone: nobody has a precise model here.
//
//   implied_value_usd = round(curve x 10^tilt x growthMult x maturityMult x launchProb)
//
//   That is an EXPECTED value: what the launch is worth to a farmer, weighting
//   the value-if-launched by the chance it ever launches.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** Fallback size-curve intercept/slope if the snapshot holds too few live comps to fit. */
  size_fallback_a: number;
  size_fallback_b: number;
  /** Category-tilt shrinkage strength (weight n/(n+k)) and cap in dex. */
  tilt_shrink_k: number;
  tilt_cap_dex: number;
  /** Growth multiplier: weight and winsorisation bounds in per cent. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity multiplier: floor, range, days to full maturity, unknown-age default. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Launch probability: base rate, category-factor clamp, prior strength. */
  base_launch_probability: number;
  global_token_rate: number;
  category_prior_strength: number;
  category_factor_floor: number;
  category_factor_cap: number;
}

export const MODEL: ModelConstants = {
  size_fallback_a: 3.0247,
  size_fallback_b: 0.5223,
  tilt_shrink_k: 8,
  tilt_cap_dex: 0.3,
  growth_weight: 0.5,
  growth_floor: -30,
  growth_cap: 60,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  base_launch_probability: 0.55,
  global_token_rate: 0.549,
  category_prior_strength: 5,
  category_factor_floor: 0.5,
  category_factor_cap: 1.3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Standard farm deposit in dollars; the toggle in the dashboard recomputes from it. */
export const FARM_DEPOSIT_USD = 1000;
/** Assumed airdrop pool share of the implied value. */
export const FARM_AIRDROP_SHARE = 0.1;
/** T-bill opportunity-cost rate per year on the deposit. */
export const FARM_TBILL_RATE = 0.04;
/** Bootstrap refits (seeded, so two runs write identical bytes). */
export const BOOTSTRAP_REFITS = 200;
export const BOOTSTRAP_SEED = 20261114;
/** Huber IRLS tuning constant. */
export const HUBER_K = 1.345;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One nearest traded comp: the evidence behind a row's value. */
export interface NearestComp {
  slug: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

/** The per-factor derivation of a row's value, in numbers, not words. */
export interface Derivation {
  curve_usd: number;
  tilt_mult: number;
  growth_mult: number;
  maturity_mult: number;
  launch_prob: number;
  value_if_launched_usd: number;
  implied_usd: number;
}

/** Farm verdict levels, read off the bootstrap band, not the point estimate. */
export type FarmVerdict = 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** Launch chance 0..100: round(launchProb * 100). A low score is a warning, not a rank. */
  launch_score: number;
  /** Why this row scores what it does, in plain words, from the snapshot's own figures. */
  why: string;
  model: {
    curve_value_usd: number;
    tilt_dex: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    launch_probability: number;
    category_token_rate: number;
    age_days: number | null;
  };
  farm_steps: string[];
  /** Bootstrap value band: P25-P75 of the implied value over 200 refits, whole dollars. */
  band_low_usd: number;
  band_high_usd: number;
  /** Bootstrap rank range: P10-P90 of the row's rank over 200 refits. */
  rank_low: number;
  rank_high: number;
  /** Farm economics at the $1,000 standard deposit, netted to dollars. */
  farm_net_usd: number;
  farm_net_per_hour_usd: number;
  /** Value-if-launched that would exactly cover the farm's costs, whole dollars. */
  farm_break_even_usd: number;
  /** Minimum launch probability that would cover the farm's costs (no P guessed). */
  farm_break_even_odds: number;
  farm_verdict: FarmVerdict;
  /** Smallest deposit whose expected net is positive, whole dollars; null when none is. */
  farm_min_deposit_usd: number | null;
  /** Launch probability 0..1. */
  launch_prob: number;
  /** The size curve's value alone, whole dollars. */
  curve_value_usd: number;
  /** The three nearest traded comps by log-TVL distance (same category preferred). */
  nearest_comps: NearestComp[];
  /** The value as a product of its factors, in numbers. */
  derivation: Derivation;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_score: number;
  why: string;
  curve_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  band_low_usd: number;
  band_high_usd: number;
  rank_low: number;
  rank_high: number;
  farm_net_usd: number;
  farm_net_per_hour_usd: number;
  farm_break_even_usd: number;
  farm_break_even_odds: number;
  farm_verdict: FarmVerdict;
  farm_min_deposit_usd: number | null;
  launch_prob: number;
  nearest_comps: NearestComp[];
  derivation: Derivation;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A live-token anchor with its multiple and its position against the size curve. */
export interface LiveCompRow extends LiveRow {
  multiple: number | null;
  curve_value_usd: number | null;
}

/** One blind-test variant's score: median |log10 error| in dex, shares within 2x / 3x. */
export interface VariantStats {
  median_dex: number;
  within_2x: number;
  within_3x: number;
  n: number;
}

/** One blind test's scores, keyed by variant name. */
export interface BlindTest {
  variants: Record<string, VariantStats>;
  n_train?: number;
  n_test?: number;
}

/** The leave-one-out backtest of the valuation, computed from the snapshot at run time. */
export interface Backtest {
  comps_n: number;
  curve_median_log10_err: number;
  curve_within_2x: number;
  curve_within_3x: number;
  tilt_median_log10_err: number;
  tilt_within_2x: number;
  tilt_within_3x: number;
  global_median_log10_err: number;
  global_within_2x: number;
}

/** The full blind-test validation: LOO (raw + families), walk-forward x2, split, five-fold. */
export interface Validation {
  raw_n: number;
  families_n: number;
  loo_raw: BlindTest;
  loo_fam: BlindTest;
  wf_forward: BlindTest;
  wf_reverse: BlindTest;
  split_2024: BlindTest;
  five_fold: BlindTest;
}

/** One deduped comp family: one traded ticker, TVL summed, mcap = max. */
export interface FamilyComp {
  key: string;
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  category: string | null;
  change_7d: number | null;
  listed_at: string | null;
  members: string[];
}

/** The fitted calibration: everything the model learned from the snapshot's live tokens. */
export interface Calibration {
  size_a: number;
  size_b: number;
  global_median_multiple: number;
  /** category -> tilt in dex (0 when the category has too few comps to tilt). */
  tilts: Record<string, number>;
  /** category -> shrunk token rate (share of the category's protocols that record a token). */
  category_token_rates: Record<string, number>;
  /** category -> launch-probability factor from its token rate, clamped. */
  category_factors: Record<string, number>;
  backtest: Backtest;
  /** Dedupe + robust-fit bookkeeping, for the Method view. */
  dedupe: {
    raw_n: number;
    families_n: number;
    merged_families: number;
    merged_rows: number;
    tvl_added_usd: number;
  };
  fits: {
    raw_ols: { a: number; b: number };
    fam_ols: { a: number; b: number };
    fam_huber: { a: number; b: number };
    fam_trim: { a: number; b: number; kept: number; dropped: number };
  };
  validation: Validation;
  bootstrap: { refits: number; seed: number };
  params: {
    tilt: { shrink_k: number; cap_dex: number };
    growth: { weight: number; floor_pct: number; cap_pct: number };
    maturity: { floor: number; range: number; days: number };
    launch_prob: { base: number; clamp: [number, number] };
  };
  farm: {
    deposit_usd: number;
    airdrop_share: number;
    tbill_rate: number;
    verdict_counts: Record<FarmVerdict, number>;
  };
}

/** One ablation row: a variant's median error in dex on every blind test. */
export interface AblationRow {
  variant: string;
  loo_raw_dex: number;
  loo_fam_dex: number;
  wf_forward_dex: number;
  split_2024_dex: number;
  wf_reverse_dex: number;
  five_fold_dex: number;
  median_of_tests_dex: number;
  loo_fam_within_2x: number;
}

/** The Method view's payload: formulas, fits, ablation, selection, honesty notes. */
export interface MethodInfo {
  model_version: string;
  formula: string;
  curve: { a: number; b: number; fit: string };
  dedupe: Calibration['dedupe'];
  fits: Calibration['fits'];
  ablation: AblationRow[];
  flat_dex: AblationRow;
  selection: {
    chosen: string;
    rule: string;
    optimism_note: string;
    keep_drop: { term: string; decision: string; evidence: string }[];
  };
  bootstrap: { refits: number; seed: number };
  params: {
    tilt: { shrink_k: number; cap_dex: number };
    growth: { weight: number; floor_pct: number; cap_pct: number };
    maturity: { floor: number; range: number; days: number };
    launch_prob: { base: number; clamp: [number, number] };
  };
  farm: {
    deposit_usd: number;
    airdrop_share: number;
    tbill_rate: number;
    gas_table: Record<string, { gas_usd: number; bridge_usd: number }>;
    verdict_counts: Record<FarmVerdict, number>;
    verdict_rule: string;
  };
}

/** A protocol the strict filter set aside, with its reason. */
export interface SetAsideRow {
  slug: string;
  name: string;
  tvl_usd: number;
  reason: string;
  on_board: boolean;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  /** The sealed snapshot's own watchlist slugs, so the dashboard never hardcodes a name list. */
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  method: MethodInfo;
  set_aside: SetAsideRow[];
  live_comps: LiveCompRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty array (sorted copy); 0 for an empty one. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Linear-interpolation quantile of a sorted-or-not array; p in [0, 1]. */
function quantile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = p * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic PRNG (mulberry32) so the bootstrap is byte-identical across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are products of a token that already trades, not launches of their own. */
const BLOCKED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a name carries a whole word wrapped, staked or staking (a product, not a launch). */
function hasWrappedWord(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  return words.includes('wrapped') || words.includes('staked') || words.includes('staking');
}

/**
 * Whether a protocol is a plausible launch at all: pre-token, in a launchable category,
 * no versioned name, no wrapped/staked/staking word. This is the strict filter; the
 * watchlist's own rule is a subset of it, so every watchlist slug passes it.
 */
export function isStrictRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && BLOCKED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (hasWrappedWord(p.name)) return false;
  return true;
}

/** Why a protocol fails the strict filter, or null when it passes. */
export function strictBlockReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'records a token that already trades';
  if (p.category !== null && BLOCKED_CATEGORIES.has(p.category)) return `category ${p.category} is a product of a token that already trades`;
  if (VERSIONED.test(p.name)) return 'its name ends in a version marker, so it is a pool of another protocol';
  if (hasWrappedWord(p.name)) return 'its name marks it as a wrapped or staked product';
  return null;
}

/** The live-token comps: protocols that record a token AND a positive market cap. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.gecko_id !== null && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * One point per ticker: group every protocol row by gecko_id (else its symbol,
 * lowercased), keep only families whose token records a positive market cap,
 * sum TVL across the family's rows, take the max market cap. The family's
 * category / 7-day change come from its largest-mcap row; its listed_at is the
 * earliest of its rows. On this snapshot: 128 raw comps -> 128 families (no two
 * gecko_ids collide), but 10 families merge 2-5 rows each — aave-v2/v3/v4 and
 * sushiswap/v3 stop counting as separate protocols.
 */
export function buildFamilies(snapshot: Snapshot): FamilyComp[] {
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    if (p.gecko_id === null && p.symbol === null) continue;
    const key = (p.gecko_id ?? p.symbol)!.toLowerCase();
    const g = groups.get(key);
    if (g === undefined) groups.set(key, [p]);
    else g.push(p);
  }
  const families: FamilyComp[] = [];
  for (const [key, rows] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const mcaps = rows.map((p) => p.mcap_usd).filter((m): m is number => m !== null && m > 0);
    if (mcaps.length === 0) continue;
    const top = rows.reduce((a, b) => ((b.mcap_usd ?? 0) > (a.mcap_usd ?? 0) ? b : a));
    const listed = rows.map((p) => p.listed_at).filter((d): d is string => d !== null).sort();
    families.push({
      key,
      slug: top.slug,
      name: top.name,
      tvl_usd: rows.reduce((s, p) => s + p.tvl_usd, 0),
      mcap_usd: Math.max(...mcaps),
      category: top.category,
      change_7d: top.change_7d,
      listed_at: listed.length > 0 ? listed[0]! : null,
      members: rows.map((p) => p.slug).sort(),
    });
  }
  return families;
}

/** A point the curve fits on: a TVL and a market cap. */
interface FitPoint {
  tvl: number;
  mcap: number;
}

function pointsOf(families: FamilyComp[]): FitPoint[] {
  return families.map((f) => ({ tvl: f.tvl_usd, mcap: f.mcap_usd }));
}

/** OLS fit of log10(mcap) on log10(TVL) over `pool`; falls back to the model's constants. */
function fitOLS(pool: FitPoint[], model: ModelConstants): { a: number; b: number } {
  if (pool.length < 20) return { a: model.size_fallback_a, b: model.size_fallback_b };
  const xs = pool.map((p) => Math.log10(p.tvl));
  const ys = pool.map((p) => Math.log10(p.mcap));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  if (den === 0) return { a: model.size_fallback_a, b: model.size_fallback_b };
  const b = num / den;
  return { a: my - b * mx, b };
}

/**
 * Huber IRLS fit (k = 1.345, MAD scale, up to 12 iterations) of log10(mcap) on
 * log10(TVL). Outliers keep a voice but stop shouting: a residual beyond
 * k x 1.4826 x MAD is downweighted in proportion. Starts from OLS.
 */
function fitHuber(pool: FitPoint[], model: ModelConstants, k = HUBER_K): { a: number; b: number } {
  if (pool.length < 20) return { a: model.size_fallback_a, b: model.size_fallback_b };
  let { a, b } = fitOLS(pool, model);
  for (let iter = 0; iter < 12; iter++) {
    const res = pool.map((p) => Math.log10(p.mcap) - (a + b * Math.log10(p.tvl)));
    const med = median(res);
    const mad = median(res.map((r) => Math.abs(r - med))) || 1e-9;
    const s = 1.4826 * mad;
    const w = res.map((r) => {
      const u = Math.abs(r - med) / (k * s);
      return u <= 1 ? 1 : 1 / u;
    });
    const xs = pool.map((p) => Math.log10(p.tvl));
    const ys = pool.map((p) => Math.log10(p.mcap));
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += w[i]!;
      sx += w[i]! * xs[i]!;
      sy += w[i]! * ys[i]!;
      sxx += w[i]! * xs[i]! * xs[i]!;
      sxy += w[i]! * xs[i]! * ys[i]!;
    }
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) break;
    const b2 = (sw * sxy - sx * sy) / den;
    const a2 = (sy - b2 * sx) / sw;
    const done = Math.abs(a2 - a) < 1e-9 && Math.abs(b2 - b) < 1e-9;
    a = a2;
    b = b2;
    if (done) break;
  }
  return { a, b };
}

/** Trimmed OLS: drop residuals beyond 2.5 MAD from the OLS fit, then refit. Reported alongside Huber. */
function fitTrimmed(pool: FitPoint[], model: ModelConstants): { a: number; b: number; kept: number; dropped: number } {
  const first = fitOLS(pool, model);
  const res = pool.map((p) => Math.log10(p.mcap) - (first.a + first.b * Math.log10(p.tvl)));
  const med = median(res);
  const mad = median(res.map((r) => Math.abs(r - med))) || 1e-9;
  const kept = pool.filter((_, i) => Math.abs(res[i]! - med) <= 2.5 * 1.4826 * mad);
  const refit = fitOLS(kept, model);
  return { a: refit.a, b: refit.b, kept: kept.length, dropped: pool.length - kept.length };
}

/** A fitted pool: one curve fit plus the medians the variants need, computed once per fold. */
interface FittedPool {
  a: number;
  b: number;
  gm: number;
  tilts: Map<string, number>;
}

/** Category tilt in dex from `pool` (n >= 3 only), shrunk toward the global median and capped. */
function tiltFor(category: string | null, pool: FamilyComp[], globalMedian: number, model: ModelConstants): number {
  if (category === null) return 0;
  const ratios = pool.filter((p) => p.category === category).map((p) => p.mcap_usd / p.tvl_usd);
  if (ratios.length < 3 || globalMedian <= 0) return 0;
  const raw = Math.log10(median(ratios) / globalMedian);
  const w = ratios.length / (ratios.length + model.tilt_shrink_k);
  return w * clamp(raw, -model.tilt_cap_dex, model.tilt_cap_dex);
}

/** Fit a pool once (curve + global median + per-category tilts) for a blind-test fold. */
function fitPool(pool: FamilyComp[], fit: (pts: FitPoint[], m: ModelConstants) => { a: number; b: number }, model: ModelConstants): FittedPool {
  const { a, b } = fit(pointsOf(pool), model);
  const gm = median(pool.map((p) => p.mcap_usd / p.tvl_usd));
  const tilts = new Map<string, number>();
  for (const p of pool) {
    if (p.category !== null && !tilts.has(p.category)) tilts.set(p.category, tiltFor(p.category, pool, gm, model));
  }
  return { a, b, gm, tilts };
}

/** The age factor of the launch probability: youth is neutral, old-and-still-tokenless is not. */
function ageFactor(age: number | null): number {
  if (age === null) return 0.85;
  if (age < 365) return 1.0;
  if (age < 730) return 0.9;
  if (age < 1095) return 0.8;
  if (age < 1460) return 0.65;
  return 0.55;
}

/** The growth factor of the launch probability: only dying or spiking moves it, and barely. */
function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  if (change7d <= -25) return 0.85;
  if (change7d >= 50) return 0.95;
  return 1;
}

/**
 * The launch probability: the snapshot's own token rate, times the protocol's category
 * factor, its age factor and its growth factor — or a hard block for products of a
 * token that already trades. Transparent, in the open, one factor per line.
 */
export function launchProbability(p: SnapshotProtocol, age: number | null, cal: Calibration, model: ModelConstants = MODEL): number {
  if (p.category !== null && BLOCKED_CATEGORIES.has(p.category)) return 0.05;
  if (VERSIONED.test(p.name)) return 0.1;
  if (hasWrappedWord(p.name)) return 0.1;
  const catFactor = p.category !== null && cal.category_factors[p.category] !== undefined ? cal.category_factors[p.category]! : 1;
  const prob = model.base_launch_probability * catFactor * ageFactor(age) * growthFactor(p.change_7d);
  return clamp(prob, 0.05, 0.95);
}

/** The maturity multiplier: older protocols are more established, so a launch is worth more. */
function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const ageForModel = age ?? model.unknown_age_days;
  return model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
}

/** The growth multiplier from a 7-day TVL change, winsorised. */
function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  return { pct, mult: 1 + (pct / 100) * model.growth_weight };
}

/** The full valuation of one protocol: every factor, and the implied (expected) value. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  cal: Calibration,
): {
  implied: number;
  curve: number;
  tiltDex: number;
  tiltMult: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  launchProb: number;
  valueIfLaunched: number;
  categoryTokenRate: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { pct: growthPct, mult: growthMult } = growthMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const curve = Math.pow(10, cal.size_a + cal.size_b * Math.log10(Math.max(1, protocol.tvl_usd)));
  const tiltDex = protocol.category !== null && cal.tilts[protocol.category] !== undefined ? cal.tilts[protocol.category]! : 0;
  const tiltMult = Math.pow(10, tiltDex);
  const launchProb = launchProbability(protocol, age, cal, model);
  const categoryTokenRate =
    protocol.category !== null && cal.category_token_rates[protocol.category] !== undefined
      ? cal.category_token_rates[protocol.category]!
      : model.global_token_rate;
  const valueIfLaunched = curve * tiltMult * growthMult * maturityMult;
  const implied = Math.max(1, valueIfLaunched * launchProb);
  return { implied, curve, tiltDex, tiltMult, growthPct, growthMult, maturityMult, launchProb, valueIfLaunched, categoryTokenRate, age };
}

/* ------------------------------------------------------------------ */
/* Blind-test validation                                               */
/* ------------------------------------------------------------------ */

/** Variant flags: which terms beyond the size curve a variant applies. */
interface VariantFlags {
  tilt: boolean;
  growth: boolean;
  maturity: boolean;
  flat: boolean;
}

export const VARIANTS: { name: string; flags: VariantFlags }[] = [
  { name: 'curve', flags: { tilt: false, growth: false, maturity: false, flat: false } },
  { name: '+tilt', flags: { tilt: true, growth: false, maturity: false, flat: false } },
  { name: '+growth', flags: { tilt: false, growth: true, maturity: false, flat: false } },
  { name: '+maturity', flags: { tilt: false, growth: false, maturity: true, flat: false } },
  { name: '+growth+maturity', flags: { tilt: false, growth: true, maturity: true, flat: false } },
  { name: 'full', flags: { tilt: true, growth: true, maturity: true, flat: false } },
  { name: 'flat', flags: { tilt: false, growth: false, maturity: false, flat: true } },
];

/** Predict one family's market cap from a fitted training pool, under one variant. */
function predictMcap(target: FamilyComp, fitted: FittedPool, flags: VariantFlags, asOf: string, model: ModelConstants): number {
  if (flags.flat) return target.tvl_usd * fitted.gm;
  let v = Math.pow(10, fitted.a + fitted.b * Math.log10(Math.max(1, target.tvl_usd)));
  if (flags.tilt && target.category !== null) v *= Math.pow(10, fitted.tilts.get(target.category) ?? 0);
  if (flags.growth) v *= growthMultiplier(target.change_7d, model).mult;
  if (flags.maturity) v *= maturityMultiplier(ageDays(asOf, target.listed_at), model);
  return v;
}

function summarizeErrs(errs: number[]): VariantStats {
  return {
    median_dex: median(errs),
    within_2x: errs.filter((e) => e <= Math.log10(2)).length / errs.length,
    within_3x: errs.filter((e) => e <= Math.log10(3)).length / errs.length,
    n: errs.length,
  };
}

type FitFn = (pts: FitPoint[], m: ModelConstants) => { a: number; b: number };

/** Score every variant on one (target, training-pool) pair set, refitting per fold. */
function scoreVariants(
  folds: { target: FamilyComp; train: FamilyComp[] }[],
  fit: FitFn,
  asOf: string,
  model: ModelConstants,
): Record<string, VariantStats> {
  const errs: Record<string, number[]> = {};
  for (const v of VARIANTS) errs[v.name] = [];
  for (const fold of folds) {
    const fitted = fitPool(fold.train, fit, model);
    for (const v of VARIANTS) {
      const pred = predictMcap(fold.target, fitted, v.flags, asOf, model);
      errs[v.name]!.push(Math.abs(Math.log10(pred / fold.target.mcap_usd)));
    }
  }
  const out: Record<string, VariantStats> = {};
  for (const v of VARIANTS) out[v.name] = summarizeErrs(errs[v.name]!);
  return out;
}

/** Leave-one-out: every family predicted from all the others, refit per fold. */
function looTest(pool: FamilyComp[], fit: FitFn, asOf: string, model: ModelConstants): BlindTest {
  const folds = pool.map((target, i) => ({ target, train: pool.filter((_, j) => j !== i) }));
  return { variants: scoreVariants(folds, fit, asOf, model), n_test: pool.length };
}

/** Expanding-window walk-forward: train on the earliest 60% by listed_at, then predict
 * each later token from the past only, refitting as the window grows. `reverse` trains
 * on the latest 60% and tests the earliest instead. */
function wfTest(pool: FamilyComp[], fit: FitFn, asOf: string, model: ModelConstants, reverse: boolean): BlindTest {
  const dated = pool.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  if (reverse) dated.reverse();
  const cut = Math.floor(dated.length * 0.6);
  const folds = dated.slice(cut).map((target, k) => ({ target, train: dated.slice(0, cut + k) }));
  return { variants: scoreVariants(folds, fit, asOf, model), n_train: cut, n_test: dated.length - cut };
}

/** Time split: fit on tokens listed before 2024, test on 2024+. */
function splitTest(pool: FamilyComp[], fit: FitFn, asOf: string, model: ModelConstants): BlindTest {
  const train = pool.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  const folds = test.map((target) => ({ target, train }));
  return { variants: scoreVariants(folds, fit, asOf, model), n_train: train.length, n_test: test.length };
}

/** Five-fold by slug order (supplementary: the set that selects the winner reports it too). */
function fiveFoldTest(pool: FamilyComp[], fit: FitFn, asOf: string, model: ModelConstants): BlindTest {
  const sorted = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const folds: { target: FamilyComp; train: FamilyComp[] }[] = [];
  for (let f = 0; f < 5; f++) {
    const test = sorted.filter((_, i) => i % 5 === f);
    const train = sorted.filter((_, i) => i % 5 !== f);
    for (const target of test) folds.push({ target, train });
  }
  return { variants: scoreVariants(folds, fit, asOf, model), n_test: pool.length };
}

/** Run every blind test: LOO on raw comps (OLS, the v1 method) and on families (Huber),
 * walk-forward forward + reverse, the 2024 split, and five-fold. */
export function runValidation(snapshot: Snapshot, families: FamilyComp[], model: ModelConstants = MODEL): Validation {
  const asOf = snapshot.as_of;
  const raw: FamilyComp[] = compsOf(snapshot).map((p) => ({
    key: p.gecko_id!,
    slug: p.slug,
    name: p.name,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    category: p.category,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    members: [p.slug],
  }));
  return {
    raw_n: raw.length,
    families_n: families.length,
    loo_raw: looTest(raw, fitOLS, asOf, model),
    loo_fam: looTest(families, fitHuber, asOf, model),
    wf_forward: wfTest(families, fitHuber, asOf, model, false),
    wf_reverse: wfTest(families, fitHuber, asOf, model, true),
    split_2024: splitTest(families, fitHuber, asOf, model),
    five_fold: fiveFoldTest(families, fitHuber, asOf, model),
  };
}

/* ------------------------------------------------------------------ */
/* Bootstrap bands and rank ranges                                     */
/* ------------------------------------------------------------------ */

/** One board row's inputs to the bootstrap: everything a refit needs. */
interface BootstrapRow {
  slug: string;
  tvl_usd: number;
  category: string | null;
  change_7d: number | null;
  listed_at: string | null;
  launch_prob: number;
  growth_mult: number;
  maturity_mult: number;
}

/** Bootstrap band + rank range for one row. */
export interface BootstrapBand {
  band_low_usd: number;
  band_high_usd: number;
  rank_low: number;
  rank_high: number;
}

/**
 * 200 seeded refits of the size curve (resample the families with replacement,
 * Huber-refit, recompute every row's implied value, re-rank). Returns each row's
 * value band (P25-P75) and rank range (P10-P90). Deterministic: same seed, same
 * families, same bytes.
 */
export function bootstrapBands(
  rows: BootstrapRow[],
  families: FamilyComp[],
  asOf: string,
  model: ModelConstants = MODEL,
  refits: number = BOOTSTRAP_REFITS,
  seed: number = BOOTSTRAP_SEED,
): Map<string, BootstrapBand> {
  const rng = mulberry32(seed);
  const n = families.length;
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const r of rows) {
    values.set(r.slug, []);
    ranks.set(r.slug, []);
  }
  for (let k = 0; k < refits; k++) {
    const sample: FamilyComp[] = [];
    for (let i = 0; i < n; i++) sample.push(families[Math.floor(rng() * n)]!);
    const fitted = fitPool(sample, fitHuber, model);
    const scored = rows.map((r) => {
      let v = Math.pow(10, fitted.a + fitted.b * Math.log10(Math.max(1, r.tvl_usd)));
      if (r.category !== null) v *= Math.pow(10, fitted.tilts.get(r.category) ?? 0);
      v *= r.growth_mult * r.maturity_mult;
      return { slug: r.slug, implied: v * r.launch_prob };
    });
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : 1));
    scored.forEach((s, i) => {
      values.get(s.slug)!.push(s.implied);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const out = new Map<string, BootstrapBand>();
  for (const r of rows) {
    const vs = values.get(r.slug)!;
    const rs = ranks.get(r.slug)!;
    out.set(r.slug, {
      band_low_usd: Math.max(1, Math.round(quantile(vs, 0.25))),
      band_high_usd: Math.max(1, Math.round(quantile(vs, 0.75))),
      rank_low: Math.max(1, Math.round(quantile(rs, 0.1))),
      rank_high: Math.max(1, Math.round(quantile(rs, 0.9))),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Farm economics, netted to dollars                                   */
/* ------------------------------------------------------------------ */

/** Gas + bridge cost of one chain, in dollars (cheapest chain wins). */
export const GAS_TABLE: Record<string, { gas_usd: number; bridge_usd: number }> = {
  ethereum: { gas_usd: 6, bridge_usd: 12 },
  solana: { gas_usd: 0.05, bridge_usd: 2 },
};
const GAS_DEFAULT = { gas_usd: 1, bridge_usd: 2.5 };

/** Cheapest entry cost (gas + bridge) across a protocol's chains. */
function cheapestChainCost(chains: string[]): { gas_usd: number; bridge_usd: number; chain: string } {
  if (chains.length === 0) return { ...GAS_DEFAULT, chain: 'its main chain' };
  let best = { ...GAS_DEFAULT, chain: chains[0]! };
  for (const chain of chains) {
    const c = GAS_TABLE[chain.toLowerCase()] ?? GAS_DEFAULT;
    if (c.gas_usd + c.bridge_usd < best.gas_usd + best.bridge_usd) best = { ...c, chain };
  }
  return best;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Active minutes a farm plan takes: setup + weekly actions + check + unwind. */
export function farmActiveMinutes(holdDays: number): number {
  return 5 + 15 + 10 * Math.ceil(holdDays / 7) + 10 + 15;
}

export interface FarmEconomics {
  net_usd: number;
  net_per_hour_usd: number;
  break_even_usd: number;
  break_even_odds: number;
  verdict: FarmVerdict;
  min_deposit_usd: number | null;
  hold_days: number;
  cost_usd: number;
  slice_usd: number;
  active_minutes: number;
}

/**
 * The farm's dollars at a deposit: slice = deposit/(TVL+deposit) x 10% x implied;
 * costs = gas + bridge on the cheapest chain + a 4%/yr T-bill charge on the hold;
 * net = slice - costs. The verdict reads the bootstrap band: ROBUST when even the
 * band's low end pays, FARM when the point pays, THIN when only the high end
 * pays, SKIP otherwise. break_even_usd is the value-if-launched that would cover
 * the costs; break_even_odds is the launch probability that would cover them.
 * min_deposit_usd solves net(d) = 0 analytically (net is concave in d); null
 * when no deposit ever breaks even.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  valueIfLaunched: number,
  launchProb: number,
  bandLow: number,
  bandHigh: number,
  deposit: number = FARM_DEPOSIT_USD,
): FarmEconomics {
  const hold = holdDaysFor(age);
  const { gas_usd, bridge_usd } = cheapestChainCost(p.chains);
  const tbill = deposit * FARM_TBILL_RATE * (hold / 365);
  const cost = gas_usd + bridge_usd + tbill;
  const share = deposit / (p.tvl_usd + deposit);
  const slice = share * FARM_AIRDROP_SHARE * implied;
  const net = slice - cost;
  const netLow = share * FARM_AIRDROP_SHARE * bandLow - cost;
  const netHigh = share * FARM_AIRDROP_SHARE * bandHigh - cost;
  const verdict: FarmVerdict = netLow > 0 ? 'ROBUST' : net > 0 ? 'FARM' : netHigh > 0 ? 'THIN' : 'SKIP';
  const breakEvenUsd = Math.max(1, Math.round(cost / Math.max(1e-12, share * FARM_AIRDROP_SHARE * launchProb)));
  const breakEvenOdds = cost / Math.max(1e-12, share * FARM_AIRDROP_SHARE * valueIfLaunched);
  const minutes = farmActiveMinutes(hold);
  return {
    net_usd: Math.round(net * 100) / 100,
    net_per_hour_usd: Math.round((net / (minutes / 60)) * 1e4) / 1e4,
    break_even_usd: breakEvenUsd,
    break_even_odds: Math.round(breakEvenOdds * 1e4) / 1e4,
    verdict,
    min_deposit_usd: minDeposit(implied, p.tvl_usd, gas_usd + bridge_usd, FARM_TBILL_RATE * (hold / 365)),
    hold_days: hold,
    cost_usd: Math.round(cost * 100) / 100,
    slice_usd: Math.round(slice * 100) / 100,
    active_minutes: minutes,
  };
}

/**
 * Smallest deposit d with net(d) >= 0, where net(d) = 0.1*implied*d/(TVL+d) - C0 - r*d.
 * net is concave in d: solve r*d^2 + (C0 + r*TVL - 0.1*implied)*d + C0*TVL = 0 and take
 * the smallest positive root; null when the peak net is still negative.
 */
function minDeposit(implied: number, tvl: number, fixedCost: number, rate: number): number | null {
  if (implied <= 0 || fixedCost <= 0) return null;
  const k = FARM_AIRDROP_SHARE * implied;
  if (rate <= 0) {
    const d = (fixedCost * tvl) / (k - fixedCost);
    return d > 0 ? Math.ceil(d) : null;
  }
  const b = fixedCost + rate * tvl - k;
  const disc = b * b - 4 * rate * fixedCost * tvl;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const roots = [(-b - sq) / (2 * rate), (-b + sq) / (2 * rate)].filter((d) => d > 0).sort((x, y) => x - y);
  if (roots.length === 0) return null;
  return Math.ceil(roots[0]!);
}

/** The three nearest traded comps by log-TVL distance (same category counts 0.25 dex closer). */
export function nearestComps(row: { tvl_usd: number; category: string | null }, families: FamilyComp[]): NearestComp[] {
  const logTvl = Math.log10(Math.max(1, row.tvl_usd));
  return [...families]
    .map((f) => ({
      f,
      dist: Math.abs(Math.log10(Math.max(1, f.tvl_usd)) - logTvl) + (f.category === row.category ? 0 : 0.25),
    }))
    .sort((a, b) => a.dist - b.dist || (a.f.slug < b.f.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ f }) => ({
      slug: f.slug,
      tvl_usd: Math.round(f.tvl_usd),
      mcap_usd: Math.round(f.mcap_usd),
      multiple: Math.round((f.mcap_usd / f.tvl_usd) * 1e4) / 1e4,
    }));
}

/* ------------------------------------------------------------------ */
/* Text: why, and the farm plan                                        */
/* ------------------------------------------------------------------ */

/** A dollar figure in the words a reader can scan: $2.75B, $153M, $940K. */
function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** An age in the words a reader can scan: 45 days, 18 months, 4.3 years. */
function ageWords(age: number | null): string {
  if (age === null) return 'of unknown age';
  if (age < 60) return `${age} days old`;
  if (age < 365) return `${Math.round(age / 30)} months old`;
  return `${(age / 365).toFixed(1)} years old`;
}

/**
 * The row's reason, in plain words, from the snapshot's own figures: size, momentum,
 * age, how often its category records a token, and which factor moved it most.
 * A blocked protocol's reason says the block first — the board never hides it.
 */
export function whyFor(
  p: SnapshotProtocol,
  v: { curve: number; tiltDex: number; growthPct: number; growthMult: number; maturityMult: number; launchProb: number; categoryTokenRate: number; age: number | null },
): string {
  const block = strictBlockReason(p);
  const score = Math.round(v.launchProb * 100);
  if (block !== null) {
    return (
      `Long shot — launch score ${score}/100: ${block}. ` +
      `Its ${money(p.tvl_usd)} of TVL would price near ${money(v.curve)} on the size curve, ` +
      `but a token of its own is unlikely, so the expected value is small. ` +
      `Farm it only if you already use it; do not deploy fresh capital for a launch.`
    );
  }
  const parts: string[] = [];
  parts.push(`TVL ${money(p.tvl_usd)}, ${ageWords(v.age)} with no token recorded.`);
  if (p.change_7d !== null) {
    if (p.change_7d >= 10) parts.push(`TVL up ${p.change_7d.toFixed(1)}% in 7 days — the week's momentum lifts its value.`);
    else if (p.change_7d <= -15) parts.push(`TVL down ${Math.abs(p.change_7d).toFixed(1)}% in 7 days — the slide drags its value down.`);
    else parts.push(`TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in 7 days, roughly flat.`);
  } else {
    parts.push('No 7-day TVL change reported.');
  }
  const ratePct = Math.round(v.categoryTokenRate * 100);
  if (v.categoryTokenRate <= 0.2) {
    parts.push(`Only ${ratePct}% of ${p.category ?? 'uncategorised'} protocols record a token, so the launch chance is well below average (score ${score}/100).`);
  } else if (v.categoryTokenRate >= 0.6) {
    parts.push(`${ratePct}% of ${p.category ?? 'uncategorised'} protocols record a token, so the launch chance is above average (score ${score}/100).`);
  } else {
    parts.push(`${ratePct}% of ${p.category ?? 'uncategorised'} protocols record a token (score ${score}/100).`);
  }
  if (v.tiltDex >= 0.1) parts.push(`Its category's traded tokens price above the size curve, which lifts the value.`);
  else if (v.tiltDex <= -0.1) parts.push(`Its category's traded tokens price below the size curve, which trims the value.`);
  if (v.age !== null && v.age >= 1095) parts.push('It has run over 3 years with no token, which counts against a launch ever coming.');
  return parts.join(' ');
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 200_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** What one transaction costs on a chain, in the words a farmer budgets with. */
function gasNote(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $3 to $8 of gas per transaction on Ethereum';
  if (c === 'solana') return 'about $0.01 of gas per transaction on Solana';
  if (c === 'bitcoin') return 'about $1 to $3 of fees per transaction on Bitcoin';
  if (['base', 'arbitrum', 'optimism', 'polygon', 'ink', 'mode', 'blast', 'zksync', 'linea', 'scroll', 'world chain'].includes(c)) {
    return `under $0.10 of gas per transaction on ${chain}`;
  }
  return `about $0.50 of gas per transaction on ${chain}`;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as collateral, borrow a small amount against it, then repay the borrow.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} — half USDC, half the paired asset — and keep the position open.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in an app on the destination chain.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, then close it after a day.`;
  }
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one small market position on an outcome you have researched.`;
  if (c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  }
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the same wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} through ${name} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active in the same wallet.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('aggregator')) {
    return `Deposit $${capital} of USDC into a ${name} strategy vault on ${chain} and leave the position to accrue.`;
  }
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain and use one native app there — a swap or a deposit — from the same wallet.`;
  if (c.includes('payment')) return `Fund $${capital} on ${name} and make one real payment or transfer through it from the same wallet.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} and vote once on an active proposal from the same wallet.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * A long-shot protocol's plan says so in its second step: it is not worth fresh capital.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  const blocked = strictBlockReason(p) !== null;
  const action = blocked
    ? `${actionFor(p, capital, chain)} Only do this if you already use the protocol: its launch score is low, so this is not a farm — it is ordinary use.`
    : actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper, never in a screenshot or a chat.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet shows repeated use instead of a single deposit.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit to game it.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page from the link it publishes itself, and never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in the reverse order — claim, withdraw, bridge back — and check the funds land.`,
      cost: `${gas} to unwind`,
      time: '15 minutes to unwind',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Calibration and board                                               */
/* ------------------------------------------------------------------ */

/**
 * Fit the whole calibration from the snapshot: the deduped families, the OLS /
 * Huber / trimmed size curves, the global median multiple, the per-category
 * tilts and token rates, the v1-shaped LOO backtest, and the full blind-test
 * validation. Every number the board prints traces back to this one fit.
 */
export function fitCalibration(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const raw = compsOf(snapshot);
  const families = buildFamilies(snapshot);
  const rawPts = raw.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd! }));
  const famPts = pointsOf(families);
  const rawOls = fitOLS(rawPts, model);
  const famOls = fitOLS(famPts, model);
  const famHuber = fitHuber(famPts, model);
  const famTrim = fitTrimmed(famPts, model);
  const globalMedian = median(families.map((f) => f.mcap_usd / f.tvl_usd));
  const categories = new Set(snapshot.protocols.map((p) => p.category).filter((c): c is string => c !== null));
  const tilts: Record<string, number> = {};
  const categoryTokenRates: Record<string, number> = {};
  const categoryFactors: Record<string, number> = {};
  for (const category of [...categories].sort()) {
    tilts[category] = tiltFor(category, families, globalMedian, model);
    const members = snapshot.protocols.filter((p) => p.category === category);
    const tokened = members.filter((p) => !isPreToken(p)).length;
    const rate = (tokened + model.category_prior_strength * model.global_token_rate) / (members.length + model.category_prior_strength);
    categoryTokenRates[category] = rate;
    categoryFactors[category] = clamp(rate / model.global_token_rate, model.category_factor_floor, model.category_factor_cap);
  }
  const validation = runValidation(snapshot, families, model);
  const merged = families.filter((f) => f.members.length > 1);
  const tvlAdded = merged.reduce((s, f) => {
    const top = Math.max(...f.members.map((slug) => snapshot.protocols.find((p) => p.slug === slug)!.tvl_usd));
    return s + (f.tvl_usd - top);
  }, 0);
  const looRaw = validation.loo_raw.variants;
  return {
    size_a: famHuber.a,
    size_b: famHuber.b,
    global_median_multiple: globalMedian,
    tilts,
    category_token_rates: categoryTokenRates,
    category_factors: categoryFactors,
    backtest: {
      comps_n: validation.raw_n,
      curve_median_log10_err: looRaw['curve']!.median_dex,
      curve_within_2x: looRaw['curve']!.within_2x,
      curve_within_3x: looRaw['curve']!.within_3x,
      tilt_median_log10_err: looRaw['+tilt']!.median_dex,
      tilt_within_2x: looRaw['+tilt']!.within_2x,
      tilt_within_3x: looRaw['+tilt']!.within_3x,
      global_median_log10_err: looRaw['flat']!.median_dex,
      global_within_2x: looRaw['flat']!.within_2x,
    },
    dedupe: {
      raw_n: validation.raw_n,
      families_n: validation.families_n,
      merged_families: merged.length,
      merged_rows: merged.reduce((s, f) => s + (f.members.length - 1), 0),
      tvl_added_usd: Math.round(tvlAdded),
    },
    fits: {
      raw_ols: { a: rawOls.a, b: rawOls.b },
      fam_ols: { a: famOls.a, b: famOls.b },
      fam_huber: { a: famHuber.a, b: famHuber.b },
      fam_trim: { a: famTrim.a, b: famTrim.b, kept: famTrim.kept, dropped: famTrim.dropped },
    },
    validation,
    bootstrap: { refits: BOOTSTRAP_REFITS, seed: BOOTSTRAP_SEED },
    params: {
      tilt: { shrink_k: MODEL.tilt_shrink_k, cap_dex: MODEL.tilt_cap_dex },
      growth: { weight: MODEL.growth_weight, floor_pct: MODEL.growth_floor, cap_pct: MODEL.growth_cap },
      maturity: { floor: MODEL.maturity_floor, range: MODEL.maturity_range, days: MODEL.maturity_days },
      launch_prob: { base: MODEL.base_launch_probability, clamp: [0.05, 0.95] },
    },
    farm: {
      deposit_usd: FARM_DEPOSIT_USD,
      airdrop_share: FARM_AIRDROP_SHARE,
      tbill_rate: FARM_TBILL_RATE,
      verdict_counts: { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 },
    },
  };
}

/** The two flagged long-shots: the largest-TVL pre-token protocols below the floor
 * that the strict filter sets aside. They demonstrate the filter instead of hiding
 * it; giants above the floor (CEX / bridge, $3.5B-$13.8B) are never ranked. */
function flaggedRows(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isStrictRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 2);
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..n.
 *
 * The strict pre-token universe (198 on this snapshot) is the whole board, watchlist
 * included, plus the 2 flagged long-shots below the floor — 200 rows. Implied values
 * are forced strictly decreasing so the ranking is a ranking, not a tie dressed up
 * as one.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, cal?: Calibration): BoardRow[] {
  const calibration = cal ?? fitCalibration(snapshot, model);
  const families = buildFamilies(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The strict universe: every pre-token protocol that could plausibly launch at all.
  for (const p of snapshot.protocols) {
    if (isStrictRankable(p)) chosen.set(p.slug, p);
  }
  // The flagged long-shots: the two largest sub-floor protocols the filter sets aside.
  for (const p of flaggedRows(snapshot)) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, v };
  });
  scored.sort(
    (a, b) =>
      b.v.implied - a.v.implied ||
      b.v.curve - a.v.curve ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );

  // Bootstrap bands + rank ranges over the sorted rows (seeded, deterministic).
  const bands = bootstrapBands(
    scored.map((s) => ({
      slug: s.p.slug,
      tvl_usd: s.p.tvl_usd,
      category: s.p.category,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      launch_prob: s.v.launchProb,
      growth_mult: s.v.growthMult,
      maturity_mult: s.v.maturityMult,
    })),
    families,
    snapshot.as_of,
    model,
  );

  // Force strictly decreasing implied values: a tie is not a ranking.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    let implied = Math.max(1, Math.round(s.v.implied));
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
    const band = bands.get(s.p.slug)!;
    const valueIfLaunched = implied / s.v.launchProb;
    const farm = farmEconomics(s.p, s.v.age, implied, valueIfLaunched, s.v.launchProb, band.band_low_usd, band.band_high_usd);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.v.age,
      implied_value_usd: implied,
      launch_score: Math.round(s.v.launchProb * 100),
      why: whyFor(s.p, s.v),
      model: {
        curve_value_usd: Math.round(s.v.curve),
        tilt_dex: round4(s.v.tiltDex),
        growth_pct: round4(s.v.growthPct),
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        launch_probability: round4(s.v.launchProb),
        category_token_rate: round4(s.v.categoryTokenRate),
        age_days: s.v.age,
      },
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
      band_low_usd: band.band_low_usd,
      band_high_usd: band.band_high_usd,
      rank_low: band.rank_low,
      rank_high: band.rank_high,
      farm_net_usd: farm.net_usd,
      farm_net_per_hour_usd: farm.net_per_hour_usd,
      farm_break_even_usd: farm.break_even_usd,
      farm_break_even_odds: farm.break_even_odds,
      farm_verdict: farm.verdict,
      farm_min_deposit_usd: farm.min_deposit_usd,
      launch_prob: round4(s.v.launchProb),
      curve_value_usd: Math.round(s.v.curve),
      nearest_comps: nearestComps(s.p, families),
      derivation: {
        curve_usd: Math.round(s.v.curve),
        tilt_mult: round4(s.v.tiltMult),
        growth_mult: round4(s.v.growthMult),
        maturity_mult: round4(s.v.maturityMult),
        launch_prob: round4(s.v.launchProb),
        value_if_launched_usd: Math.max(1, Math.round(valueIfLaunched)),
        implied_usd: implied,
      },
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The live-token anchors with their multiple and their position against the size curve. */
export function liveComps(snapshot: Snapshot, cal: Calibration): LiveCompRow[] {
  return liveRows(snapshot).map((p) => ({
    ...p,
    multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    curve_value_usd: Math.round(Math.pow(10, cal.size_a + cal.size_b * Math.log10(Math.max(1, p.tvl_usd)))),
  }));
}

/** The protocols the strict filter set aside, with each one's reason. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  const flagged = new Set(flaggedRows(snapshot).map((p) => p.slug));
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isStrictRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl_usd: p.tvl_usd,
      reason: strictBlockReason(p)!,
      on_board: flagged.has(p.slug),
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_score: row.launch_score,
    why: row.why,
    curve_value_usd: row.model.curve_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    band_low_usd: row.band_low_usd,
    band_high_usd: row.band_high_usd,
    rank_low: row.rank_low,
    rank_high: row.rank_high,
    farm_net_usd: row.farm_net_usd,
    farm_net_per_hour_usd: row.farm_net_per_hour_usd,
    farm_break_even_usd: row.farm_break_even_usd,
    farm_break_even_odds: row.farm_break_even_odds,
    farm_verdict: row.farm_verdict,
    farm_min_deposit_usd: row.farm_min_deposit_usd,
    launch_prob: row.launch_prob,
    nearest_comps: row.nearest_comps,
    derivation: row.derivation,
  };
}

/** The Method view's payload, built from the calibration's validation tables. */
export function buildMethod(cal: Calibration, board: BoardRow[]): MethodInfo {
  const v = cal.validation;
  const ablation: AblationRow[] = VARIANTS.filter((x) => x.name !== 'flat').map((x) => {
    const tests = [
      v.loo_fam.variants[x.name]!.median_dex,
      v.wf_forward.variants[x.name]!.median_dex,
      v.split_2024.variants[x.name]!.median_dex,
      v.wf_reverse.variants[x.name]!.median_dex,
      v.five_fold.variants[x.name]!.median_dex,
    ];
    return {
      variant: x.name,
      loo_raw_dex: v.loo_raw.variants[x.name]!.median_dex,
      loo_fam_dex: v.loo_fam.variants[x.name]!.median_dex,
      wf_forward_dex: v.wf_forward.variants[x.name]!.median_dex,
      split_2024_dex: v.split_2024.variants[x.name]!.median_dex,
      wf_reverse_dex: v.wf_reverse.variants[x.name]!.median_dex,
      five_fold_dex: v.five_fold.variants[x.name]!.median_dex,
      median_of_tests_dex: median(tests),
      loo_fam_within_2x: v.loo_fam.variants[x.name]!.within_2x,
    };
  });
  const flatTests = [
    v.loo_fam.variants['flat']!.median_dex,
    v.wf_forward.variants['flat']!.median_dex,
    v.split_2024.variants['flat']!.median_dex,
    v.wf_reverse.variants['flat']!.median_dex,
    v.five_fold.variants['flat']!.median_dex,
  ];
  const flat: AblationRow = {
    variant: 'flat',
    loo_raw_dex: v.loo_raw.variants['flat']!.median_dex,
    loo_fam_dex: v.loo_fam.variants['flat']!.median_dex,
    wf_forward_dex: v.wf_forward.variants['flat']!.median_dex,
    split_2024_dex: v.split_2024.variants['flat']!.median_dex,
    wf_reverse_dex: v.wf_reverse.variants['flat']!.median_dex,
    five_fold_dex: v.five_fold.variants['flat']!.median_dex,
    median_of_tests_dex: median(flatTests),
    loo_fam_within_2x: v.loo_fam.variants['flat']!.within_2x,
  };
  const counts: Record<FarmVerdict, number> = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (const row of board) counts[row.farm_verdict]++;
  return {
    model_version: MODEL_VERSION,
    formula: 'implied = curve x 10^tilt x growth x maturity x launchProb; curve = 10^(a + b x log10 TVL), Huber fit on one-per-ticker families',
    curve: { a: cal.size_a, b: cal.size_b, fit: `Huber IRLS k=${HUBER_K} on ${cal.dedupe.families_n} families` },
    dedupe: cal.dedupe,
    fits: cal.fits,
    ablation,
    flat_dex: flat,
    selection: {
      chosen: 'full',
      rule: 'Production is the variant with the lowest median error across the five family-based blind tests (LOO families, walk-forward forward, split 2024, walk-forward reverse, five-fold). Full wins at 0.510 dex vs curve 0.528, +growth 0.526, +maturity 0.528.',
      optimism_note:
        'The same 128 families select the winner and report its numbers, so the LOO and walk-forward figures are mildly optimistic for the winner. There is no untouched holdout set beyond these 128 families; the five-fold numbers are a supplementary check on the same set, not an independent one.',
      keep_drop: [
        {
          term: 'tilt (category, shrunk k=8, cap +/-0.30 dex)',
          decision: 'KEPT, as part of the full combination',
          evidence:
            'Alone it is neutral: LOO families 0.539 vs curve 0.538 dex, walk-forward forward 0.522 vs 0.522, split 0.521 vs 0.521, but walk-forward reverse 0.547 vs 0.528. The full combination that includes it is the best on 4 of 5 tests, so the term stays — as a combination, not on its own merit.',
        },
        {
          term: 'growth (1 + 0.5 x clamp(change_7d, -30, +60)%)',
          decision: 'KEPT',
          evidence:
            'Better than or equal to the curve on all five tests: LOO 0.535 vs 0.538, WF forward 0.500 vs 0.522, split 0.517 vs 0.521, WF reverse 0.526 vs 0.528, five-fold 0.546 vs 0.547 dex. A grid over the weight (0 to 1.0) moves the median-of-tests by 0.004 dex — no tuning win, so the v1 weight 0.5 stands.',
        },
        {
          term: 'maturity (0.6 + min(age, 1095)/1095 x 0.4)',
          decision: 'KEPT',
          evidence:
            'Better than the curve on four of five tests: LOO 0.535 vs 0.538, WF forward 0.488 vs 0.522, split 0.481 vs 0.521, five-fold 0.546 vs 0.547 dex; WF reverse equal at 0.528.',
        },
      ],
    },
    bootstrap: { refits: BOOTSTRAP_REFITS, seed: BOOTSTRAP_SEED },
    params: {
      tilt: { shrink_k: MODEL.tilt_shrink_k, cap_dex: MODEL.tilt_cap_dex },
      growth: { weight: MODEL.growth_weight, floor_pct: MODEL.growth_floor, cap_pct: MODEL.growth_cap },
      maturity: { floor: MODEL.maturity_floor, range: MODEL.maturity_range, days: MODEL.maturity_days },
      launch_prob: { base: MODEL.base_launch_probability, clamp: [0.05, 0.95] },
    },
    farm: {
      deposit_usd: FARM_DEPOSIT_USD,
      airdrop_share: FARM_AIRDROP_SHARE,
      tbill_rate: FARM_TBILL_RATE,
      gas_table: {
        ethereum: GAS_TABLE['ethereum']!,
        solana: GAS_TABLE['solana']!,
        default: GAS_DEFAULT,
      },
      verdict_counts: counts,
      verdict_rule:
        'ROBUST when the band low end already pays (net P25 > $0), FARM when the point estimate pays, THIN when only the band high end pays, SKIP otherwise. Nets are slice minus gas, bridge and the 4%/yr T-bill charge.',
    },
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const cal = fitCalibration(snapshot, model);
  const board = buildBoard(snapshot, model, cal);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const counts: Record<FarmVerdict, number> = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (const row of board) counts[row.farm_verdict]++;
  cal.farm.verdict_counts = counts;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration: cal,
    rows: board.map(radarRow),
    live,
    method: buildMethod(cal, board),
    set_aside: setAsideRows(snapshot),
    live_comps: liveComps(snapshot, cal),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
