# SANDHIQ — Full YouTube Demo Script

**Target length:** 22–28 minutes (main walkthrough) + optional 3–4 min "under the hood" section.
**Format:** Screen recording with voiceover. No webcam needed, or a small face-cam in the corner for the intro/outro.

Every **ON-SCREEN** string below is quoted verbatim from the codebase. Every number is the real
value the app uses — do not paraphrase them in narration, because viewers will check.

---

## PART 0 — BEFORE YOU HIT RECORD

### 0.1 What must be running

Open **three** terminals. In the video, show them briefly on screen so viewers know it is not magic.

| Terminal | Command | What it does |
|---|---|---|
| 1 | `npm run dev` | Next.js app on `http://localhost:3000` |
| 2 | `npm run ml:serve` | Python/Flask ML service on `127.0.0.1:8000` (X-ray model + sensor gateway) |
| 3 | `ollama serve` | Only needed for the Assistant section. `ollama pull llama3` first. |

Sanity check before recording:

```
npm run ml:health      # should return modelLoaded: true
```

If `modelLoaded` is false, your X-ray section will fail live. Fix that before recording, not on camera.

### 0.2 How the force-test step is filmed

This step has two paths and the camera only ever shows one of them:

- **Load-cell sensor** — reads a peak pull in kg from the HX711 load cell on the Linux gateway.
- **Manual / force gauge** — the operator types the peak reading from a hand-held tension gauge.

**Film this step on the Manual / force gauge path.** A hand-held tension gauge is the standard
reference method for a rope pull, the value is genuinely entered by the operator, and nothing in the
narration depends on hardware being attached to the recording machine.

**VO rule for this step:** describe the load-cell integration as *supported when the hardware is
connected* and show the manual path on camera. Do not narrate a live load-cell reading while
filming the manual path — the on-screen number and the spoken claim have to be the same thing.

Limitation 6 in the report has already been reworded to match the UI:

> `Force-test and IMU scores depend on the respective hardware being connected; confirm every stored reading against the source device before clinical use.`

### 0.3 Known rough edges — decide whether to fix or feature them

These are real. They are also genuinely good "engineering honesty" content for Section 11.

- The **camera step cannot be saved** until all five sub-tests have a result. Budget an extra minute.
- `docs/SYSTEM.md` §3 still describes the FIHOA/Hand steps incorrectly. The code is right, the doc is wrong.
- The IMU **Simulated** preset values in the UI (0.06 / 0.14 / 0.24) do not match the server-side
  scenarios (0.220 / 0.550 / 1.050). A UI-simulated trial will not equal a server-simulated trial.
- `reportModel.js:464` tests a `simulated` key on the IMU step that is never set, so one finding can
  never fire. The visible substitute works correctly.
- The wizard's progress percentage is **index-based**, not completion-based — it shows "Test 3 of 8 · 29%"
  even if you skipped nothing.
- Radar and WOMAC charts are `print:hidden`, so they do not appear in the PDF. Say so, or viewers will ask.
- `AI_ASSISTANT_SETUP.md` documents `llama3.2:3b`; `.env.local` sets `llama3:latest`.

### 0.4 Prepare demo data

Do this **before** recording so the dashboard is not empty:

- Register 2–3 patients with varied values (one healthy-ish, one with high BMI, one with a high-risk profile).
- Run one complete screening on patient 1 so the **History**, **Trend**, **Risk distribution** and
  **Last 14 days** charts all have data.
- Leave patient 2 with an in-progress screening so the **Continue** badge is visible.
- Have one knee X-ray image ready to upload, plus a second one to show the "Change image" state.

---

## PART 1 — COLD OPEN (0:00 – 0:40)

**VISUAL:** Black. Title card fades in. Then hard cut to the login screen.

**ON-SCREEN TEXT:** `SANDHIQ` / `AI-Assisted Osteoarthritis Screening Platform`

**VO:**

> Knee osteoarthritis is the most common joint disease in the world, and in most places it is
> diagnosed late — usually only once it is painful enough to need surgery. But by then the
> structural damage is already done.
>
> SANDHIQ is a screening platform that brings a structured assessment to the point of first
> contact. Eight tests. One combined risk score. One printable report.
>
> Everything you are about to see runs on a single field device with no internet connection, and
> no patient data ever leaves the machine.
>
> Let me walk you through the entire flow, start to finish.

**VISUAL:** Hold on the login screen for two seconds, then begin.

---

## PART 2 — SIGN IN & ACCOUNTS (0:40 – 3:00)

### SCENE 2.1 — The login screen

**VISUAL:** `http://localhost:3000/login`

**ON-SCREEN:**
- `SANDHIQ` with a stethoscope icon
- `AI-Assisted Osteoarthritis Screening Platform`
- Heading: **Health Worker Login**
- Fields: **Username**, **Password**
- Username placeholder: `e.g. asha.worker`
- Button: **Sign in**
- Footer: `Works fully offline · Data stored securely on this device`
- Language selector, top right

**VO:**

> The app opens at the login screen. Note the footer — this platform is built to run entirely
> offline, on one device, with no server dependency.
>
> Four languages ship with it: English, Hindi, Assamese and Nagamese. You can switch at any time
> from the top bar, and the choice is remembered.

### SCENE 2.2 — First run: no account exists

**VISUAL:** If the device is fresh, show the amber banner.

**ON-SCREEN:** `No account exists on this device yet.` → **Create an account**

**VO:**

> On a brand-new device there are no accounts, so the app tells you that up front rather than
> rejecting you with a generic error. Let me create one.

### SCENE 2.3 — Create account

**VISUAL:** Click **Create an account** → `/signup`

**ON-SCREEN:**
- Heading: **New Account**
- Subtitle explaining accounts are stored on this device only
- Fields: **Full name**, **Username**, **Password**, **Role**
- Role options: `Health Worker` · `Doctor / Clinician` · `Administrator`
- Button: **Create account**
- Validation if password too short: `Password should be at least 4 characters.`

**VO:**

> Four fields: name, username, password, and a role. The role is one of health worker,
> doctor or clinician, or administrator.
>
> I want to be straight with you about how this authentication works, because it matters. Passwords
> are salted and hashed with SHA-256 in the browser before they are written to the local database.
> That is genuinely better than storing plain text, and it is appropriate for a shared offline
> device. But it is not the same guarantee as bcrypt or Argon2 on a server, and it is not
> multi-factor authentication. For a production deployment with real patient data you would put
> a proper identity provider in front of this. The code is structured for exactly that swap.

### SCENE 2.4 — Sign in

**VISUAL:** Return to `/login`, enter credentials, click **Sign in**. Land on the dashboard.

**VO:**

> And we are in. That is the whole authentication flow — no server, no email, no verification step.

---

## PART 3 — THE SHELL & DASHBOARD (3:00 – 6:00)

### SCENE 3.1 — The app shell

**VISUAL:** Slow pan across the sidebar.

**ON-SCREEN:**
- Brand: **SANDHIQ** / `Screening Platform`
- Nav: **Dashboard**, **Patients**, **Settings**
- Bottom: online/offline indicator — **Online** or **Offline mode**
- User chip: your name and role
- **Sign out** button
- Collapse toggle

**VO:**

> Everything lives inside one shell. Three destinations: Dashboard, Patients, Settings.
>
> Two details worth noting. The indicator at the bottom left tells you whether the device currently
> has connectivity — useful, because the app genuinely keeps working without it. And the whole
> sidebar collapses to icons, which matters on a small tablet at a rural clinic.

### SCENE 3.2 — Dashboard

**VISUAL:** `/dashboard`

**ON-SCREEN — four stat cards:**
| Card | Meaning |
|---|---|
| **Patients** | Total registered on this device |
| **Completed** | Finished screenings |
| **In Progress** | Started but not finalized |
| **High-Risk Flags** | Completed screenings banded High |

**Then, below:**
- **Recent screenings** — last 8, each with patient name, timestamp, status badge, arrow
- **Risk distribution** — pie chart, Low / Moderate / High / Unscored, total in the centre
- **Last 14 days** — area chart of screenings created per day

**VO:**

> The dashboard answers three questions in one screen. How many people am I looking after? How many
> of them have actually completed a screening? And how many came back high risk?
>
> Below that, the last fourteen days of activity, and the risk distribution across everyone screened.
> Empty states are handled properly too — a fresh device shows a clear message rather than a blank chart.

**DIRECTOR NOTE:** If you prepared demo data in 0.4, these charts are populated. If you skipped it,
this scene is four empty boxes. Go back and prepare the data.

---

## PART 4 — REGISTERING A NEW PATIENT (6:00 – 9:00)

### SCENE 4.1 — Navigate

**VISUAL:** Click **Patients** in the sidebar → `/patients`

**ON-SCREEN:** `N registered on this device`, search box, list of patients, **New Patient** button.

**VO:**

> The patient register. Searchable by name, patient code, phone or village — all on-device, all
> instant. Each patient gets an auto-generated code in the form `MED-XXXXXX`.

### SCENE 4.2 — The registration form

**VISUAL:** Click **New Patient** → `/patients/new`

**ON-SCREEN — fields, in order:**

| Field | Type | Required | Validation |
|---|---|---|---|
| **Full name** | text | Yes | non-empty |
| **Age** | number | Yes | 1 – 120 |
| **Sex** | select | Yes | Female / Male / Other |
| **Phone (optional)** | text | No | — |
| **Village / Area** | text | No | — |
| **Height** | number | **Yes** | 100 – 230 cm |
| **Weight** | number | **Yes** | 20 – 300 kg |

Section header: `Anthropometrics (required)`

**VO:**

> Six required fields plus two optional contact fields. Age and sex matter clinically — they feed
> the sex-specific strength bands later — so they are not optional.
>
> Height and weight are mandatory, and the reason is BMI. Watch what happens as I type them.

### SCENE 4.3 — Live BMI

**VISUAL:** Type height `162` and weight `78`. The BMI panel appears.

**ON-SCREEN:** `BMI 29.7` + classification chip, plus a secondary line reading roughly:
`Asian-Indian cut-off (also Overweight by WHO standard)`

**VO:**

> The BMI classifies as you type, and it is worth pausing on. It reports against **WHO Asian-Indian
> cut-offs** — 18.5, 23, 27.5, 32.5, 37.5 — and then tells you what the same number would read as
> under the standard WHO cut-offs of 25, 30 and 35.
>
> This patient is 29.7. Under Indian Asian cut-offs that is obese. Under standard WHO cut-offs it is
> merely overweight. In a population where the lower cut-offs are the correct ones, using the Western
> thresholds would systematically under-flag patients. The app shows both so the clinician can see
> the difference rather than inherit an assumption.

### SCENE 4.4 — Save and open the record

**VISUAL:** Click **Register patient** → lands on `/patients/[id]`

**ON-SCREEN:**
- Header: patient name, `MED-XXXXXX | 58y | Female | Rampur`
- **Anthropometrics** card: Height, Weight, BMI + chip, **BSA** (body surface area)
- **Trend** line chart of combined score over time (appears once there are 2+ completed screenings)
- **History** list: each screening with date, `Combined score: NN` or `In progress`, band badge or **Continue**
- Button: **Start Screening**

**VO:**

> Height, weight, BMI and body surface area, computed and stored. Below that, a trend chart once this
> patient has more than one completed screening — so you can see whether they are improving or
> declining between visits. And a history list; each completed one opens its report.

---

## PART 5 — THE SCREENING WIZARD (9:00 – 10:00)

### SCENE 5.1 — Enter the wizard

**VISUAL:** Click **Start Screening** → `/screening/[id]`

**ON-SCREEN:**
- Header: `Screening — <patient name>`
- Subtitle: `MED-XXXXXX · Test 1 of 8 · 0%`
- Back link: `Back to <patient name>`
- Progress rail with 8 chips: **WOMAC · FIHOA · Hand · Grip · IMU · Camera · X-ray · Review**

**VO:**

> Here is the whole assessment. Eight steps, and this is the entire list:
>
> Two validated questionnaires — **WOMAC** and **FIHOA**. A **hand** visual assessment. A
> **rope-pull force** test. A **wearable IMU** balance trial. A **camera-based** functional battery.
> A **knee X-ray** read by a neural network. And a **review** step that fuses everything.
>
> Two things to know about how this behaves. Every chip in that rail is clickable — you can jump
> forward or back at any time, nothing is locked. And every step's button is **Save & Continue**,
> which writes to the local database and advances you. There is no autosave, so use the button.

**DIRECTOR NOTE:** Progress reads "Test 1 of 8 · 0%" at the start and steps by index, not by
completion. If you want the video to look like it tracks real progress, be aware of that.

---

## PART 6 — THE EIGHT STEPS (10:00 – 22:00)

### STEP 1 — WOMAC Questionnaire (10:00 – 11:30)

**VISUAL:** `/screening/[id]` step `womac`

**ON-SCREEN:**
- Title: **WOMAC Questionnaire — Knee / Hip**
- Subtitle: `Ask the patient about pain, stiffness, and daily function.`
- Progress: `Question 1 of 24` + gradient bar
- Section eyebrow: `pain` / `stiffness` / `function` with an icon
- Five buttons: **None · Mild · Moderate · Severe · Extreme**
- Buttons: **Back**, **Next**, and on the last question **Save & Continue**
- Footer: `Reference: Bellamy et al., Journal of Rheumatology, 1988`

**VO:**

> WOMAC is the industry-standard knee and hip outcome questionnaire — twenty-four questions
> covering three subscales: five on **pain**, two on **stiffness**, and seventeen on **physical
> function**. Each is answered on the same five-point scale, none through extreme.
>
> It is asked one question at a time, because reading twenty-four items off a list to a
> village-level patient does not work. Selecting an option advances automatically.

**VISUAL:** Answer a few questions quickly, then jump to the summary state.

**VO:**

> Scoring: pain out of 20, stiffness out of 8, function out of 68, total out of 96. The percentage
> maps to a band — under 25 percent is Low, under 50 is Moderate, above that is High.
>
> One design decision worth naming: when the interface language is Assamese or Nagamese, the app
> shows a banner saying full translation is pending clinical review, and it displays these
> questions in **English** rather than showing a machine translation. An incorrectly translated
> medical question is worse than no translation, so the app refuses to guess.

### STEP 2 — FIHOA (11:30 – 12:45)

**VISUAL:** step `fihoa`

**ON-SCREEN:**
- Title: **FIHOA — Hand Function Questionnaire**
- Subtitle: `Ask about difficulty performing everyday hand tasks.`
- Prompt shape: `Can the patient: <item>?`
- Items include: *Turn a key in a lock · Cut meat with a knife · Snap or fasten buttons · Hold a full pitcher/jug with one hand · Open a jar previously opened · Do or undo buttons · Turn a doorknob · Grip a car door handle · Cut/trim fingernails*
- Three buttons: **No difficulty · Possible but with difficulty · Impossible / severe difficulty**
- Footer: `Reference: Dreiser et al., Revue du Rhumatisme, 1995`

**VO:**

> FIHOA is the hand-function counterpart — ten everyday tasks, scored zero to two, total out of
> thirty, same banding as WOMAC.
>
> Notice the split in this step. FIHOA scores **function**. The next step scores **appearance**.
> Those are genuinely different clinical questions, and the app keeps them apart on purpose.

### STEP 3 — Hand Visual / Nodal Assessment (12:45 – 14:45)

**VISUAL:** step `hand`

**ON-SCREEN:**
- Title: **Hand Visual / Nodal Assessment**
- Subtitle (verbatim, keep this on screen): `Voice-guided — automated image analysis is planned for a future release; this step is completed by the health worker's own observation.`
- Speaker button: **Play voice instructions** → **Playing instructions…**
- Panel: **Hand visual reference** — `radiograph + photo for each grade`, Hide/Show toggle
- Four grades, each with an **X-ray** tile and a **Hand photo** tile: **Normal · Mild · Moderate · Severe**
- Amber caution: `Reference aid only. FIHOA scores hand function — grade the patient from the answers, not from these images.`
- Four grading options:
  | Option | Description |
  |---|---|
  | **No visible nodes** | No bony swelling at finger joints |
  | **Mild nodal changes** | Slight swelling, one or two joints |
  | **Moderate nodal changes** | Clear Heberden's/Bouchard's nodes, several joints |
  | **Severe nodal changes** | Marked deformity, thumb-base squaring, multiple joints |
- Free-text: **Additional notes (optional)**
- Footer: `Reference: Kalichman & Hernández-Molina, Seminars in Arthritis and Rheumatosis, 2010`

**VISUAL:** Click **Play voice instructions** and let the audio run for a few seconds.

**VO:**

> This step is voice-guided. Press play and the app reads the instruction aloud, so the health
> worker does not have to look at the screen while positioning the patient's hands.
>
> The wording is: *place both hands flat on the table, palm down. Compare the finger joints against
> the four reference photographs. Also check the base of the thumb for squaring or swelling.*

**DIRECTOR NOTE:** Let the voice-over actually play — it is a real feature and it is the point of the step.

**VO:**

> The reference panel below shows four grades, and each grade has **both** a radiograph and a
> clinical photograph side by side, because the two modalities do not always agree and a
> non-radiologist needs to see both patterns. Click any tile to open it full size.
>
> I want to be direct about the status of this step, and the app is direct about it too — read the
> subtitle again. **Automated image analysis is not implemented here.** The health worker grades
> this by eye, with voice guidance and a reference panel. There is no claim of automated nodal
> detection, and the report will not pretend otherwise.

### STEP 4 — Rope-Pull Force Test (14:45 – 17:00)

**VISUAL:** step `grip`

**ON-SCREEN:**
- Title: **Pull Force — Rope-Pull Tension Test**
- Subtitle: `Measures functional impact of hand/thumb-base OA from peak rope-pull force.`
- Numbered instructions:
  1. `Ask the patient to take hold of the rope and stand square to the load cell.`
  2. `Patient pulls the rope toward themselves with their full force, keeping the pull steady.`
  3. `Capture the reading at its peak value.`
- Two mode buttons: **Load-cell sensor** · **Manual / force gauge**
- Footer: `Reference: Kloppenburg et al., Osteoarthritis and Cartilage, 2020`

**VO:**

> This is the force test. The patient takes hold of the rope, stands square to the load cell, and
> pulls toward themselves with full force while the app captures the **peak** of that pull. Peak,
> not average — because what matters clinically is the maximum they can produce.

#### SCENE 6.4a — Load-cell sensor path (describe it, do not fake it)

**VISUAL:** Click **Load-cell sensor** so the panel and its status line are on screen.

**ON-SCREEN:**
`HX711 load cell is reading. Ask the patient to pull the rope with full force.`
Then a large live number in kg, with two tiles: **Peak this trial** and **Scale ceiling**.

**VO:**

> This panel is the load-cell path. The HX711 sits on the Linux gateway, which owns the GPIO pins,
> and the reading lands here once per second. The panel holds the maximum seen during the trial, so
> the peak is still captured if the operator glances away mid-pull.
>
> What I will not do is stand here and narrate a live load-cell reading while nothing is attached to
> this laptop. Watch what the app does instead — that is the next scene, and it is the more useful
> half of this step.

#### SCENE 6.4b — Manual / force gauge (this is the path on camera)

**VISUAL:** Show the sensor-absent state, then click **Manual / force gauge** and type `22.5`.

**ON-SCREEN (when the sensor is genuinely absent):**
- `No load cell is reporting on this host.`
- Amber card: `HX711 not present on this machine`
- Body: `The HX711 driver needs GPIO pins, which only the Linux gateway host has. On this machine the load cell path is inactive.`
- `Switch to Manual / force gauge to record the peak reading — a hand-held tension gauge is the standard reference method for this test.`

**ON-SCREEN (after typing):** label **Peak pull force (kg)**, placeholder `e.g. 22.5`, then the recorded row:
`Reading: 22.5 kg` with a colour-coded band badge.

**VO:**

> This is the part that matters most for field deployment, so let me slow down.
>
> The HX711 load-cell driver needs GPIO pins, which only the Linux gateway board has. On a machine
> without the cell attached, the load-cell path is inactive — and notice what the app does **not**
> do: it never shows zero. A fabricated `0.0 kg` would be far more dangerous than showing nothing,
> because zero looks like a real, very weak measurement.
>
> Instead it says the sensor is absent and points you to **Manual / force gauge**. A hand-held
> tension gauge is the standard reference method for this test, so this is not a degraded mode — it
> is a legitimate measurement path, and it is the path we are recording.
>
> Every sensor step in this app has that same fallback. I will show you two more in a moment.

#### SCENE 6.4c — Scoring

**ON-SCREEN:** band badge — **healthy** / **moderate** / **low**

**VO:**

> The band is sex-stratified. For men: under 27 kg is low, 27 to 36.9 is moderate, 37 and above is
> healthy. For women: under 16 is low, 16 to 25.9 is moderate, 26 and above is healthy.
>
> **One caveat I want on the record:** these cut-offs come from hand grip dynamometry literature,
> and this step now measures a **rope pull**, which is a different movement. They are very likely
> wrong for this test and should be re-derived against rope-pull reference data before any clinical
> use. I have left them in place so the flow works end to end, but they are placeholders, not
> validated thresholds.

### STEP 5 — IMU Vibroarthrography (17:00 – 19:30)

**VISUAL:** step `imu`

**ON-SCREEN:**
- Title: **IMU — Joint Movement / Vibroarthrography**
- Subtitle: `Bilateral shin+thigh IMU capturing vibration during active knee movement.`
- **Data source** selector, three chips:
  | Chip | Sub-label |
  |---|---|
  | **Live sensors** | `sensor gateway` |
  | **Simulated** | `generated trial` |
  | **Manual entry** | `typed values` |
- Two sensor cards: **Thigh IMU** (ESP8266 · UDP 5005) and **Shank IMU** (ESP8266 · UDP 5006)
  Each shows a status badge — **ONLINE** / **WAITING** — a frame counter, an age, and live `acc x y z` / `gyr x y z` readouts.
- Numbered instructions with the 8-second hold
- Footer: `Reference: Krecisz & Baczkowicz, Medical & Biological Engineering & Computing, 2018`

**VO:**

> Two IMU nodes go on the **same leg** — one on the thigh, one on the shank. Each streams a
> three-axis accelerometer and gyroscope. The thigh node arrives on UDP port 5005, the shank on 5006,
> so the two are distinguished by port.
>
> The patient stands still, feet shoulder-width, for **eight seconds**. The idea is that a knee with
> osteoarthritic changes produces more high-frequency micro-vibration than a healthy one.

#### SCENE 6.5a — Live mode with sensors absent

**VISUAL:** Keep the ML service stopped, or with no IMUs powered. Show the amber card.

**ON-SCREEN:**
- Header: `Sensor gateway not reachable`
- Body: `Start the Python service with: npm run ml:serve`
- Node cards both showing **WAITING** / `waiting for first packet`
- Warning: `No usable frames buffered yet. Confirm both nodes show ONLINE above, then wait a moment.`

**VO:**

> With the gateway not running, the app says so immediately and tells you the exact command to start
> it. It does not sit there showing a frozen zero, and it will not let you score a trial it has no
> data for — the button stays disabled and the readiness hint tells you what to check.

#### SCENE 6.5b — The stale-data guard (worth showing deliberately)

**VISUAL:** With one node live, then kill power on that node mid-session so it goes quiet while the
other keeps streaming.

**ON-SCREEN:** the quiet node's numbers become **struck through and dimmed**, captioned:
`stale — last packet 112s ago, not a live reading`

**VO:**

> Here is a detail I think is genuinely important. When a node stops transmitting but still has
> buffered data, the app does **not** keep showing those numbers as if they were live. It strikes
> them through, greys them out, and labels them with the actual age of the last packet.
>
> The reasoning is in the code: an `ONLINE` badge is exactly what leads a clinician to accept a
> reading that has already stopped.

#### SCENE 6.5c — Run a trial

**VISUAL:** With live data, click **Start 8s trial** → counter runs → **Score the last 8s**

**ON-SCREEN after scoring:**
- Band badge: **Low risk** / **Moderate risk** / **High risk**
- Large `NN` with `/100` and the caption `vibration-instability score`
- Provenance badge: **LIVE sensors**
- Oscilloscope: `Band-passed acceleration magnitude, thigh IMU`
- Metric cards and an x/y/z RMS grid
- Server-generated explanation paragraphs
- Footer caveat: `Screening estimate, not a diagnosis. Preview cutoffs are preliminary and must be recalibrated against real recordings.`

**VO:**

> The trial runs for eight seconds, then the app scores the buffered window. You get a risk score
> out of a hundred, a band, the four underlying metrics, and the actual signal trace.
>
> Four metrics. Vibration amplitude in metres per second squared, reference band 0.30 to 0.90.
> Jerk in metres per second cubed, 6 to 20. Rotational sway in degrees per second, 5 to 15. And the
> dominant tremor frequency in hertz, 1.5 to 7.
>
> The score weights vibration at 0.45, jerk at 0.30 and sway at 0.25 — and **frequency is
> deliberately excluded** from the score. It is reported for context only.
>
> At 70 and above you get a high-risk flag; 30 to 69 is moderate. And the app prints its own caveat
> directly under the result, because these bands are preview cut-offs that have not been calibrated
> against real clinical recordings.

#### SCENE 6.5d — Simulated and Manual modes

**VISUAL:** Click **Simulated** → preset chips **Low tremor / Moderate tremor / High tremor**.
Then **Manual entry** → four fields: Vibration amplitude (m/s²), Jerk (m/s³), Rotational sway (°/s), Overall risk score (0-100).

**ON-SCREEN:** amber note for both:
- `Simulation mode — the next trial uses generated data so the full screening flow and report can be tested. The record will be labelled SIMULATED.`
- `Manual entry — no sensors used. Type the four values directly; the record is marked as manual in the report.`

**VO:**

> Two fallbacks, same as the force test. A simulated mode lets you rehearse the flow without
> hardware, and — importantly — it is **loudly labelled** in the record and stamped `SIMULATED` on
> the result, so it can never be mistaken for a measurement. And a manual mode where you type the
> four values directly, which is recorded as manual.
>
> Label your fallbacks. That is the whole lesson of this step, and it is why the force test on camera
> uses the manual path rather than a generated trace.

### STEP 6 — Camera-Based Functional Assessment (19:30 – 21:00)

**VISUAL:** step `cv`

**ON-SCREEN:**
- Title: **Camera-Based Functional Assessment**
- Subtitle: `Chair-stand, gait, TUG, knee ROM, and balance — via real-time pose tracking.`
- Mode buttons: **Laptop Camera** · **Radxa Camera** (with a `Radxa stream URL` field, placeholder `http://192.168.50.2:8080/stream`)
- Loading: `Loading the on-device pose model…`
- Camera-off overlay: `Position the camera so the participant's full body is visible, facing the lens.`
- Five test cards, each with chips **Pending** / **Running** / **Done**
- SPPB panel
- Footer: `Reference: Guralnik et al., J Gerontology 1994 (SPPB) · Podsiadlo & Richardson 1991 (TUG)`

**VO:**

> The camera step is the largest single component. It runs **MoveNet SinglePose Lightning** through
> TensorFlow.js on the WebGL backend, entirely in the browser. No video leaves the device, and
> nothing is uploaded.
>
> You can use the laptop camera or an MJPEG stream from the Radxa board. And it runs five tests.

**ON-SCREEN — the five tests and their on-screen instructions:**

| Test | How it works |
|---|---|
| **5x Chair Stand** | Fully automatic. Reps are detected from real hip movement — the UI says outright: *"Repetitions are counted automatically from real body movement. If one is missed, re-run the test (there is no manual counter)."* |
| **4m Gait Walk** | You mark two lines 4 m apart, click Start on the first step, click Stop when any body part crosses the line. Speed = 4.0 m ÷ elapsed. |
| **Balance / Sway** | Fully automatic 10-second hold after a 1.2 s ready delay. Ends by itself. |
| **Timed Up & Go (TUG)** | A plain stopwatch. Start as they rise, stop as they sit. |
| **Knee Range of Motion** | Automatic 10-second capture; flexion arc = max angle − min angle, from hip-knee-ankle geometry. |

**VO:**

> Three of the five are fully automatic — the app counts the repetitions, runs the balance timer,
> and measures the knee arc from the skeleton itself. Two are operator-timed, because a stopwatch
> is more reliable than a model for the start and stop instants.
>
> Note what the chair-stand card says: there is no manual counter. If the app misses a rep, you re-run
> the test. That is a deliberate choice — a manual override would let a number get entered that the
> camera never actually saw.

**VISUAL:** Run at least one test live so the trace and skeleton overlay are visible.

**ON-SCREEN — SPPB panel:**
- `SPPB Total: 9 / 12`
- `Risk 38/100 (Moderate Risk)`
- Rows: `Chair stand: … · 3/4` · `Gait speed: … m/s · 3/4` · `TUG: …s` · `Knee ROM: …°` · `Balance sway RMS: … cm · 3/4`
- Sub-score mapping on screen: `Sub-score 3/4 · 82/100`

**VO:**

> The first three roll up into the **SPPB** — the Short Physical Performance Battery, scored out of
> twelve. Sub-scores use the published cut-offs: chair stand against 19.2, 16.2 and 13.7 seconds;
> gait speed against 8.7, 6.21 and 4.83 seconds; sway against 6.0, 4.5, 3.0 and 2.0 centimetres.
>
> Two honesty notes the code goes out of its way to record. First, the balance figure is a
> **postural sway screening proxy**, explicitly *not* the real SPPB balance item. Second, the camera
> converts pixels to centimetres using shoulder width against a 38 cm biacromial reference, and gait
> speed relies on the physically marked 4-metre walkway — lose either conversion and every healthy
> patient scores badly regardless of performance, which is exactly the bug the code comments
> describe fixing.

**DIRECTOR NOTE:** The camera step cannot be saved until all five sub-tests have a result. Either run
all five on camera, or accept that you will be jumping back to it before the review step.

### STEP 7 — Knee X-ray (21:00 – 22:30)

**VISUAL:** step `xray`

**ON-SCREEN:**
- Title: **Knee X-ray (if available)**
- Subtitle: `Optional — the fusion engine automatically re-weights other tests when unavailable.`
- Dropzone: **Upload knee X-ray** → **Change image**
- Button: **Run KL-Grade Analysis** → **Analysing…**
- Caption: `EfficientNet-B0 running with horizontal-flip test-time augmentation…`
- Footer: `Reference: Tiulpin et al., Scientific Reports, 2018`

**VO:**

> The X-ray is optional, and the app says so up front. If there is no radiograph, the fusion engine
> rebalances its weights across the remaining tests — you are not punished for a missing X-ray.

**VISUAL:** Upload an image, run the analysis.

**ON-SCREEN — result card:**
- e.g. `KL2 — Mild` and `Mild osteoarthritis`
- Confidence percentage with a gradient bar
- Per-class probability bars KL0–KL4
- Footer: `AI-assisted screening estimate, not a medical diagnosis. Review with a qualified healthcare professional.`
- **Show plain X-ray** / **Show attention map** toggle
- Gradient legend: `low attention` → `high`
- Caption: `Model Attention Visualization (Grad-CAM)`
- Note: `Highlights image regions that contributed to the model's prediction. It is an explainability aid, not a definitive indication of disease location.`
- Possibly: `Map computed from the base model's KL0 prediction, which differs from the flip-averaged grade above. The grade KL2 is the reported result.`
- Disclosure link: **How reliable is this model?**

**VO:**

> This is an **EfficientNet-B0** classifier grading the knee on the **Kellgren-Lawrence** scale,
> zero through four. It predicts with horizontal-flip test-time augmentation, weighted 30 percent
> original to 70 percent flipped, and grades in around 150 milliseconds.

#### SCENE 6.7a — Grad-CAM

**VISUAL:** Click **Show attention map**.

**VO:**

> Alongside the grade is a Grad-CAM heatmap. It shows which parts of the image contributed to the
> prediction.
>
> Two things it is **not**. It is not a localisation of disease — the caption on screen says it is
> "an explainability aid, not a definitive indication of disease location." And it is not a
> severity map. The colour is model attention, not a severity scale; the severity is the KL badge.
>
> You may also see a warning that the heatmap's base-model class differs from the reported grade.
> That can happen, and when it does the app tells you plainly which one is the reported result.

#### SCENE 6.7b — The reliability disclosure (do not cut this)

**VISUAL:** Click **How reliable is this model?** and hold on the expanded panel.

**ON-SCREEN:**
- `EfficientNet-B0 · validated on 1,656 held-out radiographs`
- `Overall accuracy 60.6% · macro F1 0.5x`
- Per-class recall for KL0–KL4
- `The model is weakest at KL1, so early-stage changes are frequently reported as KL0.`

**VO:**

> I want to spend a moment here, because this is the part most demos cut.
>
> This model is **60.6% accurate on 1,656 held-out radiographs**. And its recall on **KL1 — doubtful,
> very early change — is 7.4%**. It systematically under-reports early disease.
>
> The app does not hide that behind an impressive-looking number. There is a disclosure link on
> every result, it pulls the real per-class figures from the evaluation JSON, and it states in plain
> language that early change is frequently reported as normal.
>
> That is why the result card also flags low confidence — under 55 percent, or when the top two
> classes are within 15 percent of each other — and tells the clinician to treat it as an indication
> and have a radiologist confirm.

#### SCENE 6.7c — The skip path

**VISUAL:** Click **No X-ray available**.

**ON-SCREEN:**
`X-ray marked as unavailable. Risk fusion will rebalance weights across the remaining tests.`
Buttons: **Actually, I have one** · **Continue without X-ray**

**VO:**

> And if there is no X-ray at all, you say so, and the engine re-weights. That is a realistic
> scenario in most community settings, and the app treats it as normal rather than as a failure.

### STEP 8 — Combined Risk Analysis (22:30 – 24:30)

**VISUAL:** step `review`

**ON-SCREEN:**
- Title: **Combined Risk Analysis**
- Subtitle: `Multimodal fusion across every completed test.`
- Hero: **Combined OA Risk Score**, large number, badge **Low Risk / Moderate Risk / High Risk**
- `Weighting includes X-ray (structural) evidence.` — or — `X-ray unavailable — weights rebalanced across remaining tests.`
- BMI strip: `Body mass index`, value, `{h} cm · {w} kg · WHO standard: {label}`
- Radar chart with five axes:
  - **Structural (X-ray)**
  - **Functional (Camera/SPPB)**
  - **Biomechanical (IMU)**
  - **Contextual (WOMAC/FIHOA)**
  - **Hand-OA (Visual + Grip)**
  Each row shows `score NN × NN%` or `Not completed`
- Possible amber banner: `Structural–Functional Mismatch: …`
- Disclaimer: `Screening triage aid only — not a diagnosis. Weights and thresholds are engineering starting points (TBV) pending clinical validation.`
- Button: **Finalize & Generate Report** → **Finalizing…**

**VO:**

> Here is where it all comes together. Five domains, each scored zero to a hundred where higher is
> worse, then weighted.
>
> With an X-ray: structural 25 percent, functional 25, biomechanical 20, contextual 20, hand OA 10.
> Without one: structural drops to zero and the rest renormalise — functional 33, biomechanical 27,
> contextual 27, hand OA 13.

**VISUAL:** Point at the radar, then the weight column.

**VO:**

> Note the per-domain rows say **Not completed** where a test was skipped, and the remaining weights
> are redistributed across what *was* done. So an incomplete screening still produces a
> proportionate score instead of one silently dragged toward zero by missing data.
>
> The bands are: under 30 is Low, 30 to 64 is Moderate, 65 and above is High.
>
> One more feature — the **structural–functional mismatch** banner. If the X-ray looks much worse
> than the patient's actual movement, or the reverse, by 40 points or more, the app says so
> explicitly. That combination is clinically interesting and worth a human look, so it is surfaced
> rather than averaged away.
>
> And the disclaimer at the bottom is not small print — the weights and thresholds are explicitly
> engineering starting points, pending clinical validation.

**VISUAL:** Click **Finalize & Generate Report**.

---

## PART 7 — THE REPORT (24:30 – 26:30)

### SCENE 7.1 — Report on screen

**VISUAL:** `/report/[id]`

**ON-SCREEN, top to bottom:**
- Title: **SANDHIQ Screening Report**, `Generated <date>`, report ID `MED-XXXXXX-YYYYMMDD`
- Right: `SANDHIQ community screening platform` / `Issued for clinical follow-up`
- Buttons: **Print / Save PDF** · **Download PDF**
- Six field tiles: **Patient**, **Patient ID**, **Age / Sex**, **Height**, **Weight**, **Body surface area**
- **Body mass index** card with chip and the WHO-comparison line; warning at BMI ≥ 27.5:
  `Above the Asian-Indian obesity threshold. Excess body weight increases medial knee loading and accelerates OA progression.`
- **Composite score** card: `out of 100`, band badge, and the impression sentence
- **Domain profile** radar chart *(screen only)*
- **WOMAC Subscale Breakdown** bar chart — Pain / Stiffness / Function *(screen only)*
- Possible mismatch banner
- **Contributing Findings** table: `Domain | Evidence source | Score | Weight | Contribution`
- **Detailed measurements** table: `Test | Result | Detail | Interpretation`
- **Key findings** — flagged major or minor
- **Recommendations** — each with a tag: Priority / Imaging / Weight / Mobility / Pain / Activity / Follow-up
- **Preventive Guidance** — four cards:
  - **Joint Care** — "Avoid prolonged squatting or floor-sitting. Use a chair or stool for daily tasks where possible."
  - **Physical Activity** — "Gentle range-of-motion and low-impact exercise such as walking, cycling, or swimming for 20–30 minutes most days."
  - **Nutrition** — "Maintain a healthy body weight; every kilogram of weight loss meaningfully reduces load on the knee joint."
  - **When to See a Doctor** — "Persistent swelling, night pain, or rapidly worsening function warrants a clinician visit."
- Incomplete banner if applicable: `Incomplete screening: N of M measurements recorded` + `Not completed: …`
- **Method, limitations and how to read this report** — a `<details>` block
- Signature lines: `Screening operator signature` / `Reviewing clinician signature and stamp`
- Footer disclaimer

**VO:**

> The report. Everything the app knows, laid out for a clinician.
>
> Identifiers, anthropometrics, BMI, and the composite score with its band and a written impression.
> Then the domain profile radar and the WOMAC subscale breakdown.
>
> Then two tables that do the real work. **Contributing Findings** shows each domain, what evidence
> fed it, its score, its weight and its contribution to the total — so the number is auditable, not
> a black box. **Detailed measurements** lists every individual test with its result, detail and
> interpretation.
>
> Then findings ranked major or minor, recommendations tagged by type, and preventive guidance.
>
> Two presentation notes. **The radar and bar charts do not print** — they are screen-only, and the
> PDF is deliberately tables-only, so a printed report stays legible in black and white. And the
> limitations block is forced open in print, because a caveat that does not print is not a caveat.

### SCENE 7.2 — The limitations, read aloud

**VISUAL:** Expand **Method, limitations and how to read this report**, and hold on it.

**ON-SCREEN — the six printed limitations:**
1. `Camera-derived movement measures (gait, balance, range of motion) are vision-based proxies, not instrumented measurements, and are most reliable when the subject is fully in frame under even lighting.`
2. `The 4-metre gait speed is timed from the first to the last detected step once four or more steps are seen, which removes operator reaction delay.`
3. `Step count feeds cadence and step length only. It never influences the time-based SPPB gait score.`
4. `The X-ray grade comes from an EfficientNet-B0 model that achieved 60.6% accuracy on 1,656 held-out radiographs, with KL1 recall of only 7.4%. It systematically under-reports early disease and must be confirmed by a radiologist.`
5. `Risk bands (low <30, moderate 30-64, high >=65) and fusion weights are provisional and require calibration against clinical outcomes.`
6. `Force-test and IMU scores depend on the respective hardware being connected; confirm every stored reading against the source device before clinical use.`

**VO:**

> I am going to read the limitations, because I think a screening tool that will not state its own
> weaknesses should not be trusted with patients.
>
> The movement measures are vision-based proxies, not instrumented measurements. The gait timing is
> taken from detected footfalls, not the operator's thumb, precisely to remove reaction delay. Step
> count never touches the SPPB score. The X-ray model is 60.6% accurate with 7.4% recall on early
> disease. The risk bands and fusion weights are provisional and uncalibrated. And sensor-dependent
> scores depend on the hardware being connected.
>
> Every one of those is printed on the report itself. Not in a help page. On the document the
> clinician takes away.

### SCENE 7.3 — Print and PDF

**VISUAL:** Click **Download PDF**, then **Print / Save PDF**.

**VO:**

> **Download PDF** generates a formatted A4 document in the browser using jsPDF — patient block,
> composite score panel, the two tables, findings, recommendations, limitations and signature lines.
> Nothing is uploaded; the PDF is built entirely client-side. The filename is
> `SANDHIQ-report-<name>-<date>.pdf`.
>
> **Print / Save PDF** uses the browser's print pipeline. Notice what happens: the sidebar, the
> mobile header and the floating assistant widget are all stripped out by print stylesheets, because
> otherwise they print straight over the clinical content.

**VISUAL:** Briefly show the print preview.

---

## PART 8 — SETTINGS, LANGUAGES, OFFLINE (26:30 – 27:30)

**VISUAL:** **Settings** → `/settings`

**ON-SCREEN:**
- **Language** card with a grid of four: English / हिन्दी / অসমীয়া / Nagamese, selected one showing a check
- **About This Device** card
- **Danger zone** with a wipe button
- Confirm dialog: `This deletes ALL patients, screenings, and accounts on this device. Continue?`

**VO:**

> Settings has three things. Language — four options, applied instantly across the whole interface.
>
> The About panel, which is accurate: data is stored locally in the browser, nothing is sent to a
> server, and it works fully offline.
>
> And a danger zone that wipes every patient, screening and account on the device — behind a
> confirmation, because that is a genuinely irreversible action.

**VISUAL:** Toggle to Hindi mid-sentence to show the switch is instant.

**VO:**

> One honest limitation of the offline-first design: **data lives on the device it was entered on.**
> There is no server database and no multi-device sync yet. The schema already has a sync queue
> scaffolded for it, but it is not wired to a backend. For a single-clinic deployment that is a
> reasonable trade — it is what makes the app deployable with zero configuration. For a multi-clinic
> rollout it is the first thing that has to change.

---

## PART 9 — THE ASSISTANT (27:30 – 28:00)

**VISUAL:** Open the assistant bubble, bottom right.

**ON-SCREEN:**
- Header: **SANDHIQ Assistant** / `Local clinical guide`
- Greeting: `Ask about using SANDHIQ or general osteoarthritis education.`
- Input placeholder: `Type your question…`
- Footer: `Offline AI — powered by Ollama on this device`
- `Voice input is available in Hindi and English.`
- If Ollama is not running: `The AI assistant is not running on this device.` / `Start Ollama, then try again.`

**VO:**

> A small local assistant, bottom right, on every screen. It runs entirely on **Ollama** on this
> machine — no cloud, no API key. It answers questions about using the platform and general
> osteoarthritis education, and it accepts **voice input in Hindi and English**, which matters when
> the person operating it may not read English comfortably.
>
> It is optional. If Ollama is not running, the app says so plainly and the rest of SANDHIQ is
> unaffected.

---

## PART 10 — UNDER THE HOOD (optional, 3–4 min)

**VISUAL:** Slide/overlay of code, or a terminal.

**VO:**

> A few words on how it is built, for anyone who wants to extend it.
>
> **Next.js 14** App Router, React 18, Tailwind. All client-side.
>
> **Storage is Dexie over IndexedDB** — five tables: users, patients, screenings, screeningSteps,
> and a syncQueue. There is no server database, deliberately: it is what makes the app fully
> offline-capable and deployable with zero configuration.
>
> **The ML service is Python and Flask on loopback**, port 8000, holding an EfficientNet-B0 Keras
> model. Next.js proxies to it so the browser only ever talks to one origin and the ML service is
> never exposed to the network. TensorFlow cannot run inside Next.js, so it is a separate process —
> which is why `npm run ml:serve` has to be running for the X-ray step.
>
> **Pose estimation is TensorFlow.js** in the browser, MoveNet SinglePose on WebGL. That one needs
> no Python at all, which is why the camera step works on a plain laptop.
>
> **Only two ports are opened to the LAN** — UDP 5005 and 5006. They carry fixed-size telemetry
> frames and accept no commands. Nothing unauthenticated is exposed.

### Optional 60-second "engineering details worth knowing"

If you want a short cut demonstrating depth, these are genuinely interesting and all verifiable
in the code:

- The IMU DSP order is deliberate: de-trend to remove gravity, *then* band-pass, *then* rebuild the
  magnitude vector. Computing the magnitude first — the obvious approach — buries a 0.5 m/s²
  tremor in the 9.8 m/s² gravity offset, where it only modulates the reading by about 0.6%, and a
  circular shake leaves the magnitude mathematically constant and the trial scores zero.
- The camera's pixel-to-centimetre conversion uses a 38 cm biacromial shoulder reference, and gait
  speed uses the physically marked 4 m walkway.
- The X-ray step detects and **discards** results from an older placeholder classifier rather than
  carrying a fabricated grade into a clinical report.
- The PDF generator had real layout bugs recorded in its comments — overlapping patient-box rows,
  the score heading overprinting the risk band, a table header breaking mid-word.
- Grad-CAM rendering masks attention below a threshold before colouring. The original flat 40%
  `jet` overlay tinted every pixel and made the radiograph unreadable.

---

## PART 11 — CLOSE (28:00 – 29:00)

**VISUAL:** Return to the dashboard. Fade to the title card.

**VO:**

> So — that is the complete flow. Sign in, register a patient, work through eight tests, get one
> fused risk score and a printable report that states its own limitations.
>
> Six things I want to leave you with.
>
> One: **it works offline, on one device, with no server.** That is not a limitation to apologise
> for in a rural setting — it is the feature.
>
> Two: **every sensor step has a real manual fallback.** Not a disabled button and not a fake zero —
> an alternative measurement method that a clinician can legitimately use.
>
> Three: **it does not show stale data as live.** Quiet sensors get struck through and labelled.
>
> Four: **it discloses its own accuracy.** 60.6% on the X-ray, 7.4% recall on early disease, printed
> on the report.
>
> Five: **it refuses to guess.** Untranslated medical questions stay in English rather than becoming
> a bad machine translation, and low-confidence results are flagged instead of dressed up.
>
> Six: **nothing here is a diagnosis.** Every threshold in this application is an engineering
> starting point pending clinical validation, and the app says so on every screen where it matters.
>
> If you want to build on it, the pieces are a Next.js frontend, a Flask inference service, a
> browser-side pose model, and a Dexie schema with a sync queue waiting for a backend.
>
> I will put the repository and setup instructions in the description. Thanks for watching.

---

## APPENDIX A — SHOT LIST

| # | Scene | Screen | Notes |
|---|---|---|---|
| 1 | Cold open | Title card → `/login` | 40s |
| 2 | Login screen | `/login` | Pan across fields |
| 3 | Create account | `/signup` | Show role dropdown, password validation |
| 4 | Sign in | `/login` → `/dashboard` | — |
| 5 | Shell | Dashboard | Pan sidebar, show collapse |
| 6 | Dashboard populated | `/dashboard` | **Requires prepared data** |
| 7 | Patient list | `/patients` | Show search |
| 8 | Registration form | `/patients/new` | Type slowly |
| 9 | Live BMI | `/patients/new` | Enter 162 / 78 |
| 10 | Patient record | `/patients/[id]` | Trend + history |
| 11 | Wizard intro | `/screening/[id]` | Hold on the 8 chips |
| 12 | WOMAC | step 1 | Answer 3–4, show progress |
| 13 | FIHOA | step 2 | Show 3-point scale |
| 14 | Hand — voice | step 3 | **Let audio play 5s** |
| 15 | Hand — gallery | step 3 | Open lightbox |
| 16 | Grip — sensor | step 4 | See Part 0.2 first |
| 17 | Grip — manual | step 4 | Type 22.5, show band |
| 18 | IMU — no gateway | step 5 | Stop `npm run ml:serve` first |
| 19 | IMU — stale guard | step 5 | Unpower one node mid-session |
| 20 | IMU — live trial | step 5 | 8s hold + score |
| 21 | IMU — simulated/manual | step 5 | Show amber labels |
| 22 | Camera — laptop | step 6 | Model load → skeleton |
| 23 | Camera — one test | step 6 | Run chair stand or ROM |
| 24 | Camera — SPPB panel | step 6 | Show /12 and sub-scores |
| 25 | X-ray — upload | step 7 | — |
| 26 | X-ray — Grad-CAM | step 7 | Toggle map, hold |
| 27 | X-ray — reliability | step 7 | **Expand and hold 5s** |
| 28 | X-ray — skip | step 7 | Show re-weighting |
| 29 | Review + radar | step 8 | Point at weights |
| 30 | Report | `/report/[id]` | Scroll slowly |
| 31 | Limitations | `/report/[id]` | Expand, hold |
| 32 | PDF download | `/report/[id]` | Open the file |
| 33 | Print preview | `/report/[id]` | Show chrome stripped |
| 34 | Settings | `/settings` | Switch to Hindi |
| 35 | Assistant | any screen | Ask one question |
| 36 | Close | `/dashboard` | Title card |

---

## APPENDIX B — ON-SCREEN STRINGS YOU MUST SHOW, NOT DESCRIBE

The app is unusually good about stating its own limits. Put these on screen rather than
paraphrasing them in narration — that is the app's credibility, and it is worth showing.

- `Voice-guided — automated image analysis is planned for a future release; this step is completed by the health worker's own observation.`
- `stale — last packet Ns ago, not a live reading`
- `No load cell is reporting on this host.`
- `The model is weakest at KL1, so early-stage changes are frequently reported as KL0.`
- `Low-confidence estimate — the model is close between adjacent grades. Treat this as an indication only and have a radiologist confirm.`
- `Structural–Functional Mismatch: …`
- `Screening triage aid only — not a diagnosis. Weights and thresholds are engineering starting points (TBV) pending clinical validation.`
- `X-ray unavailable — weights rebalanced across remaining tests.`
- `Incomplete screening: N of M measurements recorded`
- `Postural-sway proxy, not the SPPB balance item`
- `Simulated input, not a wearable measurement` — IMU rows only

---

## APPENDIX C — THRESHOLDS QUICK REFERENCE

For answering questions in the comments.

**Fusion bands:** Low < 30 · Moderate 30–64 · High ≥ 65
**Fusion weights (with X-ray):** structural 0.25 · functional 0.25 · biomechanical 0.20 · contextual 0.20 · hand 0.10
**Fusion weights (no X-ray):** structural 0 · functional 0.33 · biomechanical 0.27 · contextual 0.27 · hand 0.13
**Mismatch trigger:** |structural − functional| ≥ 40

**WOMAC:** pain /20 · stiffness /8 · function /68 · total /96. Bands: Low < 25% · Moderate < 50% · High ≥ 50%
**FIHOA:** total /30. Same bands.

**Rope pull (sex-stratified):** male < 27 low · 27–36.9 moderate · ≥ 37 healthy. Female < 16 low · 16–25.9 moderate · ≥ 26 healthy.
*(Grip-dynamometry cut-offs applied to a rope pull — see 6.4c.)*

**IMU:** vibration 0.30–0.90 m/s² · jerk 6.0–20.0 m/s³ · sway 5.0–15.0 °/s · tremor band 1.5–7.0 Hz.
Weights 0.45 / 0.30 / 0.25; frequency excluded. Bands: High ≥ 70 · Moderate ≥ 30 · Low < 30. Hold 8 s.

**SPPB (/12):** chair stand ≥ 19.20 s → 1 pt · ≥ 16.20 → 2 · ≥ 13.70 → 3 · else 4.
Gait > 8.70 s → 1 · ≥ 6.21 → 2 · ≥ 4.83 → 3 · else 4.
Sway > 6.00 cm → 0 · ≥ 4.50 → 1 · ≥ 3.00 → 2 · ≥ 2.00 → 3 · else 4 (requires ≥ 10 s).
Sub-score → /100: 4→95 · 3→82 · 2→68 · 1→55 · 0→45.

**TUG:** < 10 s Low · < 20 s Moderate · < 30 s High · ≥ 30 s High.

**X-ray:** KL0–KL4. TTA 0.30 original / 0.70 flipped. Confidence floor 0.55. Ambiguity margin 0.15. Severe at KL ≥ 3.
Model: EfficientNet-B0, 60.6% accuracy, 1,656 held-out radiographs, KL1 recall 7.4%.

**BMI (WHO Asian-Indian):** 18.5 / 23 / 27.5 / 32.5 / 37.5
**BMI (WHO standard):** 18.5 / 25 / 30 / 35 / 40

**Registration ranges:** age 1–120 · height 100–230 cm · weight 20–300 kg

**Ports:** Next 3000 · Flask ML 8000 · Ollama 11434 · IMU thigh UDP 5005 · IMU shank UDP 5006
