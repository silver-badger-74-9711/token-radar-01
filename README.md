# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/silver-badger-74-9711/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/silver-badger-74-9711/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, ranks the 614 that record no token yet by implied value, and hands the reader a dashboard with a farm plan for every one of them. All 40 watchlist protocols (TVL at or above $50M, no token recorded) are covered, plus the earlier protocols below the floor that a radar exists to find.

The implied value is a comparables model built only from the snapshot's own figures: each protocol's TVL is multiplied by the median market-cap/TVL multiple of the already-tokenized protocols in its category (the global median when a category has fewer than four tokenized peers, the multiple bounded to 0.02-2.0), then adjusted by its 7-day TVL momentum, its maturity (how long it has run with no token) and its chain breadth. Protocols whose token already trades are the comparables, never entries on the board. The dashboard shows the full board with search, category and watchlist filters, sorting, and a detail view per protocol with the exact model breakdown and a five-step farm plan with costs and times.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json` and the dashboard data to the output directory, copies in `dashboard/` and `screenshots/`, and writes `dossier.json` last. Two runs of the same snapshot write byte-identical output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6187e239&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
