// lib/db.js
// SANDHIQ offline data layer.
//
// Everything lives in the browser's IndexedDB via Dexie. There is no
// server-side database — this is intentional: it is what makes the app
// (a) fully offline-capable on a single field device, and (b) trivially
// deployable to Vercel with zero configuration (no DB provisioning, no
// connection strings, no env vars).
//
// Trade-off to know: data lives on the device it was entered on. If you
// later need multi-device sync for a real clinic network, the place to
// add it is the `syncQueue` table below (already scaffolded) plus a real
// backend — see README.md "Scaling beyond a single device".

import Dexie from "dexie";

export const db = new Dexie("medhaOA");

db.version(1).stores({
  // Health workers / admins who can log in on this device
  users: "++id, &username, role",

  // Patients registered on this device
  patients:
    "++id, patientCode, name, age, sex, phone, village, createdAt",

  // One row per completed or in-progress screening session
  screenings:
    "++id, patientId, status, createdAt, updatedAt, xrayAvailable",

  // Raw step-level data for a screening (one row per step per session)
  screeningSteps: "++id, screeningId, stepKey, updatedAt",

  // Queue for future server sync (not wired to a backend yet — see README)
  syncQueue: "++id, table, recordId, action, createdAt, synced",
});

// ---------- Users ----------
export async function createUser({ username, passwordHash, name, role }) {
  const existing = await db.users.where("username").equals(username).first();
  if (existing) throw new Error("Username already exists");
  const id = await db.users.add({
    username,
    passwordHash,
    name,
    role: role || "health_worker",
    createdAt: Date.now(),
  });
  return db.users.get(id);
}

export async function findUserByUsername(username) {
  return db.users.where("username").equals(username).first();
}

export async function countUsers() {
  return db.users.count();
}

// ---------- Patients ----------
export async function createPatient(patient) {
  // Anthropometrics are compulsory: BMI is part of the clinical report and the
  // obesity load on the medial knee, so a record without them is incomplete.
  const h = Number(patient.heightCm);
  const w = Number(patient.weightKg);
  if (!Number.isFinite(h) || h < 100 || h > 230) {
    throw new Error("Height is required and must be between 100 and 230 cm.");
  }
  if (!Number.isFinite(w) || w < 20 || w > 300) {
    throw new Error("Weight is required and must be between 20 and 300 kg.");
  }
  const patientCode = "SND-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const id = await db.patients.add({
    ...patient,
    heightCm: h,
    weightKg: w,
    patientCode,
    createdAt: Date.now(),
  });
  return db.patients.get(id);
}

export async function listPatients() {
  return db.patients.orderBy("createdAt").reverse().toArray();
}

export async function getPatient(id) {
  return db.patients.get(Number(id));
}

export async function searchPatients(query) {
  const all = await db.patients.toArray();
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.patientCode?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.village?.toLowerCase().includes(q)
  );
}

// ---------- Screenings ----------
export async function createScreening(patientId) {
  const id = await db.screenings.add({
    patientId: Number(patientId),
    status: "in_progress", // in_progress | completed
    xrayAvailable: null, // decided during the xray step
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return db.screenings.get(id);
}

export async function getScreening(id) {
  return db.screenings.get(Number(id));
}

export async function updateScreening(id, patch) {
  await db.screenings.update(Number(id), { ...patch, updatedAt: Date.now() });
  return db.screenings.get(Number(id));
}

export async function listScreeningsForPatient(patientId) {
  return db.screenings
    .where("patientId")
    .equals(Number(patientId))
    .reverse()
    .sortBy("createdAt");
}

export async function listAllScreenings() {
  return db.screenings.orderBy("createdAt").reverse().toArray();
}

// ---------- Screening steps ----------
export async function saveStep(screeningId, stepKey, data) {
  const existing = await db.screeningSteps
    .where({ screeningId: Number(screeningId), stepKey })
    .first();
  if (existing) {
    await db.screeningSteps.update(existing.id, {
      data,
      updatedAt: Date.now(),
    });
    return db.screeningSteps.get(existing.id);
  }
  const id = await db.screeningSteps.add({
    screeningId: Number(screeningId),
    stepKey,
    data,
    updatedAt: Date.now(),
  });
  return db.screeningSteps.get(id);
}

export async function getStep(screeningId, stepKey) {
  return db.screeningSteps
    .where({ screeningId: Number(screeningId), stepKey })
    .first();
}

export async function getAllSteps(screeningId) {
  const rows = await db.screeningSteps
    .where("screeningId")
    .equals(Number(screeningId))
    .toArray();
  const map = {};
  for (const r of rows) map[r.stepKey] = r.data;
  return map;
}

// ---------- Utility: seed / reset (dev convenience) ----------
export async function wipeAllData() {
  await db.transaction(
    "rw",
    db.users,
    db.patients,
    db.screenings,
    db.screeningSteps,
    db.syncQueue,
    async () => {
      await Promise.all([
        db.users.clear(),
        db.patients.clear(),
        db.screenings.clear(),
        db.screeningSteps.clear(),
        db.syncQueue.clear(),
      ]);
    }
  );
}
