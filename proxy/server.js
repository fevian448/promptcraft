/* ============================================================
   PromptCraft AI Proxy
   ------------------------------------------------------------
   Bercakap protokol Ollama (/api/tags, /api/chat) supaya
   frontend tak perlu tahu sedang guna cloud atau local.

   Rantaian:
     browser → nginx /api/ollama/ → proxy ni
                                     ├─ utama   : free API (OpenAI-compatible)
                                     └─ fallback: Ollama local 127.0.0.1:11434

   API key TIDAK pernah disajikan ke browser — kekal di sini.
   ============================================================ */
"use strict";

const http = require("http");

/* ---------- konfigurasi (dari environment) ---------- */
const PORT          = Number(process.env.PORT || 3000);
const LOCAL_OLLAMA  = process.env.LOCAL_OLLAMA || "http://127.0.0.1:11434";

const REMOTE_PROVIDER  = (process.env.REMOTE_PROVIDER  || "").trim();
const REMOTE_BASE_URL  = (process.env.REMOTE_BASE_URL  || "").trim();  // mesti berakhir dgn /
const REMOTE_API_KEY   = (process.env.REMOTE_API_KEY   || "").trim();
const REMOTE_MODEL     = (process.env.REMOTE_MODEL     || "").trim();

const MAX_TOKENS   = Number(process.env.REMOTE_MAX_TOKENS   || 4000);
const TEMPERATURE  = Number(process.env.REMOTE_TEMPERATURE  || 0.25);
const REQ_TIMEOUT  = Number(process.env.REMOTE_TIMEOUT_MS   || 120000);

const remoteReady = Boolean(REMOTE_PROVIDER && REMOTE_BASE_URL && REMOTE_API_KEY && REMOTE_MODEL);

/* ---------- logging (tak pernah log kunci) ---------- */
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
log("proxy siap", {
  port: PORT,
  local: LOCAL_OLLAMA,
  remote: remoteReady ? `${REMOTE_PROVIDER} → ${REMOTE_MODEL}` : "TIADA (local sahaja)"
});

/* ---------- util ---------- */
function cors(res) {
  // Frontend dipanggil dari origin yang sama (nginx), tapi kita izinkan juga
  // sekiranya ada yang akses terus.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function nd(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error("bad request: body terlalu besar")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error("bad request: JSON tidak sah")); }
    });
    req.on("error", reject);
  });
}

function openNdjson(res) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",     // minta nginx jangan buffer stream
    "Connection": "keep-alive"
  });
}

/* ============================================================
   FALLBACK: Ollama local — salin terus strimnya
   ============================================================ */
async function localChat(body, res) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 600000);

  try {
    const r = await fetch(LOCAL_OLLAMA + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, body, { stream: true })),
      signal: ctrl.signal
    });

    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => "");
      throw new Error(`ollama local HTTP ${r.status} ${t.slice(0, 200)}`);
    }

    openNdjson(res);
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));   // sudah NDJSON, salin mentah
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   UTAMA: free API (OpenAI-compatible) → terjemah ke NDJSON Ollama
   ============================================================ */
async function remoteChat(body, res) {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const payload = {
    model: REMOTE_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    temperature: typeof body.options?.temperature === "number"
      ? body.options.temperature : TEMPERATURE,
    max_tokens: typeof body.options?.num_predict === "number"
      ? Math.min(body.options.num_predict, MAX_TOKENS) : MAX_TOKENS
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);

  try {
    const r = await fetch(REMOTE_BASE_URL + "chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + REMOTE_API_KEY
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      const err = new Error(`${REMOTE_PROVIDER} HTTP ${r.status} ${t.slice(0, 300)}`);
      err.status = r.status;
      throw err;
    }
    if (!r.body) throw new Error(REMOTE_PROVIDER + ": respons kosong");

    openNdjson(res);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let anyText = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        let obj;
        try { obj = JSON.parse(data); } catch { continue; }

        const delta = obj.choices?.[0]?.delta?.content
                   ?? obj.choices?.[0]?.message?.content
                   ?? "";
        if (delta) {
          anyText = true;
          nd(res, { message: { role: "assistant", content: delta }, done: false });
        }
        if (obj.error) throw new Error(String(obj.error.message || obj.error));
      }
    }

    if (!anyText) throw new Error(REMOTE_PROVIDER + ": tiada teks dihasilkan");

    nd(res, {
      model: REMOTE_MODEL,
      message: { role: "assistant", content: "" },
      done: true,
      done_reason: "stop"
    });
    res.end();
    return true;

  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   /api/tags — senarai model utk dropdown frontend
   ============================================================ */
async function handleTags(res) {
  let localModels = [];
  try {
    const r = await fetch(LOCAL_OLLAMA + "/api/tags", { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      localModels = (d.models || []).map((m) => m.name);
    }
  } catch { /* ollama local mungkin tak jalan — bukan maut */ }

  const models = [];
  if (remoteReady) models.push(REMOTE_MODEL);
  for (const m of localModels) if (!models.includes(m)) models.push(m);

  json(res, 200, {
    models: models.map((name) => ({ name })),
    // frontend guna ni utk pilih model lalai (cloud dahulu)
    default: remoteReady ? REMOTE_MODEL : (localModels[0] || null),
    source: remoteReady ? "hybrid" : "local"
  });
}

/* ============================================================
   router
   ============================================================ */
const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0].replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }
  cors(res);

  try {
    if (req.method === "GET" && (path === "/api/tags" || path === "/tags")) {
      await handleTags(res);
      return;
    }

    if (req.method === "GET" && (path === "/healthz" || path === "/")) {
      json(res, 200, { ok: true, remote: remoteReady, provider: REMOTE_PROVIDER || null });
      return;
    }

    if (req.method === "POST" && (path === "/api/chat" || path === "/chat")) {
      const body = await readBody(req);

      if (remoteReady) {
        try {
          await remoteChat(body, res);
          return;
        } catch (err) {
          // Rate limit / ralat server → jatuh ke local supaya site tak mati.
          log("remote gagal → fallback local:", err.message);

          if (res.headersSent) {
            // Stream dah mula — tak boleh tukar hala lagi. Hentikan dengan kemas
            // DAN jangan teruskan ke local (akan cuba writeHead dua kali → 500).
            if (!res.writableEnded) {
              try {
                nd(res, {
                  message: { role: "assistant", content: "" },
                  done: true,
                  done_reason: "error",
                  error: String(err.message).slice(0, 200)
                });
                res.end();
              } catch {}
            }
            return;
          }
          // Belum hantar apa-apa → jatuh ke local secara senyap.
        }
      }

      await localChat(body, res);
      if (!res.writableEnded) res.end();
      return;
    }

    json(res, 404, { error: "not found: " + path });

  } catch (err) {
    log("ralat:", err.message);
    if (!res.headersSent) json(res, 502, { error: err.message });
    else if (!res.writableEnded) {
      try { nd(res, { error: err.message, done: true }); res.end(); } catch {}
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log("menyambut pada http://127.0.0.1:" + PORT);
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); });
process.on("SIGINT",  () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); });
