/**
 * Live IMU gateway proxy.
 *
 * The two ESP8266 IMU nodes (thigh + shank) stream 36-byte UDP frames to ports
 * 5005/5006. Those sockets are opened by the local Python service
 * (medha-oa/ml/server.py), which also owns the scoring pipeline. This route
 * keeps the browser talking only to the Next origin, so the Python service's
 * HTTP API stays on loopback and is never exposed on the network.
 *
 *   GET  /api/imu          live gateway state: bound / online / frame counts
 *   POST /api/imu          score the rolling capture window -> risk + metrics
 *
 * The POST body is optional; `{ requireAll: true }` insists on both IMUs.
 */

const ML_BASE = process.env.MEDHA_ML_URL || "http://127.0.0.1:8000";
const STATUS_TIMEOUT_MS = Number(process.env.MEDHA_IMU_STATUS_TIMEOUT_MS || 10000);
// Scoring runs the band-pass/jerk/sway DSP over the whole window in pure
// Python, so it is far slower than a status read.
const TRIAL_TIMEOUT_MS = Number(process.env.MEDHA_IMU_TRIAL_TIMEOUT_MS || 60000);

const START_HINT =
  "The sensor service is not running. Start it with: npm run ml:serve";

function fail(code, message, status, extra = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

export async function GET() {
  try {
    const res = await fetch(`${ML_BASE}/api/imu/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return fail(
        "GATEWAY_UNAVAILABLE",
        body?.message || "The sensor gateway did not respond.",
        res.status === 409 ? 409 : 503,
        { buffered: body?.buffered ?? null }
      );
    }
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return fail(
      timedOut ? "GATEWAY_TIMEOUT" : "GATEWAY_UNAVAILABLE",
      timedOut ? "The sensor gateway did not respond in time." : START_HINT,
      timedOut ? 504 : 503
    );
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    // An empty body is valid: the service applies its own defaults.
    body = {};
  }

  let upstream;
  try {
    upstream = await fetch(`${ML_BASE}/api/imu/trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRIAL_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return fail(
      timedOut ? "TRIAL_TIMEOUT" : "GATEWAY_UNAVAILABLE",
      timedOut
        ? "Scoring the capture took too long. Try again with a steadier hold."
        : START_HINT,
      timedOut ? 504 : 503
    );
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok || !payload) {
    // 409 means "not enough frames yet", which the UI renders as a
    // connect-the-nodes prompt rather than an error.
    const code = upstream.status === 409 ? payload?.error || "NOT_ENOUGH_DATA" : "TRIAL_FAILED";
    const status = upstream.status === 409 ? 409 : upstream.status === 503 ? 503 : 502;
    return fail(code, payload?.message || "The IMU trial could not be scored.", status, {
      buffered: payload?.buffered ?? null,
    });
  }

  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
