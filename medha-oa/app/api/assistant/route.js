const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3:latest";

// llama3 was trained with an 8192-token context. The Ollama server on this
// machine is configured with OLLAMA_CONTEXT_LENGTH=65536, and allocating a KV
// cache that large made the llama runner abort with
// "ggml_cuda_host_malloc: failed to allocate ... resource already mapped",
// which surfaces as an HTTP 500 from /api/chat. Pinning num_ctx per request
// keeps the working 8k context without touching the machine-wide Ollama config.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 8192;

// CPU/GPU inference is slow: a 4.6 GB model took ~17 s for a detailed answer.
// The previous 60 s ceiling could cut a long answer off mid-stream.
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 180000;

const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  as: "Assamese (অসমীয়া: নমস্কাৰ)",
  nag: "Nagamese (Nagamese: Namaskar)",
};

function fail(code, status, message) {
  return Response.json({ error: code, message }, { status });
}

/** True when Ollama itself is reachable and healthy. */
export async function GET() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return fail("OLLAMA_UNAVAILABLE", 503, "Ollama responded with an error.");
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name);
    return Response.json({
      ok: true,
      model: OLLAMA_MODEL,
      available: models.includes(OLLAMA_MODEL),
      models,
    });
  } catch {
    return fail("OLLAMA_UNAVAILABLE", 503, "Cannot reach Ollama on this device.");
  }
}

export async function POST(request) {
  let messages = [];
  let lang = "en";

  try {
    const body = await request.json();
    messages = Array.isArray(body.messages) ? body.messages : [];
    lang = body.lang || "en";
  } catch {
    return fail("BAD_REQUEST", 400, "Request body must be JSON.");
  }

  const language = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  const system = `You are SANDHIQ Assistant. Help health workers use the SANDHIQ osteoarthritis screening app and provide general, non-diagnostic osteoarthritis education. Never diagnose, prescribe, or present screening as a diagnosis; recommend seeing a qualified doctor for anything beyond general guidance. Respond in ${language}. If Assamese or Nagamese output quality is poor, clearly label an English fallback rather than confidently producing incorrect text. Keep replies concise and practical.`;

  const payload = JSON.stringify({
    model: OLLAMA_MODEL,
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
    options: { num_ctx: NUM_CTX },
  });

  // The llama runner occasionally aborts while allocating GPU memory and Ollama
  // answers 500. The runner is reloaded on the next request, so one retry
  // recovers silently instead of showing the user an error.
  for (let attempt = 0; attempt < 2; attempt++) {
    let upstream;
    try {
      upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      if (attempt === 0) continue;
      return timedOut
        ? fail("OLLAMA_TIMEOUT", 504, `Ollama did not respond within ${Math.round(TIMEOUT_MS / 1000)}s.`)
        : fail("OLLAMA_UNREACHABLE", 503, "Cannot reach Ollama on this device.");
    }

    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    // 500 here means the runner crashed mid-load, not that Ollama is down.
    if (upstream.status >= 500 && attempt === 0) continue;

    return fail(
      "OLLAMA_ERROR",
      502,
      `Ollama returned HTTP ${upstream.status} for model ${OLLAMA_MODEL}.`,
    );
  }

  return fail("OLLAMA_ERROR", 502, "Ollama failed twice to serve the request.");
}
