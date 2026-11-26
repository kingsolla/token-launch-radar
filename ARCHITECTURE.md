# Architecture - radar-3 model

Pipeline: snapshot -> curve fit -> category tilt -> launch probability -> farm plan -> dashboard.

1. **Snapshot** - 198 pre-token protocols with traded-token comps.
2. **Curve fit** - log-log size curve fitted at run time to the snapshot's own traded tokens (Huber fit, one-per-ticker families, slope 0.575).
3. **Category tilt** - bounded, shrunk tilt per category.
4. **Launch probability** - transparent probability built from the snapshot's own token rates.
5. **Farm plan** - net dollars per row: slice minus gas, bridge, and a 4%/yr T-bill charge; break-even value, break-even launch odds, net per hour, ROBUST / FARM / THIN / SKIP verdict.
6. **Dashboard** - static, no-network page: sortable board, per-protocol detail, Method view with the full ablation table, and the 144 set-aside protocols with reasons.

Validation (blind-tested four ways): leave-one-out median error 0.531 dex (128 comps), walk-forward 0.470 dex vs 0.733 flat multiple, split-by-year 0.481 dex, five-fold 0.510 dex. A 200-refit bootstrap gives every row a P25-P75 value band and a P10-P90 rank range.
