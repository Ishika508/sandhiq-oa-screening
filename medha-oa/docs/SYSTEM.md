# SANDHIQ — System Overview

Complete reference for the whole screening system: the web app, the Python
service, the hardware, the network topology, and the known limitations.

> **Not a medical device.** Every screening output is an estimate to be reviewed
> by a qualified healthcare professional. Nothing here is a diagnosis.

---

## 1. What the system is

SANDHIQ is an osteoarthritis screening tool for knee, hand and function. It
combines validated self-report questionnaires, hand radiographs, grip strength,
wearable IMU motion data, and a camera-based movement check into one report.

Two processes:

| Process | Stack | Port | Role |
|---|---|---|---|
| **Web app** | Next.js 14 App Router, React 18, Tailwind | `3000` | UI, auth, IndexedDB storage, PDF report |
| **ML / gateway service** | Python, Flask, TensorFlow/Keras | `8000` | ML inference, IMU reception + scoring, grip |

They talk over **HTTP on loopback only**. Neither is exposed to the network
except the UDP sensor ports described in §5.

---

## 2. Repository layout

```
medha-oa/
├── app/                      Next.js App Router
│   ├── page.js               landing
│   ├── login/ signup/        auth
│   ├── dashboard/            overview
│   ├── patients/             list, new, [id] detail
│   ├── screening/[id]/       the 8-step wizard  <-- main workflow
│   ├── report/[id]/          PDF report view
│   ├── settings/
│   └── api/imu/route.js      proxy -> ML :8000
│   └── api/grip/route.js     proxy -> ML :8000
├── components/
│   ├── ImageLightbox.js      portal-based image viewer (Esc, arrows, focus trap)
│   └── steps/                one component per screening step
├── lib/                      domain logic + server-only helpers
│   ├── auth.js db.js         auth, IndexedDB (Dexie)
│   ├── fihoa.js womac.js bmi.js
│   ├── fusion.js             combines step results into the report model
│   ├── reportModel.js        report assembly
│   ├── reportPdf.js          jsPDF layout
│   └── handReference.js      hand OA reference image manifest
├── ml/                       Python service
│   ├── server.py             Flask app + gateway startup + HTTP routes
│   ├── sensor_gateway.py     UDP IMU receiver, HX711, optional relay
│   ├── imu_balance.py        vibration/jerk/sway DSP and risk scoring
│   ├── hx711_probe.py        standalone load-cell wiring diagnostic
│   └── live_udp_test.py      synthetic UDP sender for testing
├── public/images/hand/       8 hand reference images (+ SVG placeholders)
├── scripts/                  make_hand_placeholders.py, find-untranslated.js
└── docs/                     SENSORS.md (hardware), SYSTEM.md (this file)
```

---

## 3. Screening workflow

`app/screening/[id]/page.js` defines eight steps in order:

| # | Key | Step | Input method |
|---|---|---|---|
| 1 | `womac` | WOMAC | questionnaire (Likert, validated) |
| 2 | `fihoa` | FIHOA Hand Function Questionnaire | questionnaire |
| 3 | `hand` | Hand Visual / Nodal Assessment | nodal grade + image reference gallery |
| 4 | `grip` | Pull Force (Rope-Pull Tension Test) | **HX711 load cell**, or manual/force gauge |
| 5 | `imu` | Motion / Vibration | **ESP8266 IMUs**, or manual/simulated |
| 6 | `cv` | Camera | camera capture |
| 7 | `xray` | X-ray | image upload |
| 8 | `review` | Review + Report | assembles everything |

Each step POSTs its own JSON to `lib/db.js`; `lib/fusion.js` combines the saved
steps into the report, and `lib/reportPdf.js` renders it.

### Hand reference images

The Hand step (`components/steps/HandStep.js`) shows a reference gallery of four
grades × two modalities. It is an **orientation aid only** — the saved nodal grade
comes from the assessor's own grading, and FIHOA (step 2) separately scores hand
*function* from the questionnaire answers.

Files live in `public/images/hand/` and are looked up by exact lowercase name:

```
normal-xray.jpg   normal-hand.jpg
mild-xray.jpg     mild-hand.jpg
moderate-xray.jpg moderate-hand.jpg
severe-xray.jpg   severe-hand.jpg
```

Missing files fall back to a labelled `.svg` placeholder. Images under 500 px on
their short edge render at native size with a "supply a larger file" note rather
than being upscaled into blur.

---

## 4. Running it

Two terminals. The ML service must be up before the sensors will read as online.

```powershell
# terminal 1 - ML service + sensor gateway
npm run ml:serve          # python ml\server.py, binds 127.0.0.1:8000

# terminal 2 - web app
npm run dev               # http://localhost:3000
```

Health check:

```powershell
npm run ml:health         # GET http://127.0.0.1:8000/health
```

`.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `MEDHA_ML_URL` | `http://127.0.0.1:8000` | ML service base URL |
| `MEDHA_ML_TIMEOUT_MS` | `60000` | inference timeout |
| `OLLAMA_MODEL` | — | local LLM used for report prose |

> Do **not** run `npm run build` while `npm run dev` is serving — the build
> rewrites `.next` and the dev server starts returning 404. Stop dev, build,
> restart.

### ML HTTP routes

| Route | Purpose |
|---|---|
| `GET /health` | model + gateway status |
| `GET /metadata` | model input/output schema |
| `POST /predict` | ML inference |
| `GET /api/imu/status` | per-node frame counts, online/stale, last sample |
| `POST /api/imu/trial` | score the buffered trial |
| `GET /api/grip/status` | load cell state |

---

## 5. Hardware topology

```
  ESP8266 "thigh"  ──UDP 5005──┐
                                │
  ESP8266 "shank"  ──UDP 5006──┤──►  Radxa Cubie A7A  ──┐
                                │    (gateway + relay)    │  UDP relay
  HX711 + load cell ─GPIO 323/324┘                        │  (optional)
                                                            ▼
                                          PC  127.0.0.1:8000  (Flask)
                                          PC  127.0.0.1:3000  (Next.js)
```

### IMU packet

36 bytes, little-endian, `"<IIfffffff"`:

| Field | Type | Notes |
|---|---|---|
| `seq` | uint32 | frame counter |
| `ts_us` | uint32 | **must be masked** — `micros() & 0xFFFFFFFF` |
| `ax, ay, az` | float ×3 | m/s² |
| `gx, gy, gz` | float ×3 | °/s |
| `temp` | float | °C |

The gateway validates length **and** that `ts_us` advanced. A firmware bug where
`ts_us` exceeds 32 bits causes frames to be silently discarded, which looks
exactly like a dead sensor.

### Two ways to get data to the PC

**Option A — nodes send to the PC directly.** Point the ESP8266 firmware at the
PC's address. No relay needed.

**Option B — Radxa relays.** Keeps firmware pointed at the board, and survives
PC IP changes.

```bash
# on the Radxa only
MEDHA_GATEWAY_RELAY_HOST=<PC address the board can reach> \
MEDHA_GATEWAY_RELAY_PORT=5005 \
MEDHA_GATEWAY_RELAY_PORT_SHANK=5006 \
python3 sensor_gateway.py
```

Confirm the startup line names **both** ports:

```
[gateway] relaying frames upstream to 192.168.50.1 (sensor1->5005, sensor2->5006)
```

**The shank port must differ.** The upstream gateway identifies the leg purely by
the port a frame arrives on, so sending both nodes to one port logs every shank
frame as a thigh frame. That failure is subtle: the thigh counter climbs, both
nodes show ONLINE, and the thigh's live values flicker between the two legs'
orientations.

Set the relay on the **board only** — if both copies enable it, they forward to
each other forever. For persistence, put the exports in `~/.profile`.

### Choosing the PC address

A host often has several interfaces. The service prints all of them at startup:

```
[medha-ml] IMU nodes should target this PC: 10.62.140.193 (UDP 5005/5006)
[medha-ml] other local addresses, in case that one is on a subnet the sensors
           cannot route to: 192.168.50.1
```

`Network is unreachable` from the board means **no route to that subnet**, not a
firewall problem. Pin the correct one with `MEDHA_LAN_IP`.

---

## 6. Live value handling

This is the part that matters most in practice, because a frozen number next to a
"waiting" badge is indistinguishable from a live one.

- A node is **ONLINE** only while a frame arrived within `ONLINE_WINDOW_S` (5 s).
- A node that has gone quiet is marked **`stale`**, and its last values are shown
  dimmed and struck through with `stale — last packet Ns ago, not a live reading`.
- **Stale frames are never scored.** `buffered` drops to zero once the window
  elapses, and `POST /api/imu/trial` returns **HTTP 409 `NOT_ENOUGH_DATA`**
  rather than scoring an empty set.
- The gateway console prints `STALE — last captured N.Ns ago` for the same reason,
  and flushes each table so a redirected log does not appear frozen.
- The HX711 refuses to report a grip force when the data line returns a constant
  value, rather than printing a fabricated `0.0 kg`.

---

## 7. IMU scoring

`ml/imu_balance.py`. The pipeline is: rolling window → per-axis gravity removal →
band-pass → magnitude → RMS → normalised risk.

**Order of operations is load-bearing.** Vibration must be computed as

```
bandpass(|de_trend(acc)|)
```

**not** `de_trend(|acc|)`. Taking the magnitude before removing gravity buries
the signal in the ~9.8 m/s² gravity offset — and for a circular or elliptical
tremor the magnitude is *mathematically constant*, so the entire motion vanishes.
Measured, for a true 0.5 m/s² input:

| Signal | `de_trend(\|acc\|)` (wrong) | `\|de_trend(acc)\|` (correct) |
|---|---|---|
| circular 0.5 m/s² | **0.000** | 0.498 |
| linear 0.5 m/s² | **0.004** | 0.352 |

Reference bands:

| Metric | Low | High |
|---|---|---|
| `vibration_rms` | 0.3 | 0.9 m/s² |
| `jerk_rms` | 6.0 | 20.0 m/s³ |
| `sway_rms` | 5.0 | 15.0 °/s |
| `tremor_freq` | 1.5 | 7.0 Hz |

`risk_100` is a weighted blend, banded low / moderate / high.

> **Calibration caveat.** The band-pass is a 1 s moving-mean high-pass, which
> attenuates by roughly 30 % (0.80 m/s² in → ~0.53 measured). Discrimination is
> monotonic and healthy, but the bands above should be **re-calibrated against
> real patient data** before clinical use. Do not treat the current numbers as
> validated.

---

## 8. Grip / load cell

HX711 on the Radxa via `python-periphery` GPIO:

| Header pin | Line | Signal |
|---|---|---|
| Physical 1 (3.3 V) | — | VCC |
| Physical 39 | — | GND |
| Physical 38 | 323 (`PIN_38`) | SCK |
| Physical 40 | 324 (`PIN_40`) | DOUT |

Confirm the line numbers against your board:

```bash
python3 hx711_probe.py --list
```

Diagnose the wiring independently of the gateway:

```bash
python3 hx711_probe.py --diagnose     # DOUT idle level, no clocking
python3 hx711_probe.py --samples 100  # live raw counts
python3 hx711_probe.py --scan 320     # find a line that pulses
```

Reading the results:

| `--diagnose` result | Meaning |
|---|---|
| DOUT mostly HIGH, ~10 LOW pulses/s | HX711 alive; go on to check the load cell |
| DOUT constant **LOW** | unpowered chip, or DOUT shorted to GND |
| DOUT constant **HIGH** | floating — DOUT not connected |

A powered HX711 **idles HIGH** and pulses LOW about ten times a second. A line
pinned LOW is the classic unpowered signature.

**Power:** the HX711 logic runs at 3.3 V, but the load cell needs ~4–12 V
excitation generated from the VCC rail. Most breakout boards expect **5 V** on
VCC; feeding 3.3 V leaves the cell unexcited and the reading flat at zero.
Verify with a multimeter rather than trusting the header label.

The gateway **tares at startup** from 100 samples, so connect and load the cell
*before* starting it. Stop the gateway while running the probe — it holds the
pins.

---

## 9. Testing without hardware

```powershell
# synthetic two-node stream through the real gateway and scorer
python ml\live_udp_test.py --host 127.0.0.1 --scenario moderate
```

Verifies packet decode, buffering, DSP and scoring end to end. Expected risk by
scenario: low ≈ 2, moderate ≈ 49, high ≈ 99.

---

## 10. Known limitations

- **Risk bands need clinical re-calibration** — see §7.
- **Four of the eight hand reference images are under 500 px** on their short
  edge and render small in the lightbox. Re-export at ≥800 px.
- **FIHOA translations** are pending clinical review; the UI shows an amber
  notice and falls back to English rather than guessing.
- **Single grip channel.** HX711 is 10-bit; expect ~1–2 % error and no
  temperature compensation.
- **`next lint` is unconfigured** and prompts for setup — `npm run build` is the
  effective code gate.
- **UDP is unencrypted and unauthenticated** on the LAN. Acceptable for a
  clinic LAN, not for an open network.

---

## 11. Environment variables

### ML service / gateway

| Variable | Default | Purpose |
|---|---|---|
| `MEDHA_ENABLE_GATEWAY` | `1` | set `0` to disable reception entirely |
| `MEDHA_IMU_THIGH_PORT` | `5005` | thigh / sensor1 UDP port |
| `MEDHA_IMU_SHANK_PORT` | `5006` | shank / sensor2 UDP port |
| `MEDHA_GATEWAY_RELAY_HOST` | *(empty)* | re-send every frame to this host (**board only**) |
| `MEDHA_GATEWAY_RELAY_PORT` | `0` | upstream port for sensor1 / thigh |
| `MEDHA_GATEWAY_RELAY_PORT_SHANK` | *thigh + 1* | upstream port for sensor2 / shank |
| `MEDHA_LAN_IP` | *(auto)* | pin the advertised PC address |
| `MEDHA_IMU_REQUIRE_BOTH` | `0` | require both nodes to score, not just one |
| `MEDHA_IMU_MIN_FRAMES` | `10` | frames needed before a trial is accepted |
| `MEDHA_ML_HOST` / `MEDHA_ML_PORT` | `127.0.0.1` / `8000` | bind address |
| `MEDHA_GATEWAY_DISPLAY` | `1` | set `0` to silence the console sensor table |
| `MEDHA_HX711_ENABLED` | `1` on Linux | set `0` to skip the load cell |
| `MEDHA_HX711_DT` | `324` | DOUT line |
| `MEDHA_HX711_SCK` | `323` | SCK line |
| `MEDHA_HX711_CHIP` | `/dev/gpiochip0` | gpiochip device |
| `MEDHA_HX711_CALIBRATION` | `5800` | counts per kg |

---

## 12. Related documentation

- [`docs/SENSORS.md`](SENSORS.md) — hardware bring-up, wiring, firewall,
  diagnostics
- [`ML_GUIDE.md`](../ML_GUIDE.md) — model architecture and inference
- [`README.md`](../README.md) — getting started
