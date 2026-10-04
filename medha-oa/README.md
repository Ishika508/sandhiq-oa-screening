# SANDHIQ — AI-Assisted Osteoarthritis Screening Platform

A fully offline-first, multimodal OA screening web app built with **Next.js 14 + Tailwind CSS**.
Everything — patients, screenings, accounts — is stored in the browser's IndexedDB (via Dexie),
so the app needs **zero backend/database setup** and deploys to Vercel as-is.

## What's actually working right now

### v2 update — design overhaul + new CV tests

- **Glassmorphism UI** — replaced the earlier flat theme with translucent/blurred glass panels, gradient dark sidebar, no emoji anywhere (all icons are `lucide-react`)
- **Collapsible desktop sidebar** (persists your choice) + a proper off-canvas mobile drawer with a hamburger menu — fully responsive down to phone widths
- **Real multilingual switching** — `lib/i18n/` implements a working language context (English, Hindi, Assamese, Nagamese) with a switcher in both the top bar and Settings. English and Hindi are translated in full, including the long WOMAC/FIHOA question text. Assamese and Nagamese cover all interface chrome (nav, buttons, titles, instructions); the long clinical questionnaire item lists intentionally fall back to English for those two languages rather than risk incorrect medical phrasing — see the note at the top of `lib/i18n/dictionary.js` for exactly what still needs a native clinical translator.
- **WOMAC and FIHOA are now one-question-at-a-time flows** with a progress bar, matching how the original MEDHA HTML mockups guided a health worker step-by-step, instead of one long scrolling form
- **Hand assessment reference "images"** are now schematic SVG illustrations (see `components/steps/HandIllustration.js`) instead of emoji placeholders — still clearly labeled as illustrative, with a note to swap in real clinical reference photographs before deployment
- **CV module rewritten as a strict sequential flow**: Chair Stand → Gait → **TUG (new)** → **Knee ROM (new)** → Balance, one test at a time with per-test instructions (matching the "ask the patient to..." style from the original MEDHA HTML), a live hospital-monitor-style scrolling signal trace during recording, and a live knee-angle readout during the ROM test
- **IMU step now shows a live oscilloscope-style vibration waveform** (`components/steps/VibrationMonitor.js`) instead of just numbers — synthetic/preview trace until real hardware is wired in
- **Report and Review steps now include a radar chart** (per-domain severity) and a **WOMAC subscale bar chart**, in addition to the existing risk-distribution pie chart on the dashboard


| Feature | Status |
|---|---|
| Login / Signup (device-local accounts) | ✅ Fully working |
| Patient registration, search, history, trend chart | ✅ Fully working |
| Screening wizard (8 steps, save-as-you-go, resumable) | ✅ Fully working |
| WOMAC questionnaire (knee/hip) — full 24-item form + scoring | ✅ Fully working |
| FIHOA questionnaire (hand) — full 10-item form + scoring | ✅ Fully working |
| Hand visual/nodal assessment — voice-guided (Web Speech API) + reference images + manual severity picker | ✅ Fully working (automated CV is a documented future step — see ML_GUIDE.md) |
| Pull-force (rope-pull) test — load-cell sensor mode + manual/force-gauge fallback | ✅ Manual entry fully working; the sensor path needs a wired HX711 (see ML_GUIDE.md) |
| IMU — live / simulated / manual modes | ✅ All three working: live ESP8266 nodes score a real 8 s trial when they reach the gateway; simulated and manual are the fallbacks |
| Camera/CV module — **real** in-browser pose detection (TensorFlow.js MoveNet), chair-stand rep counting, gait tracking, balance sway, SPPB scoring | ✅ Fully working, both camera modes |
| Laptop camera mode | ✅ Fully working (getUserMedia) |
| Radxa camera mode | ✅ UI + pose pipeline fully working against any MJPEG/WebRTC URL you point it at; the actual camera-serving script on the Radxa is yours to add (see ML_GUIDE.md) |
| X-ray upload + KL-grade step | ✅ Real inference: EfficientNet-B0, 30% original / 70% horizontal-flip TTA, plus a Grad-CAM overlay served from the same local model |
| Multimodal fusion engine (dual weight-set: with/without X-ray) | ✅ Fully working, matches the project's design-doc weighting |
| Report generation (printable/PDF via browser print) | ✅ Fully working |
| Offline support (service worker + IndexedDB) | ✅ Fully working — try it: load the app once, then turn off Wi-Fi |
| PWA install ("Add to Home Screen") | ✅ Working (manifest + icons included, replace icons with your own branding) |
| Multilingual UI (Assamese, Nagamese, Hindi, English) | 🟡 Interface chrome is translated in all four languages; the long clinical questionnaire item text falls back to English for Assamese and Nagamese until a native clinical translator reviews it |
| Awareness/preventive guidance | ✅ Static content included on the report page |

## Quick start (local)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on the login page. Click "Create an account" to make
the first health-worker login on this device, then register a patient and start a screening.

## Deploying to Vercel

This app needs **no environment variables and no database provisioning** — that's intentional.

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import the repo
3. Framework preset: Next.js (auto-detected) — click Deploy

That's it. Because all data lives client-side in each browser, there's nothing else to configure.

## Project structure

```
app/                    Next.js App Router pages
  login/, signup/       Auth pages
  dashboard/            Overview + stats
  patients/             List, new, and [id] detail/history
  screening/[id]/       The 8-step screening wizard
  report/[id]/          Printable final report
  settings/             Language + data management
components/
  AppShell.js           Sidebar layout, used on every authenticated page
  AuthGuard.js           Redirects to /login if no session
  steps/                 One component per wizard step (Womac, Fihoa, Hand, Grip, Imu, Cv, Xray, Review)
lib/
  db.js                  Dexie (IndexedDB) schema + all data access functions
  auth.js                Client-side signup/login/session (see security note below)
  fusion.js              The multimodal weighted-scoring engine
  womac.js / fihoa.js    Questionnaire definitions + scoring
  pose/poseEngine.js     TensorFlow.js MoveNet wrapper + chair-stand/gait/balance trackers + SPPB scoring
```

## Security note — read before real deployment

Because there's no server, "login" here means "unlock this browser", not authentication against
a secure identity provider. Passwords are SHA-256 hashed with a per-user salt before storage (see
`lib/auth.js`) — better than plaintext, but **not** the same guarantee as bcrypt/argon2 + a real
backend. This is a deliberate trade-off for an offline single-device MVP. Before handling real
patient data at scale, see "Scaling beyond a single device" below.

## Scaling beyond a single device

Right now each browser/device is its own island of data — great for offline field use, limiting
for a multi-worker clinic that wants shared patient records. When you're ready:

1. Stand up a real backend (e.g. a small Postgres + REST/GraphQL API, or Supabase/Firebase)
2. Swap `lib/db.js`'s functions for API calls (the function signatures are already the shape
   your UI expects — patients, screenings, steps — so this is a drop-in swap, not a rewrite)
3. Swap `lib/auth.js` for NextAuth.js or your hospital's SSO
4. Use the already-scaffolded `syncQueue` table in `lib/db.js` to queue local writes made while
   offline, and flush them to the server when connectivity returns

## Adding a language

The translation layer is already wired up in `lib/i18n/`:

1. Add the language code to `LANGUAGES` in `lib/i18n/dictionary.js`
2. Add a matching entry in that file (and, if the app-level extras live elsewhere, merge it in
   the way `dashboardExtra` and the `assistant`/`report` blocks already are)
3. New strings need a `t("key")` call at the point of use — anything still hardcoded in
   `components/steps/*.js` is untranslated, and `npm run i18n:audit` lists exactly which

`localStorage.getItem("medha_oa_lang")` persists the selection. The remaining gap is clinical
wording: the long WOMAC/FIHOA item text still needs a native clinical translator for Assamese and
Nagamese rather than a machine guess.

## See also

- `ML_GUIDE.md` — exactly where and how to plug in your trained X-ray model, wire up the
  grip/IMU sensors from your Radxa+ESP32 hardware, and what packet formats the placeholders expect.
