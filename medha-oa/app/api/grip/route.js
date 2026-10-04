/**
 * Grip load-cell proxy.
 *
 * The HX711 needs real GPIO pins, which only the Linux host driving the
 * gateway has. This route reports whether a load cell is actually readable so
 * the grip step can fall back to manual/dynamometer entry instead of showing a
 * confident 0 kg.
 *
 *   GET /api/grip   { available, kg, note, ... }
 */

const ML_BASE = process.env.MEDHA_ML_URL || "http://127.0.0.1:8000";
const TIMEOUT_MS = Number(process.env.MEDHA_GRIP_TIMEOUT_MS || 10000);

export async function GET() {
  try {
    const res = await fetch(`${ML_BASE}/api/grip/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return Response.json(
        {
          error: "GATEWAY_UNAVAILABLE",
          message: "The sensor service is not running. Start it with: npm run ml:serve",
          available: false,
          kg: null,
        },
        { status: res.status === 503 ? 503 : 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // "Not available" is the honest answer here, not a hard failure: manual
    // entry remains a valid clinical path.
    return Response.json(
      {
        available: false,
        kg: null,
        note: "Sensor service not reachable",
        hardwareEnabled: false,
        gatewayRunning: false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
