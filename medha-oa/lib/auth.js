// lib/auth.js
//
// Lightweight, fully client-side authentication.
//
// IMPORTANT — read this before a real deployment with real patient data:
// Because SANDHIQ has no server/database (see lib/db.js), "login" here
// means "unlock this browser/device", not "authenticate against a secure
// server". Passwords are hashed (SHA-256 + per-user salt) before storage
// so a casual glance at IndexedDB doesn't reveal plaintext, but this is
// NOT the same guarantee as bcrypt/argon2 + a server-side identity
// provider. This is intentional for an offline field-deployment MVP.
//
// Production upgrade path (see README "Scaling beyond a single device"):
// swap this module for NextAuth.js (or your hospital's SSO) backed by a
// real database, once you're ready to move off single-device storage.

import { createUser, findUserByUsername } from "./db";

const SESSION_KEY = "medha_oa_session";

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signup({ username, password, name, role }) {
  const salt = randomSalt();
  const passwordHash = await sha256(salt + password);
  const user = await createUser({
    username,
    passwordHash: `${salt}$${passwordHash}`,
    name,
    role,
  });
  setSession(user);
  return user;
}

export async function login({ username, password }) {
  const user = await findUserByUsername(username);
  if (!user) throw new Error("No account found with that username");
  const [salt, hash] = user.passwordHash.split("$");
  const attempt = await sha256(salt + password);
  if (attempt !== hash) throw new Error("Incorrect password");
  setSession(user);
  return user;
}

export function setSession(user) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role })
  );
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
