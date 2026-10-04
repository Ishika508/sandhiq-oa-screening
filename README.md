# SANDHIQ

**SANDHIQ — AI-assisted osteoarthritis screening.** Repository root for the SANDHIQ web app and
its demo material.

| Path | What it is |
|---|---|
| `medha-oa/` | The Next.js 14 app (source folder name predates the rebrand) |
| `medha-oa/README.md` | Start here — feature status, quick start, deployment, architecture notes |
| `medha-oa/docs/SYSTEM.md` | Full system reference: wizard, data model, fusion, report pipeline |
| `medha-oa/docs/SENSORS.md` | IMU node + Radxa wiring, relay setup, HX711 load-cell diagnostics |
| `medha-oa/ML_GUIDE.md` | How the local X-ray model service fits in, and the sensor payloads it expects |
| `medha-oa/AI_ASSISTANT_SETUP.md` | The optional offline Ollama assistant |
| `YOUTUBE_SCRIPT.md` | Full narrated demo script, scene by scene (source of truth — export to PDF yourself if you want a copy) |

## Run it

```bash
cd medha-oa
npm install
npm run ml:serve   # separate shell — local X-ray model service on port 8000
npm run dev        # http://localhost:3000
```

Copy `medha-oa/.env.example` to `medha-oa/.env.local` to change any setting. Data lives in the
browser (IndexedDB via Dexie), so there is no database to provision.

## What is not in this repository

- Model weights (`.keras`) and the Python virtualenv — kept outside the repo and referenced via
  `MEDHA_DEPLOY_ROOT` / `MEDHA_MODEL_PATH`
- `node_modules/`, `.next/`, `.env.local`

## Clinical status

Screening aid, not a diagnostic device. Thresholds, fusion weights and the KL grading model are
engineering starting points pending clinical validation; the X-ray model reached 60.6% accuracy on
1,656 held-out radiographs with 7.4% recall at KL1. Every generated report prints its own
limitations. See `medha-oa/README.md` for the security and scaling caveats before using it with
real patient data.
