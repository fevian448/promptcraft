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
    const raw = [];                          // simpan utk tugas latar
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));         // paip mentah — latensi kekal sama
      raw.push(value);
    }
    // Pulangkan hasil assistant SUPAYA tugas latar ada bahan utk disemak.
    // Tanpa ini backgroundHelper TIDAK PERNAH jalan pada pusingan pertama:
    // body permintaan hanya mengandungi mesej user; kandungan assistant
    // wujud hanya di dalam respons yang baru sahaja disalir keluar.
    return extractAssistant(Buffer.concat(raw));
  } finally {
    clearTimeout(timer);
  }
}

function extractAssistant(buf) {
  let out = "";
  for (const line of buf.toString("utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s);
      const c = o && o.message && o.message.content;
      if (c) out += c;
    } catch {}                                 // baris separa / bukan JSON
  }
  return out;
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
   TUGAS LATAR (wrangler) — menolong AI lokal TANPA menghalang
   ------------------------------------------------------------
   Dipanggil SELEPAS respons sudah dihantar ke pengguna, dan sengaja
   tidak di-await. Kegagalan apa pun — termasuk had neuron harian
   10,000/hari — dibiarkan senyap, jadi pengguna TIDAK PERNAH nampak
   kesan wrangler. Itulah maksud "hanya menolong ... tugas belakang".

   Tugas latar #1: semak kod HTML hasil janaan lokal.
   Hantar HANYA dokumen akhir (bukan seluruh sejarah) supaya input
   kekal kecil — bajet neuron harian itu pendek.
   ============================================================ */
async function backgroundHelper(doc) {
  if (!remoteReady) return null;               // tiada wrangler → tiada tugas
  if (!doc) return null;                        // tiada hasil utk disemak

  const probe = [
    { role: "system", content: "You are a strict, terse HTML reviewer." },
    { role: "user", content:
        String(doc).slice(0, 24000) +
        "\n\n---\nSemak dokumen HTML di atas. Balas DENGAN SATU baris sahaja: " +
        "OK jika lengkap dan sah, selain itu hanya kecacatan paling serius " +
        "(tag tak tertutup, tiada </html>, sumber luar, atau logik rosak)." }
  ];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(REMOTE_BASE_URL + "chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + REMOTE_API_KEY
      },
      body: JSON.stringify({
        model: REMOTE_MODEL,
        messages: probe,
        stream: false,
        temperature: 0,
        max_tokens: Math.min(MAX_TOKENS, 400)
      }),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error("helper HTTP " + r.status);
    const data = await r.json();
    const line = (data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content || "").trim();
    if (line) log("helper latar:", line.slice(0, 200));
    return line || null;
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
    // LOKAL kekal tunjang — pemilik: "lokal ai tetap berjalan ... wrangler hanya
    // menolong ... tugas belakang sahaja". Maka kewujudan wrangler TIDAK menukar
    // lalai: pilihan awan kekal tersenarai tapi tak menjadi default.
    // "hybrid" di sini bermaksud DATA keluar dari kotak (→ privacyMode "cloud"),
    // BUKAN siapa yang menjana — penjanaan tetap Ollama lokal.
    default: localModels[0] || (remoteReady ? REMOTE_MODEL : null),
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

      // --- TUNJANG: Ollama lokal SENTIASA menjawab prompt pengguna. ---
      // Keputusan pemilik: "lokal ai tetap berjalan ... wrangler hanya menolong
      // ... menjalankan tugas belakang SAHAJA". Jadi wrangler TIDAK PERNAH
      // mengambil alih respons ini — ini songsongkan keutamaan lama
      // (awan dulu → lokal fallback) yang akan memecahkan kehendak tu.
      const doc = await localChat(body, res);
      if (!res.writableEnded) res.end();

      // --- TUGAS LATAR: serentak, tak menyekat, gagal = senyap. ---
      // Sengaja TIDAK di-await supaya pengguna tak pernah nampak kesan
      // wrangler — termasuk bila had neuron harian (10k/hari) sudah habis.
      backgroundHelper(doc).catch((err) =>
        log("helper latar gagal (dibiarkan):", err && err.message));
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
