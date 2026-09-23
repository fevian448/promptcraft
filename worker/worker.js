/* ============================================================
   PromptCraft AI Worker  (Cloudflare Workers + Workers AI)
   ------------------------------------------------------------
   Inilah bahagian "wrangler" dalam seni bina:

     browser → nginx → proxy (Node :3000) → Worker ni → Workers AI (awan)
                                                  └─ fallback: Ollama lokal

   KONTRAK (wajib sepadan dgn proxy/server.js remoteChat()):
     - hantar  : POST .../chat/completions, OpenAI format, stream:true,
                 header "Authorization: Bearer <token>"
     - terima  : SSE OpenAI — baris "data: {json}" dgn
                 obj.choices[0].delta.content  ATAU  obj.choices[0].message.content,
                 diakhiri "data: [DONE]"
   Workers AI sendiri mengeluarkan SSE bentuk {"response":"..."} — jadi tugas
   utama fail ni ialah MEMETERJAH format itu. Tanpa terjemahan, proxy akan
   gagal dgn "remote: tiada teks dihasilkan".

   Token disimpan sebagai `wrangler secret` (AKAN DATANG) — takkan masuk repo.
   ============================================================ */
"use strict";

const DEFAULT_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    /* --- gagal tertutup: tanpa token, endpoint awam ni mesti TIDAK berbuka --- */
    if (!env.AUTH_TOKEN) {
      return j({
        error: {
          message: "AUTH_TOKEN belum ditetapkan — jalankan: "
                 + "wrangler secret put AUTH_TOKEN",
          type: "config",
        },
      }, 503);
    }
    const given = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "").trim();
    if (!given || given !== env.AUTH_TOKEN) {
      return j({ error: { message: "unauthorized", type: "auth" } }, 401);
    }

    /* --- pemeriksaan kesihatan (dipakai CD untuk mengesahkan deploy) --- */
    if (request.method === "GET" && (path === "/" || path.endsWith("/health"))) {
      return j({
        ok: true,
        provider: "cloudflare-workers-ai",
        model: env.MODEL || DEFAULT_MODEL,
      });
    }

    if (request.method !== "POST" || !path.endsWith("/chat/completions")) {
      return j({ error: { message: "guna POST " + path + "/chat/completions" } }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return j({ error: { message: "bad JSON", type: "invalid_request" } }, 400);
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return j({ error: { message: "messages kosong", type: "invalid_request" } }, 400);
    }

    // proxy menghantar stream:true; ikut kehendaknya kecuali ia meminta sebaliknya
    const wantStream = body.stream !== false;
    const model = env.MODEL || DEFAULT_MODEL;

    const params = {
      messages,
      max_tokens: clampInt(body.max_tokens, 1, 32768, 4000),
      temperature: clampNum(body.temperature, 0, 5, 0.25),
      stream: wantStream,
    };
    if (typeof body.top_p === "number") params.top_p = clampNum(body.top_p, 0, 2, 1);

    let out;
    try {
      out = await env.AI.run(model, params);
    } catch (e) {
      // had neuron harian / ralat model → biar proxy jatuh ke Ollama lokal
      return j({
        error: {
          message: String((e && e.message) || e),
          type: "workers_ai",
        },
      }, 502);
    }

    if (wantStream) return sseToOpenAI(out);

    return j({
      id: "chatcmpl-" + crypto.randomUUID(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: (out && out.response) || "" },
        finish_reason: "stop",
      }],
      usage: out && out.usage,
    });
  },
};

/* ---------- terjemahan: SSE Workers AI → SSE OpenAI ---------- */
function sseToOpenAI(src) {
  const enc = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (obj) =>
        controller.enqueue(enc.encode("data: " + JSON.stringify(obj) + "\n\n"));
      const delta = (content) =>
        emit({ id: "chatcmpl", object: "chat.completion.chunk",
               choices: [{ index: 0, delta: { content }, finish_reason: null }] });

      try {
        const reader = typeof src.getReader === "function" ? src.getReader() : null;
        if (reader) {
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line.startsWith("data:")) continue;
              handle(line.slice(5).trim(), emit, delta);
            }
          }
          if (buf.trim()) handle(buf.trim().replace(/^data:\s*/, ""), emit, delta);
        } else if (typeof src === "string") {
          handle(src, emit, delta);
        }
        emit({ id: "chatcmpl", object: "chat.completion.chunk",
               choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (e) {
        emit({ error: { message: String((e && e.message) || e) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: Object.assign({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    }, cors()),
  });
}

function handle(data, emit, delta) {
  if (!data || data === "[DONE]") return;
  let obj;
  try { obj = JSON.parse(data); } catch { return; }
  if (obj && obj.error) {
    emit({ error: { message: String(obj.error.message || obj.error) } });
    return;
  }
  const piece = typeof obj.response === "string" ? obj.response
              : (obj.response && obj.response.content) || "";
  if (piece && piece !== "[DONE]") delta(piece);
}

/* ---------- utiliti ---------- */
function j(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json" }, cors()),
  });
}
function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt;
}
function clampNum(v, lo, hi, dflt) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(Math.max(v, lo), hi) : dflt;
}
