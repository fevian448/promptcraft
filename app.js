/* ============================================================
   PromptCraft — front-end logic
   Backend: Ollama di mesin lokal, di-proxy lewat nginx.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- config ---------- */
  // Prefik proxy nginx → http://127.0.0.1:11434/
  const PROXY_BASE = "/api/ollama";
  // Fallback langsung kalau proxy belum dipasang (harus dibuka dari mesin ini).
  const FALLBACK_BASES = [PROXY_BASE, "http://localhost:11434", "http://127.0.0.1:11434"];

  const SYSTEM_PROMPT = [
    "You are PromptCraft, an expert front-end engineer that generates web apps.",
    "You always answer with ONE complete, self-contained HTML document.",
    "",
    "Hard rules:",
    "1. Everything must live in that single file: inline <style> and inline <script>.",
    "2. Never use external resources: no CDN, no <link>, no import/export, no fetch to other origins, no images from the network (use emoji, gradients, CSS shapes or inline SVG instead).",
    "3. The app must work offline when opened directly from a file.",
    "4. Make it responsive and visually polished: modern dark UI, sensible spacing, clear hierarchy, hover/focus states.",
    "5. The app must actually work — implement real logic, not placeholders. Persist state in localStorage only if the app needs it.",
    "6. Reply with ONLY the code inside a ```html fenced block. No explanations, no commentary before or after.",
    "7. Never truncate. Always close </script>, </style>, </body> and </html>."
  ].join("\n");

  const NUM_PREDICT = 6000;     // 3000 ternyata kurang → output sering terpotong di tengah
  const TEMPERATURE = 0.25;
  const REPEAT_PENALTY = 1.1;   // cegah model kecil mengulang-ngulang (loop) sampai habis token
  const REPEAT_LAST_N = 512;
  const LIVE_RENDER_MS = 900;   // seberapa sering preview di-refresh saat streaming
  const LIVE_CODE_MS  = 260;    // seberapa sering panel kode di-refresh saat streaming

  /* ---------- dom ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    home: $("home"), workspace: $("workspace"),
    prompt: $("prompt"), generateBtn: $("generateBtn"),
    modelSelect: $("modelSelect"), charCount: $("charCount"), homeNote: $("homeNote"),
    chips: $("chips"),
    engineDot: $("engineDot"), engineLabel: $("engineLabel"),
    backBtn: $("backBtn"), wsTitle: $("wsTitle"),
    status: $("status"), statusSpinner: $("statusSpinner"), statusText: $("statusText"),
    copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"), zipBtn: $("zipBtn"),
    refreshBtn: $("refreshBtn"), stopBtn: $("stopBtn"),
    tabCode: $("tabCode"), tabChat: $("tabChat"), chatBadge: $("chatBadge"), codeMeta: $("codeMeta"),
    panelCode: $("panelCode"), panelChat: $("panelChat"),
    codeEl: $("codeEl"), codeView: $("codeView"),
    chatLog: $("chatLog"), chatForm: $("chatForm"), chatInput: $("chatInput"), chatSend: $("chatSend"),
    preview: $("preview"), previewPlaceholder: $("previewPlaceholder"), openBtn: $("openBtn"),
    toast: $("toast")
  };

  /* ---------- state ---------- */
  const state = {
    apiBase: null,        // base URL Ollama yang berhasil diakses
    model: null,
    code: "",             // HTML final saat ini
    streaming: false,
    abort: null,
    messages: [],         // riwayat percakapan utk iterasi
    idea: "",
    chatCount: 0,
    lastRender: 0,
    lastCode: 0,
    startedAt: 0,
    genCount: 0
  };

  /* ============================================================
     API
     ============================================================ */
  async function api(pathname, body, signal) {
    const bases = state.apiBase ? [state.apiBase] : FALLBACK_BASES;
    let lastErr = null;
    for (const base of bases) {
      try {
        const res = await fetch(base + pathname, {
          method: body ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        state.apiBase = base;
        return res;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error("Ollama tidak terjangkau");
  }

  /** GET /api/tags → {models:[...], default, source} (proxy hantar juga default/source) */
  async function listModels() {
    const res = await api("/api/tags");
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name);
    return { names, def: data.default || null, source: data.source || "local" };
  }

  /** Streaming POST /api/chat → callback per potongan teks */
  async function chatStream(messages, onDelta, signal) {
    const res = await api("/api/chat", {
      model: state.model,
      messages,
      stream: true,
      options: {
        num_predict: NUM_PREDICT,
        temperature: TEMPERATURE,
        num_ctx: 8192,
        repeat_penalty: REPEAT_PENALTY,
        repeat_last_n: REPEAT_LAST_N
      }
    }, signal);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj.error) throw new Error(obj.error);
        const piece = obj.message && obj.message.content;
        if (piece) onDelta(piece, obj);
        if (obj.done) return obj;
      }
    }
    return null;
  }

  /* ============================================================
     Ekstraksi HTML dari respons model
     ============================================================ */
  function extractHTML(text) {
    if (!text) return "";

    // 1. blok ```html ... ```
    const fence = /```(?:html|HTML)?[ \t]*\n?([\s\S]*?)```/.exec(text);
    const candidates = [];
    if (fence) candidates.push(fence[1]);

    // 2. dari doctype/html sampai penutupnya
    const start = text.search(/<!doctype\s+html|<html[\s>]/i);
    if (start !== -1) {
      const endTag = text.lastIndexOf("</html>");
      candidates.push(endTag !== -1 ? text.slice(start, endTag + 7) : text.slice(start));
    }

    // 3. mentah
    candidates.push(text);

    for (const c of candidates) {
      const t = c.trim();
      if (!t) continue;
      if (/<html[\s>]|<!doctype\s+html/i.test(t)) return stripJunk(t);
    }
    return "";
  }

  /** buang sisa markdown / backtick nyasar di ekor file */
  function stripJunk(html) {
    let out = html;
    const endIdx = out.lastIndexOf("</html>");
    if (endIdx !== -1) out = out.slice(0, endIdx + 7);
    return out.replace(/`+\s*$/, "").trimStart();
  }

  function isComplete(html) {
    return /<\/html>\s*$/i.test(html.trim()) && /<\/script>/i.test(html);
  }

  /**
   * Rapikan output yang terpotong di tengah (model kecil sering kehabisan token).
   * DOMParser menutup tag yang belum ditutup sehingga hasilnya tetap bisa dirender.
   * Return { html, salvaged }.
   */
  function salvage(html) {
    const cleaned = stripJunk(html || "");
    if (!cleaned) return { html: "", salvaged: false };
    if (isComplete(cleaned)) return { html: cleaned, salvaged: false };

    try {
      const doc = new DOMParser().parseFromString(cleaned, "text/html");
      // buang tag <parsererror> kalau ada (jarang utk text/html)
      const out = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
      return { html: out, salvaged: true };
    } catch (e) {
      // fallback manual: tutup tag yang masih terbuka
      const VOID = new Set(["area","base","br","col","embed","hr","img","input",
                            "link","meta","param","source","track","wbr"]);
      const stack = [];
      const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        const [full, slash, tag] = m;
        const lower = tag.toLowerCase();
        if (VOID.has(lower) || full.endsWith("/>") || lower === "!doctype") continue;
        if (slash) {
          const i = stack.lastIndexOf(lower);
          if (i !== -1) stack.length = i;
        } else {
          stack.push(lower);
        }
      }
      const closers = stack.reverse().map((t) => "</" + t + ">").join("");
      return { html: cleaned + "\n" + closers, salvaged: true };
    }
  }

  /* ============================================================
     Render
     ============================================================ */
  function escapeHTML(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  /** highlight ringan utk HTML/CSS/JS */
  function highlight(src) {
    const s = escapeHTML(src);
    return s
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-com">$1</span>')
      .replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="tok-tag">$2</span>')
      .replace(/\s([a-zA-Z-]+)(=)(&quot;|")/g, ' <span class="tok-attr">$1</span>$2$3')
      .replace(/(&quot;[^&\n]*?&quot;)/g, '<span class="tok-str">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|new|class|async|await|=>|document|window|localStorage)\b/g,
        '<span class="tok-kw">$1</span>');
  }

  function renderCode(final) {
    const src = state.code;
    if (!src) { el.codeEl.innerHTML = ""; return; }
    el.codeEl.innerHTML = highlight(src) + (final ? "" : '<span class="caret"></span>');
    if (final) {
      el.codeView.scrollTop = el.codeView.scrollHeight;
    }
    const kb = (new Blob([src]).size / 1024).toFixed(1);
    el.codeMeta.textContent = `${src.split("\n").length} baris · ${kb} KB`;
  }

  function renderPreview(force) {
    if (!state.code) return;
    const now = Date.now();
    if (!force && now - state.lastRender < LIVE_RENDER_MS) return;
    state.lastRender = now;
    el.previewPlaceholder.classList.add("off");
    // srcdoc diset ulang → iframe di-reload dengan kode terbaru
    el.preview.srcdoc = state.code;
  }

  /* ============================================================
     UI helpers
     ============================================================ */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function setStatus(text, kind) {
    el.statusText.textContent = text;
    el.status.classList.toggle("busy", kind === "busy");
    el.status.classList.toggle("err", kind === "err");
    el.statusSpinner.classList.toggle("on", kind === "busy");
  }

  function rate() {
    if (!state.startedAt || !state.genCount) return "";
    const t = (Date.now() - state.startedAt) / 1000;
    if (t < 1) return "";
    return ` · ${(state.genCount / t).toFixed(1) } tok/s`;
  }

  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    el.chatLog.appendChild(div);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    if (role === "user") {
      state.chatCount++;
      el.chatBadge.textContent = state.chatCount;
      el.chatBadge.hidden = false;
    }
    return div;
  }

  function switchTab(which) {
    const isCode = which === "code";
    el.tabCode.classList.toggle("is-active", isCode);
    el.tabChat.classList.toggle("is-active", !isCode);
    el.tabCode.setAttribute("aria-selected", String(isCode));
    el.tabChat.setAttribute("aria-selected", String(!isCode));
    el.panelCode.hidden = !isCode;
    el.panelChat.hidden = isCode;
  }

  function showWorkspace(on) {
    el.home.hidden = on;
    el.workspace.hidden = !on;
  }

  /* ============================================================
     Alur generate
     ============================================================ */
  async function run(idea, isFollowUp) {
    if (state.streaming) return;

    state.streaming = true;
    state.abort = new AbortController();
    state.startedAt = Date.now();
    state.genCount = 0;
    state.lastCode = 0;
    state.lastRender = 0;

    el.stopBtn.hidden = false;
    el.generateBtn.disabled = true;
    el.chatSend.disabled = true;
    setStatus(isFollowUp ? "memperbarui…" : "menulis kode…", "busy");

    let raw = "";

    try {
      await chatStream(state.messages, (delta) => {
        raw += delta;
        state.genCount += delta.length;

        const now = Date.now();
        if (now - state.lastCode > LIVE_CODE_MS) {
          state.lastCode = now;
          const partial = extractHTML(raw);
          if (partial) {
            state.code = partial;
            renderCode(false);
            renderPreview(false);
            setStatus(`menulis kode…${rate()}`, "busy");
          } else {
            el.codeEl.textContent = raw;
            setStatus(`menulis…${rate()}`, "busy");
          }
        }
      }, state.abort.signal);

      // ekstraksi dulu; kalau gagal, coba rescue dari isi mentah
      let final = extractHTML(raw);
      let note = "";
      if (!final) {
        const s = salvage(raw);
        final = s.html;
        if (s.salvaged) note = "potongan";
      } else {
        const s = salvage(final);
        if (s.salvaged) { final = s.html; note = "potongan"; }
      }

      if (!final || !/<html[\s>]/i.test(final)) {
        throw new Error("Model tidak mengeluarkan HTML yang valid. Coba lagi atau ubah prompt.");
      }

      state.code = final;
      if (!isFollowUp) state.idea = idea;
      state.messages.push({ role: "user", content: isFollowUp ? idea : buildUserPrompt(idea) });
      state.messages.push({ role: "assistant", content: raw.trim() });

      renderCode(true);
      renderPreview(true);
      const secs = ((Date.now() - state.startedAt) / 1000).toFixed(1);
      setStatus(`selesai dalam ${secs}s`, null);

      if (note === "potongan") {
        // hasil terpotong → beri tahu user, jangan diamkan
        const w = "⚠ Hasil terpotong di tengah (model kehabisan token). " +
                  "Preview mungkin belum lengkap — coba Generate ulang atau persempit prompt.";
        if (isFollowUp) addMsg("error", w);
        else { el.homeNote.textContent = ""; toast(w); }
        addMsg("meta", "Output terpotong, kode dirapikan otomatis.");
      }

      if (isFollowUp) addMsg("assistant", "✓ Kode sudah diperbarui — lihat tab Code & panel preview.");
      else el.wsTitle.textContent = idea;
      el.wsTitle.title = idea;

      // trim riwayat supaya konteks model tetap muat
      if (state.messages.length > 12) state.messages = state.messages.slice(-12);

    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("dihentikan", null);
        if (state.code) renderCode(true);
        if (isFollowUp) addMsg("meta", "Generasi dihentikan.");
      } else {
        console.error(err);
        setStatus("gagal", "err");
        const m = addMsg("error", "⚠ " + err.message);
        m.style.display = "block";
        if (isFollowUp) {
          // tetap tampilkan di chat, bukan cuma toast
        } else {
          toast(err.message);
          showWorkspace(false);
          el.homeNote.textContent = "⚠ " + err.message;
          el.homeNote.className = "note error";
        }
      }
    } finally {
      state.streaming = false;
      state.abort = null;
      el.stopBtn.hidden = true;
      el.generateBtn.disabled = false;
      el.chatSend.disabled = false;
      el.chatInput.value = "";
    }
  }

  function buildUserPrompt(idea) {
    return `Create this web app:\n\n${idea.trim()}`;
  }

  /* ============================================================
     Event wiring
     ============================================================ */
  function generate() {
    const idea = el.prompt.value.trim();
    if (!idea) {
      el.prompt.focus();
      el.homeNote.textContent = "Tulis dulu deskripsi aplikasimu.";
      el.homeNote.className = "note warn";
      return;
    }
    if (!state.model) {
      el.homeNote.textContent = "Tidak ada model Ollama yang bisa dipakai.";
      el.homeNote.className = "note error";
      return;
    }

    // reset sesi baru
    state.messages = [{ role: "system", content: SYSTEM_PROMPT }];
    state.code = "";
    state.chatCount = 0;
    el.chatBadge.hidden = true;
    el.chatLog.innerHTML = "";
    addMsg("meta", "Sesi baru · model " + state.model);
    el.previewPlaceholder.classList.remove("off");
    el.preview.removeAttribute("srcdoc");
    el.codeEl.textContent = "";
    el.codeMeta.textContent = "";
    el.homeNote.textContent = "";
    el.homeNote.className = "note";

    showWorkspace(true);
    switchTab("code");
    window.scrollTo(0, 0);
    run(idea, false);
  }

  el.generateBtn.addEventListener("click", generate);
  el.prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
  });
  el.prompt.addEventListener("input", () => {
    el.charCount.textContent = el.prompt.value.length + " karakter";
  });

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const key = chip.textContent.trim();
    const map = window.PROMPT_CHIPS || {};
    el.prompt.value = map[key] || key;
    el.prompt.dispatchEvent(new Event("input"));
    el.prompt.focus();
  });

  el.backBtn.addEventListener("click", () => {
    if (state.streaming && state.abort) state.abort.abort();
    showWorkspace(false);
    el.prompt.focus();
  });

  el.tabCode.addEventListener("click", () => switchTab("code"));
  el.tabChat.addEventListener("click", () => switchTab("chat"));

  el.refreshBtn.addEventListener("click", () => renderPreview(true));

  el.stopBtn.addEventListener("click", () => {
    if (state.abort) state.abort.abort();
  });

  el.copyBtn.addEventListener("click", async () => {
    if (!state.code) return toast("Belum ada kode");
    try {
      await navigator.clipboard.writeText(state.code);
      toast("Kode disalin ✓");
    } catch {
      toast("Gagal menyalin (izin clipboard ditolak)");
    }
  });

  el.downloadBtn.addEventListener("click", () => {
    if (!state.code) return toast("Belum ada kode");
    const blob = new Blob([state.code], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "index.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("index.html diunduh ✓");
  });

  /* ============================================================
     Muat turun projek ZIP
     ============================================================ */
  function siteCfg() {
    return window.SITE_CONFIG || {};
  }

  /** Nama lesen — hanya medan SELAMAT (bukan IC/alamat/telefon). */
  function licenceHolder() {
    const c = siteCfg();
    const who = [c.licensee, c.organisation].filter(Boolean).join(" / ");
    return who || "Penjana PromptCraft";
  }

  function buildLicense() {
    const c = siteCfg();
    return [
      "MIT License",
      "",
      "Copyright (c) " + (c.year || new Date().getFullYear()) + " " + licenceHolder(),
      "",
      "Permission is hereby granted, free of charge, to any person obtaining a copy",
      "of this software and associated documentation files (the \"Software\"), to deal",
      "in the Software without restriction, including without limitation the rights",
      "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
      "copies of the Software, and to permit persons to whom the Software is",
      "furnished to do so, subject to the following conditions:",
      "",
      "The above copyright notice and this permission notice shall be included in all",
      "copies or substantial portions of the Software.",
      "",
      "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
      "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
      "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
      "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
      "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
      "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
      "SOFTWARE.",
      ""
    ].join("\n");
  }

  function buildReadme(idea) {
    const c = siteCfg();
    return [
      "# " + (idea || "Aplikasi web hasil PromptCraft"),
      "",
      "Dijana oleh **PromptCraft** — " + (c.site || ""),
      "Lesen: " + (c.licence || "MIT") + " — lihat `LICENSE.txt`",
      "",
      "## 1. Jalankan serta-merta (paling mudah)",
      "",
      "Fail ini satu-satunya, HTML + CSS + JS sebati, tiada dependensi luar.",
      "",
      "```bash",
      "# buka terus dalam pelayar",
      "xdg-open index.html        # Linux",
      "start index.html           # Windows",
      "open index.html            # macOS",
      "",
      "# atau jalankan web server kecil",
      "python3 -m http.server 8080",
      "```",
      "",
      "## 2. Deploy ke web",
      "",
      "Salin `index.html` ke mana-mana hosting statik:",
      "",
      "```bash",
      "# nginx",
      "sudo cp index.html /var/www/html/",
      "",
      "# GitHub Pages / Netlify / Cloudflare Pages — seret folder sahaja",
      "```",
      "",
      "## 3. Bungkus jadi APP ANDROID (APK)",
      "",
      "Gunakan [Capacitor](https://capacitorjs.com) — HTML terus jadi APK,",
      "**tiada Flutter/Dart diperlukan**.",
      "",
      "```bash",
      "npm init -y",
      "npm install @capacitor/core @capacitor/cli @capacitor/android",
      "npx cap init \"Nama App\" com.example.namaapp --web-dir .",
      "npx cap add android",
      "npx cap sync",
      "npx cap open android     # buka Android Studio",
      "```",
      "",
      "Dalam Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.",
      "",
      "### Aktifkan keystore supaya boleh release ke mana-mana",
      "",
      "Buat SAHAJA SEKALI, kemudian simpan fail `.jks` dan kata laluan selamat.",
      "Keystore yang hilang = tak boleh kemas kini app yang sudah diterbitkan.",
      "",
      "```bash",
      "keytool -genkey -v -keystore release.jks -keyalg RSA \\",
      "  -keysize 2048 -validity 10000 -alias mykey",
      "```",
      "",
      "Kemudian dalam `android/app/build.gradle`, tambah `signingConfigs`:",
      "",
      "```groovy",
      "signingConfigs {",
      "    release {",
      "        storeFile file(\"../../release.jks\")",
      "        storePassword System.getenv(\"KEYSTORE_PASS\")",
      "        keyAlias \"mykey\"",
      "        keyPassword System.getenv(\"KEY_PASS\")",
      "    }",
      "}",
      "buildTypes { release { signingConfig signingConfigs.release } }",
      "```",
      "",
      "Hasil: `android/app/build/outputs/apk/release/app-release.apk` —",
      "boleh dipasang di telefon mana-mana jenama.",
      "",
      "## 4. Bungkus jadi APP WINDOWS / LINUX (`.exe`, AppImage)",
      "",
      "Gunakan [Electron](https://www.electronjs.org):",
      "",
      "```bash",
      "npm init -y",
      "npm install --save-dev electron electron-builder",
      "```",
      "",
      "`package.json` tambah:",
      "",
      "```json",
      "{",
      "  \"main\": \"main.js\",",
      "  \"scripts\": { \"start\": \"electron .\", \"dist\": \"electron-builder\" },",
      "  \"build\": {",
      "    \"appId\": \"com.example.namaapp\",",
      "    \"files\": [\"index.html\", \"main.js\"],",
      "    \"win\": { \"target\": \"nsis\" },",
      "    \"linux\": { \"target\": [\"AppImage\", \"deb\"] }",
      "  }",
      "}",
      "```",
      "",
      "`main.js`:",
      "",
      "```js",
      "const { app, BrowserWindow } = require(\"electron\");",
      "app.whenReady().then(() => {",
      "  const w = new BrowserWindow({ width: 1000, height: 700 });",
      "  w.loadFile(\"index.html\");",
      "});",
      "```",
      "",
      "```bash",
      "npm run dist   # hasil: dist/*.exe, dist/*.AppImage, dist/*.deb",
      "```",
      "",
      "## 5. Struktur projek",
      "",
      "```",
      "index.html    aplikasi (satu fail, sedia guna)",
      "README.md     fail ini",
      "LICENSE.txt   lesen MIT",
      "```",
      "",
      "---",
      "Dijana pada " + new Date().toISOString().slice(0, 10) +
        " oleh PromptCraft. Anda bebas mengubah suai dan mengedarkan mengikut lesen MIT.",
      ""
    ].join("\n");
  }

  function slugify(s) {
    return (s || "app")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app";
  }

  function downloadZip() {
    if (!state.code) return toast("Belum ada kode");
    if (!window.ZipUtil) return toast("Modul ZIP belum dimuat");
    try {
      const idea = state.idea || el.wsTitle.textContent || "aplikasi";
      const bytes = window.ZipUtil.make([
        { name: "index.html", data: state.code },
        { name: "README.md",  data: buildReadme(idea) },
        { name: "LICENSE.txt", data: buildLicense() }
      ]);
      const blob = new Blob([bytes], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = slugify(idea) + ".zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 6000);
      toast("Projek ZIP diunduh ✓ (3 fail)");
    } catch (e) {
      console.error(e);
      toast("Gagal bina ZIP: " + e.message);
    }
  }

  el.zipBtn.addEventListener("click", downloadZip);

  el.openBtn.addEventListener("click", () => {
    if (!state.code) return toast("Belum ada kode");
    const blob = new Blob([state.code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  });

  el.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const txt = el.chatInput.value.trim();
    if (!txt) return;
    if (state.streaming) return toast("Masih memproses…");
    if (!state.model) return toast("Model belum siap");
    addMsg("user", txt);
    run(txt, true);
  });

  /* ============================================================
     Boot
     ============================================================ */
  async function boot() {
    try {
      const { names: models, def, source } = await listModels();

      if (!models.length) {
        el.modelSelect.innerHTML = '<option value="">(tidak ada model)</option>';
        el.engineDot.className = "dot bad";
        el.engineLabel.textContent = "tiada model";
        el.homeNote.textContent = "Tiada model tersedia. Jalankan: ollama pull qwen2.5-coder:0.5b";
        el.homeNote.className = "note warn";
        return;
      }

      el.modelSelect.innerHTML = "";

      // Utama: default dari proxy (cloud dahulu kalau ada). Baru: fallback local.
      const preferred = ["qwen2.5-coder:0.5b", "qwen2.5-coder:1.5b", "qwen2.5-coder:3b", "qwen3:1.7b"];
      let chosen = (def && models.includes(def))
        ? def
        : (preferred.find((p) => models.includes(p))
            || models.find((m) => /coder|code|qwen|llama|deepseek|starcoder|gemini|llama-3/i.test(m))
            || models[0]);

      for (const m of models) {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        if (m === chosen) o.selected = true;
        el.modelSelect.appendChild(o);
      }
      state.model = chosen;

      el.engineDot.className = "dot ok";
      // source: "hybrid" = ada free API cloud; "local" = Ollama sahaja
      el.engineLabel.textContent = (source === "hybrid")
        ? "AI awan + sandaran lokal · " + models.length + " model"
        : "Ollama lokal · " + models.length + " model";
      el.charCount.textContent = "0 karakter";

      const line = document.getElementById("privacyLine");
      if (line && source === "local") {
        line.innerHTML = "Buat sementara semua inference berjalan di server ini (Ollama lokal). " +
          "Bila API awan percuma dipasang, prompt mungkin dihantar ke pembekal AI pihak ketiga — " +
          "<strong>jangan masukkan rahsia atau data sensitif</strong>.";
      }
    } catch (err) {
      console.error(err);
      el.engineDot.className = "dot bad";
      el.engineLabel.textContent = "engine tidak terjangkau";
      el.homeNote.textContent =
        "Tidak bisa menghubungi engine (" + err.message + "). Pastikan servis promptcraft-proxy dan ollama berjalan.";
      el.homeNote.className = "note error";
      el.generateBtn.disabled = true;
    }
  }

  el.modelSelect.addEventListener("change", () => { state.model = el.modelSelect.value; });

  boot();
})();
