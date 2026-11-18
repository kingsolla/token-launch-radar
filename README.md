# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kingsolla/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kingsolla/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token protocols by implied launch value — value-if-launched times launch chance — with a farm plan netted to the dollar for each row. The model (radar-3) fits its own log-log size curve to the snapshot's traded tokens at run time (Huber fit on one-per-ticker families, slope 0.575), adds a bounded, shrunk category tilt, and weights the value by a transparent launch probability built from the snapshot's own token rates. Validation is blind-tested four ways: leave-one-out median error 0.531 dex on 128 comps, walk-forward forward 0.470 dex vs 0.733 for a flat multiple, split-by-year 0.481 dex, five-fold 0.510 dex; a 200-refit bootstrap gives every row a P25–P75 value band and a P10–P90 rank range. Each farm plan is net dollars — slice minus gas, bridge and a 4%/yr T-bill charge — with a break-even value, break-even launch odds, net per hour, and a ROBUST / FARM / THIN / SKIP verdict (110 / 15 / 12 / 63 at a $1,000 deposit). The dashboard is a static, no-network page: a sortable, filterable board, a detail view per protocol, a Method view with the full ablation table, the 144 set-aside protocols with reasons, and three screenshots.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=66g3b6zn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
