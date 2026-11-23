# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/freddy354/tokenradar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/freddy354/tokenradar/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for the [token-radar-01](https://make.fun/bounty/token-radar-01) bounty: build the best token launch radar.

The program (`main.ts`, Node 22, standard library only) reads a sealed snapshot of the protocol universe, scores every rankable pre-token protocol by implied value, and writes a ranked board, a static web dashboard, screenshots, and a dossier.

## How it works

```
implied = round(TVL × categoryMultiple × growthMult × maturityMult × breadthMult)
```

- **categoryMultiple** — median mcap/TVL of live-token protocols in the same category, computed at runtime from the snapshot (never hand-picked).
- **growthMult / maturityMult / breadthMult** — from 7-day TVL change, protocol age, and chain count.

The board ranks 198 pre-token protocols (all 40 watchlist slugs plus 158 early-radar rows), each with 6 concrete farm steps. Top 5: Steakhouse Financial ($557.9M), Sentora Curator ($513.6M), Gauntlet ($332.3M), Veda ($319.5M), USDD ($201.5M).

## Run it

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Reads `/input/snapshot.json` by default and writes `board.json`, `dashboard/` (with generated `data.js`), `screenshots/`, and `dossier.json` to the output directory. Deterministic, ~0.3s.

## Layout

- `main.ts` — entrypoint: read snapshot, build board, copy dashboard + screenshots, write dossier
- `lib/model.ts` — ranking model, board builder, farm steps
- `vendor/makefun-board.ts` — dossier builder (kit library, byte-identical)
- `dashboard/` — static page (no network): `index.html`, `app.css`, `app.js`
- `screenshots/` — dashboard screenshots (1440×900)
