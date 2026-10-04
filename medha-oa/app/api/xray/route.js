/**
 * X-ray KL grading proxy.
 *
 * The classifier is the deployed EfficientNet-B0 Keras model
 * (MEDHA_OA_DEPLOY/model/medha_oa_kl_final.keras). It runs in a local Python
 * service (medha-oa/ml/server.py) because TensorFlow cannot execute inside
 * Next.js. This route keeps the browser talking only to the Next origin, so
 * the ML service stays on loopback and is never exposed to the network.
 *
 *   POST /api/xray            multipart "file" -> KL grade + probabilities
 *   GET  /api/xray            health + model metadata
 */

const ML_BASE = process.env.MEDHA_ML_URL || "http://127.0.0.1:8000";
const PREDICT_TIMEOUT_MS = Number(process.env.MEDHA_ML_TIMEOUT_MS || 120000);
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"]);

function fail(code, message, status) {
  return Response.json({ error: code, message }, { status });
}

export async function GET() {
  try {
    const res = await fetch(`${ML_BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const health = await res.json().catch(() => null);
    if (!res.ok) {
      return fail("MODEL_UNAVAILABLE", health?.error || "ML service is not available.", 503);
    }
    let metadata = null;
    try {
      const metaRes = await fetch(`${ML_BASE}/metadata`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (metaRes.ok) metadata = await metaRes.json();
    } catch {
      // Metadata is advisory; a prediction must not fail because of it.
    }
    return Response.json({ ...health, metadata }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(
      "MODEL_UNAVAILABLE",
      "The X-ray analysis service is not running. Start it with: npm run ml:serve",
      503
    );
  }
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail("BAD_REQUEST", "Expected a multipart form upload.", 400);
  }

  const file = form.get("file") || form.get("image");
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail("BAD_REQUEST", "No image file was included in the upload.", 400);
  }
  if (file.size <= 0) {
    return fail("BAD_REQUEST", "The uploaded file is empty.", 400);
  }
  if (file.size > MAX_BYTES) {
    return fail("FILE_TOO_LARGE", "Image is too large (limit 20 MB).", 413);
  }
  // Some browsers/clients send an empty type for drag-and-drop; trust the
  // extension only when the MIME type is missing, never over a real mismatch.
  const type = (file.type || "").toLowerCase();
  if (type && !ALLOWED.has(type)) {
    return fail("UNSUPPORTED_TYPE", `Unsupported image type '${type}'. Use JPEG or PNG.`, 415);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let upstream;
  try {
    const payload = new FormData();
    payload.append("file", new Blob([bytes], { type: type || "image/jpeg" }), file.name || "xray.jpg");
    upstream = await fetch(`${ML_BASE}/predict`, {
      method: "POST",
      body: payload,
      signal: AbortSignal.timeout(PREDICT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return fail(
      timedOut ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE",
      timedOut
        ? "The X-ray model took too long to respond. Please try again."
        : "The X-ray analysis service is not running.",
      timedOut ? 504 : 503
    );
  }

  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body) {
    const message = body?.error || "The X-ray model could not analyse this image.";
    const status = upstream.status === 400 ? 400 : upstream.status === 503 ? 503 : 502;
    // Preserve MODEL_UNAVAILABLE so the UI can offer the start command; a 400
    // from the service is a bad image, not a broken model.
    const code = status === 400 ? "INVALID_IMAGE" : body?.code || "MODEL_ERROR";
    return fail(code, message, status);
  }

  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
