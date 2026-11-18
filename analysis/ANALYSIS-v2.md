# Token Radar v2 — Analysis (radar-3, 18 Nov 2026)

Model: `implied = curve x 10^tilt x growth x maturity x launchProb`, curve = Huber IRLS
(k = 1,345) log-log fit on one-per-ticker families. All numbers below are computed at
run time from the sealed snapshot (`as_of` 2026-11-14, 758 protocols) and are carried
in `data.js` (`calibration.validation`, `method.ablation`). Units are dex (log10)
unless stated; 1 dex = 2,303 ln, x3,40 = 0,531 dex.

## 1. Dedupe + robust fit (sebelum/sesudah)

| Fit | n | a (intercept) | b (slope) |
|---|---|---|---|
| OLS, comps mentah (metode v1) | 128 | 3,0247 | 0,5223 |
| OLS, famili | 128 | 2,8593 | 0,5423 |
| **Huber IRLS k=1,345, famili (produksi)** | **128** | **2,6199** | **0,5752** |
| Trimmed OLS (residual > 2,5 MAD dibuang, 5 dari 128) | 123 | 2,3289 | 0,6085 |

Dedupe: 128 comps mentah -> 128 famili (kunci `gecko_id ?? symbol`, TVL dijumlah,
mcap = max, `listed_at` paling awal). Jumlah tidak bergerak karena snapshot ini tidak
punya `gecko_id` duplikat — tapi 2 famili menggabungkan beberapa baris: **aave**
(v1/v2/v3/v4/horizon, 5 baris, TVL $90,9M -> $15,46B, +$1,10B) dan **sushi**
(sushiswap/v3/stellar, 3 baris, TVL $31,7M -> $83,6M, +$47,5M). Total TVL yang
ditambahkan penggabungan: $1.150.051.622. Dampak terbesar: aave berhenti menjadi
protokol TVL $91M dengan token $1,7B (outlier +2,0 dex di fit OLS mentah) dan menjadi
protokol $15,46B sebagaimana mestinya.

Catatan jujur: estimasi desain "~92-94 famili" salah untuk snapshot ini — yang benar
128, karena duplikasi hanya terjadi lewat baris `symbol`-only yang simbolnya sama
dengan `gecko_id` lain (aave, sushi). Dedupe tetap dipertahankan karena membetulkan
titik-titik itu, bukan karena mengubah n.

## 2. Balapan varian di lima blind test (median |log10 err| dex; dalam 2x / dalam 3x)

LOO mentah = OLS refit per fold, n = 128 (metode v1, pembanding langsung).
LOO famili / WF / split / five-fold = Huber refit per fold, n = 128 famili
(97 di antaranya punya `listed_at`: WF train 58 / test 39; split train 46 pre-2024 /
test 51 2024+; 31 famili tanpa tanggal tidak ikut tes berbasis waktu).

### LOO mentah (n = 128, OLS)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,531 | 3,40 | 32,0% | 42,2% |
| +tilt | 0,544 | 3,50 | 32,0% | 44,5% |
| +growth | 0,532 | 3,40 | 32,8% | 43,8% |
| +maturity | 0,531 | 3,40 | 30,5% | 43,8% |
| +growth+maturity | 0,538 | 3,45 | 30,5% | 45,3% |
| full | 0,546 | 3,52 | 28,1% | 46,1% |
| flat multiple | 0,705 | 5,07 | 28,1% | 35,2% |

### LOO famili (n = 128, Huber)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,538 | 3,45 | 28,1% | 43,0% |
| +tilt | 0,539 | 3,46 | 30,5% | 43,8% |
| +growth | 0,535 | 3,43 | 26,6% | 44,5% |
| +maturity | 0,535 | 3,43 | 28,1% | 46,1% |
| +growth+maturity | 0,533 | 3,41 | 28,1% | 46,9% |
| **full** | **0,531** | **3,40** | **29,7%** | **46,9%** |
| flat multiple | 0,691 | 4,91 | 28,9% | 36,7% |

### Walk-forward forward, expanding-window (train 58, test 39)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,522 | 3,33 | 25,6% | 46,2% |
| +tilt | 0,522 | 3,33 | 25,6% | 48,7% |
| +growth | 0,500 | 3,16 | 23,1% | 43,6% |
| +maturity | 0,488 | 3,08 | 23,1% | 48,7% |
| +growth+maturity | 0,537 | 3,44 | 23,1% | 48,7% |
| **full** | **0,470** | **2,95** | **25,6%** | **51,3%** |
| flat multiple | 0,733 | 5,41 | 17,9% | 28,2% |

### Split pre-2024 / 2024+ (train 46, test 51)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,521 | 3,32 | 33,3% | 49,0% |
| +tilt | 0,521 | 3,32 | 33,3% | 49,0% |
| +growth | 0,517 | 3,29 | 31,4% | 49,0% |
| +maturity | 0,481 | 3,03 | 27,5% | 47,1% |
| +growth+maturity | 0,481 | 3,03 | 25,5% | 49,0% |
| **full** | **0,481** | **3,03** | **27,5%** | **49,0%** |
| flat multiple | 0,716 | 5,20 | 25,5% | 35,3% |

### Walk-forward reverse (train 58 token terbaru, test 39 terawal)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,528 | 3,37 | 23,1% | 35,9% |
| +tilt | 0,547 | 3,52 | 23,1% | 35,9% |
| +growth | 0,526 | 3,36 | 23,1% | 41,0% |
| +maturity | 0,528 | 3,37 | 23,1% | 35,9% |
| +growth+maturity | 0,526 | 3,36 | 23,1% | 41,0% |
| full | 0,549 | 3,54 | 23,1% | 38,5% |
| flat multiple | 0,622 | 4,19 | 35,9% | 41,0% |

### Five-fold by slug (n = 128, supplementary)

| varian | median dex | x | dalam 2x | dalam 3x |
|---|---|---|---|---|
| curve | 0,547 | 3,52 | 27,3% | 43,8% |
| +tilt | 0,549 | 3,54 | 32,0% | 45,3% |
| +growth | 0,546 | 3,52 | 26,6% | 43,0% |
| +maturity | 0,546 | 3,52 | 26,6% | 46,1% |
| +growth+maturity | 0,547 | 3,52 | 26,6% | 46,9% |
| **full** | **0,510** | **3,24** | **30,5%** | **46,1%** |
| flat multiple | 0,693 | 4,93 | 29,7% | 35,9% |

## 3. Tabel ablation (median dex per tes; median-of-5 = median lima tes berbasis famili)

| varian | LOO mentah | LOO famili | WF forward | split 2024 | WF reverse | five-fold | median-of-5 |
|---|---|---|---|---|---|---|---|
| curve | 0,531 | 0,538 | 0,522 | 0,521 | 0,528 | 0,547 | 0,528 |
| +tilt | 0,544 | 0,539 | 0,522 | 0,521 | 0,547 | 0,549 | 0,539 |
| +growth | 0,532 | 0,535 | 0,500 | 0,517 | 0,526 | 0,546 | 0,526 |
| +maturity | 0,531 | 0,535 | 0,488 | 0,481 | 0,528 | 0,546 | 0,528 |
| +growth+maturity | 0,538 | 0,533 | 0,537 | 0,481 | 0,526 | 0,547 | 0,533 |
| **full** | 0,546 | **0,531** | **0,470** | **0,481** | 0,549 | **0,510** | **0,510** |
| flat multiple | 0,705 | 0,691 | 0,733 | 0,716 | 0,622 | 0,693 | 0,693 |

Aturan seleksi (ditetapkan sebelum melihat tabel): produksi = varian dengan median
error terendah di median-of-5. **Pemenang: full (0,510 dex)**, terbaik di 4 dari 5
tes (LOO famili, WF forward, split 2024, five-fold) dan terburuk di WF reverse
(0,549 vs curve 0,528). Margin atas curve hanya 0,016-0,018 dex — kecil, dan
dilaporkan sebagai kecil. Tidak ada varian yang mendominasi di semua tes; perbedaan
antar varian (0,01-0,03 dex) berada dalam noise sampel n = 39-128.

### Keputusan keep/drop per istilah

- **tilt — DIPERTAHANKAN sebagai bagian dari kombinasi full.** Sendirian ia netral
  sampai negatif: LOO famili 0,539 vs curve 0,538; WF forward 0,522 vs 0,522; split
  0,521 vs 0,521; WF reverse 0,547 vs 0,528 (lebih buruk); five-fold 0,549 vs 0,547.
  Yang dipertahankan adalah kombinasinya, bukan istilahnya sendiri — kombinasi full
  adalah yang terbaik di 4 dari 5 tes. Alasan kedua: sinyal kategori adalah yang
  diminta kriteria 2 juri, dan tilt yang di-shrink (k=8) + cap ±0,30 dex tidak bisa
  merusak nilai sendirian.
- **growth — DIPERTAHANKAN.** Lebih baik dari atau sama dengan curve di kelima tes:
  LOO 0,535 vs 0,538; WF forward 0,500 vs 0,522; split 0,517 vs 0,521; WF reverse
  0,526 vs 0,528; five-fold 0,546 vs 0,547. Grid atas bobot growth (0 / 0,25 / 0,5 /
  0,75 / 1,0) menggerakkan median-of-5 hanya 0,507-0,511 dex — datar, tidak ada
  kemenangan tuning — jadi bobot v1 (0,5) dipertahankan.
- **maturity — DIPERTAHANKAN.** Lebih baik dari curve di 4 dari 5 tes: LOO 0,535 vs
  0,538; WF forward 0,488 vs 0,522; split 0,481 vs 0,521; five-fold 0,546 vs 0,547;
  WF reverse sama (0,528).
- **Grid tilt k** (3 / 6 / 8 / 12 / 20, model full): median-of-5 0,512 / 0,517 /
  0,510 / 0,524 / 0,522 — juga datar; k=8 v1 dipertahankan.

### Pengakuan optimism seleksi (wajib dibaca)

128 famili yang sama memilih pemenang DAN melaporkan angkanya, jadi angka LOO/WF
di atas bersifat **mildly optimistic untuk pemenang**. Tidak ada holdout set yang
belum tersentuh di luar 128 famili ini; five-fold (full 0,510 dex) adalah cek
supplementary pada set yang sama, bukan set independen. Angka yang paling bisa
dipercaya sebagai "di luar sampel" adalah WF forward (0,470 dex, n=39) — dan itu
pun memakai famili yang sama untuk memilih varian. Jangan kutip 0,470 atau 0,510
dex sebagai akurasi yang dijamin di token berikutnya.

## 4. Perbandingan jujur vs v1 — target TIDAK tercapai di LOO

Target desain: LOO median err < 0,531 dex DAN % dalam 2x > 32%.

| | v1 (curve, OLS mentah, n=128) | v2 produksi (full, Huber famili, n=128) |
|---|---|---|
| LOO median err | **0,531 dex** (x3,40) | **0,531 dex** (x3,40) — tepatnya 0,5314 |
| dalam 2x | **32,0%** | **29,7%** |
| dalam 3x | 42,2% | 46,9% |

**Target tidak tercapai:** median seri dengan v1 sampai 3 desimal (0,5314 vs 0,531),
dalam-2x 2,3 poin lebih rendah. Penyebabnya, sejujur yang bisa diukur:

1. Dispersi yang tidak bisa direduksi mendominasi. Residual sd kurva ~0,90 dex;
   median error 0,53 dex adalah cerminan sebaran itu, bukan kekurangan fit. Dedupe +
   Huber menggeser kurva (slope 0,5223 -> 0,5752) dan memperbaiki ekor
   (dalam-3x 42,2% -> 46,9%) serta WF, tapi tidak mengecilkan median LOO.
2. Perbedaan dalam-2x 2,3 poin pada n=128 adalah ~0,6 standard error
   (SE ~4 poin untuk p ~0,30) — noise, bukan kemunduran yang terbukti.
3. Grid hiperparameter (bobot growth 0-1,0; tilt k 3-20) datar: tidak ada setting
   yang mengalahkan default v1 di blind test. Mengejar target dengan tuning di
   sampel sekecil ini berarti meng-overfit noise — jadi tidak dilakukan.

Yang v2 tambah dan v1 tidak punya — dan ini yang dikejar desain, bukan LOO yang
lebih kecil: WF forward 0,470 dex vs flat 0,733 (kurva mengalahkan flat multiple
dengan 0,26 dex di luar waktu); split-2024 0,481 vs flat 0,716; five-fold 0,510 vs
flat 0,693; bootstrap band + rank range di semua 200 baris; farm economics yang
dinetted ke dolar (v1: nol); daftar set-aside 144 + alasan; bukti per baris
(derivation + 3 nearest comps). LOO yang seri adalah harga yang dibayar untuk
kejujuran: modelnya tidak menjadi lebih presisi, buktinya yang menjadi lebih lengkap.

## 5. Bootstrap 200 refit (seed 20261114)

- Band nilai P25-P75 per baris: rasio P75/P25 median 1,38x (min 1,26x, maks 1,78x).
  Contoh baris 1 (usdd): implied $22,89M, band $18,75M-$26,59M.
- Rank range P10-P90: lebar median 26 rank (maks 74). Hanya 1 dari 200 baris
  (abstract, rank 184) yang rank titiknya jatuh 1 di luar rentang P10-P90-nya
  (173-183) — wajar untuk interval 80%.
- Band dipakai untuk verdict farm (lihat §6), bukan untuk pajangan.

## 6. Farm economics (deposit standar $1.000)

Rumus: slice = deposit/(TVL+deposit) x 10% x implied; biaya = gas + bridge rantai
termurah (ETH $6/$12, Solana $0,05/$2, default $1/$2,50) + T-bill 4%/thn atas hold
(30/45/60 hari menurut umur); net = slice - biaya; net/jam = net / menit aktif
(5 + 15 + 10 x minggu hold + 10 + 15). Break-even dua arah: implied minimal
(value-if-launched yang menutup biaya) dan break-even odds (P(launch) minimal yang
menutup biaya — tanpa menebak P). minDeposit = akar positif terkecil dari
r·d^2 + (C0 + r·TVL - 0,1·implied)·d + C0·TVL = 0; null bila tidak ada deposit
yang pernah impas.

Verdict dari band (bukan titik): ROBUST bila net di ujung bawah band > $0; FARM
bila net titik > $0; THIN bila hanya ujung atas band > $0; SKIP bila tidak ada.

| Verdict | Jumlah (dari 200) |
|---|---|
| ROBUST | 110 |
| FARM | 15 |
| THIN | 12 |
| SKIP | 63 |

Pola yang muncul — dan ini temuan, bukan bug: 29 dari 40 baris teratas adalah SKIP,
sementara baris menengah (rank 41-160) mayoritas ROBUST (88 dari 120). Raksasa TVL
terdilusi sampai slice-nya ($0,50-$5) kalah dari biaya ($7-$21); protokol menengah
(TVL $10-50M, implied $1-5M) memberi slice $10-$20 dengan biaya yang sama. Biaya
rantai juga membedakan: baris Ethereum seukuran baris Solana bisa SKIP sementara
yang Solana ROBUST (gas+bridge $18 vs $2,05). Net > $0: 125 baris. minDeposit null
(tidak ada deposit yang impas): 33 baris. Break-even odds > 1 (tidak impas bahkan
bila launch pasti): 9 baris.

Verifikasi solver (brute-force atas semua 200 baris): minDeposit 167 baris tepat
(net(d) >= 0, net(d-1) < 0), 33 null benar (net puncak < 0 di grid deposit),
break-even dan break-even odds tepat (net ≈ $0, toleransi $0,05) di semua baris.

## 7. Board

200 baris = 198 universe strict + 2 flagged long-shot (aturan yang diturunkan,
bukan hardcode: 2 protokol pre-token non-strict terbesar di bawah floor $50M —
txflow-bridge $47,0M rank #199, starknet-btc-staking $46,6M rank #193 — keduanya
SKIP, launch score 5 dan 10). Watchlist 40/40. Early 160. Live 24 anchor.
Set-aside: 144 pre-token non-strict dengan alasan masing-masing (Bridge 28, CEX 42,
Liquid Staking 38, Canonical Bridge 15, versioned 11, wrapped/staked word 5,
Restaked BTC 2, Liquid Restaking 3).

Top-5: usdd $22,89M; steakhouse-financial $21,94M; sentora-curator $21,06M;
bittensor-dtao $20,64M; veda $20,10M. Launch probability dipertahankan dari v1
(0,55 x faktor kategori x umur x growth + hard block), tidak diubah.

## 8. Verifikasi

- `main.ts` 2 run: output byte-identik (board.json, data.js, dashboard, screenshots,
  dossier.json). Runtime ~1,2 detik (batas 120 detik).
- Cek lokal 11/11 lolos: dashboard_files, board_file (200 baris), sorted_by_value,
  coverage 40/40, farm_steps, v2 contract fields (semua 14 field baru di semua
  baris), board 545 KiB (< 8 MiB), screenshots 3x 1440x800 @ 187-204 KiB,
  dossier_matches (byte-identik dengan buildDossier, 876.517 byte < 1,5 MiB),
  data.js method/set_aside/live_comps (ablation 6 baris, set-aside 144, live 24).
- Derivation: produk faktor (dengan pembulatan 4 desimal) vs implied menyimpang
  maks 0,032% di semua baris.
- Yang belum lolos: target LOO (lihat §4) — median seri 0,531 dex, dalam-2x 29,7%
  di bawah 32%. Dilaporkan apa adanya; bukan dipoles.
