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
    "RULE 0 — THE USER'S REQUEST WINS.",
    "The user's requirements outrank every default and every rule below.",
    "Satisfy ALL of them: features, layout, wording, language and colours.",
    "Where the request is silent, fall back to the defaults below.",
    "Never swap the user's idea for your own, and never apply a default that",
    "contradicts something the user explicitly asked for.",
    "",
    "Hard rules (defaults — the user overrides them):",
    "1. Everything must live in that single file: inline <style> and inline <script>.",
    "2. Never use external resources: no CDN, no <link>, no import/export, no fetch to other origins, no images from the network (use emoji, gradients, CSS shapes or inline SVG instead).",
    "3. The app must work offline when opened directly from a file.",
    "4. Styling default: if the user does not specify a look, use a modern dark UI with sensible spacing, clear hierarchy, and hover/focus states. If the user DOES specify a look — light, pastel, colourful, a hex value, a brand, print-style — follow their choice exactly instead of this default.",
    "5. Language default: write every visible string in the app — headings, buttons, labels, placeholders, tooltips — in the language the user wrote their request in.",
    "6. The app must actually work — implement real logic, not placeholders. Persist state in localStorage only if the app needs it.",
    "7. Reply with ONLY the code inside a ```html fenced block. No explanations, no commentary before or after.",
    "8. Never truncate. Always close </script>, </style>, </body> and </html>."
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

  /* ---------- i18n ----------
     I18N boleh hilang kalau i18n.js gagal dimuat. Dalam kes itu halaman
     kekal sepenuhnya Inggeris (teks statik) — TIDAK bercampur, hanya
     tak diterjemah. Jangan biarkan ini mematikan app. */
  const I18N = window.PROMPT_I18N || null;
  const t = I18N ? I18N.t : (k) => k;
  const currentLang = () => (I18N ? I18N.lang() : "en");

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
    genCount: 0,

    /* ---- penanda utk dicat semasa bertukar bahasa ---- */
    modelMode: "loading",    // loading | none | list
    engineMode: "checking",  // checking | ok | none | down
    engineSource: null,      // "hybrid" | "local"
    modelCount: 0,
    privacyMode: "cloud",    // cloud | local
    lastStatus: { k: "status.ready", p: null, kind: null },
    lastNote: null           // {k,p,kind} utk kunci i18n, {r,kind} utk teks mentah
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
    throw lastErr || new Error(t("err.unreachable"));
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
    renderCodeMeta();
  }

  /** Metadata tab Code — ikut bahasa semasa. */
  function renderCodeMeta() {
    if (!state.code) { el.codeMeta.textContent = ""; return; }
    const kb = (new Blob([state.code]).size / 1024).toFixed(1);
    el.codeMeta.textContent = t("meta.lines", { n: state.code.split("\n").length, kb });
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
  /** Terima TEKS AKHIR — panggil t() di tapak pemanggil.
      Toast hidup ~2.2s, jadi ia tak perlu dicat semula bila bertukar bahasa. */
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  /** Status disimpan sebagai KUNCI i18n, bukan teks rata, supaya
      boleh diterjemah semula apabila pengguna bertukar bahasa. */
  function setStatus(key, params, kind) {
    state.lastStatus = { k: key, p: params, kind: kind || null };
    renderStatus();
  }

  function renderStatus() {
    const s = state.lastStatus || { k: "status.ready", p: null, kind: null };
    el.statusText.textContent = t(s.k, s.p);
    const kind = s.kind;
    el.status.classList.toggle("busy", kind === "busy");
    el.status.classList.toggle("err", kind === "err");
    el.statusSpinner.classList.toggle("on", kind === "busy");
  }

  /**
   * Nota bawah composer. Dua bentuk disedari:
   *   setNote(kunci, params, jenis)  -> i18n, boleh dicat semula
   *   setNoteRaw(teks, jenis)        -> mentah (mesej server, dll.)
   *   setNote(null)                  -> kosongkan
   */
  function setNote(key, params, kind) {
    state.lastNote = key ? { k: key, p: params, kind: kind || "" } : null;
    renderNote();
  }

  function setNoteRaw(text, kind) {
    state.lastNote = text ? { r: text, kind: kind || "" } : null;
    renderNote();
  }

  function renderNote() {
    const n = state.lastNote;
    if (!n) { el.homeNote.textContent = ""; el.homeNote.className = "note"; return; }
    el.homeNote.textContent = ("r" in n) ? n.r : t(n.k, n.p);
    el.homeNote.className = "note" + (n.kind ? " " + n.kind : "");
  }

  function renderCharCount() {
    el.charCount.textContent = t("hint.chars", { n: el.prompt.value.length });
  }

  /** Baris enjin atas — nama + bilangan model, ikut bahasa. */
  function renderEngine() {
    if (state.engineMode === "down") { el.engineLabel.textContent = t("engine.down"); return; }
    if (state.engineMode === "none") { el.engineLabel.textContent = t("engine.none"); return; }
    if (state.engineMode === "checking") { el.engineLabel.textContent = t("top.engine.checking"); return; }
    el.engineLabel.textContent = state.engineSource === "hybrid"
      ? t("engine.hybrid", { n: state.modelCount })
      : t("engine.local", { n: state.modelCount });
  }

  /** Nota privasi kaki halaman — varian cloud vs local. */
  function renderPrivacy() {
    const line = $("privacyLine");
    if (line) line.innerHTML = t(state.privacyMode === "local" ? "privacy.local" : "privacy.cloud");
  }

  /** Pilihan istimewa dalam senarai model. Nama model = data, bukan terjemahan,
      jadi senarai "list" tak perlu disentuh. */
  function renderModelSelect() {
    if (state.modelMode === "loading") {
      el.modelSelect.innerHTML =
        '<option data-i18n="model.loading">' + escapeHTML(t("model.loading")) + "</option>";
    } else if (state.modelMode === "none") {
      el.modelSelect.innerHTML =
        '<option value="" data-i18n="model.none">' + escapeHTML(t("model.none")) + "</option>";
    }
  }

  function rate() {
    if (!state.startedAt || !state.genCount) return "";
    const t = (Date.now() - state.startedAt) / 1000;
    if (t < 1) return "";
    return ` · ${(state.genCount / t).toFixed(1) } tok/s`;
  }

  /** Mesej sembang. `spec` ada => kunci i18n (boleh diterjemah semula);
      `spec` tiada => teks mentah (mesej pengguna / mesej server). */
  function addMsg(role, text, spec) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    if (spec) div.setAttribute("data-msg-key", JSON.stringify(spec));
    div.textContent = spec ? t(spec.k, spec.p) : text;
    el.chatLog.appendChild(div);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    if (role === "user") {
      state.chatCount++;
      el.chatBadge.textContent = state.chatCount;
      el.chatBadge.hidden = false;
    }
    return div;
  }

  /** Kemas kini mesej sembang yang berpaksikan kunci apabila bahasa bertukar. */
  function addMsgKeyed(role, key, params) {
    return addMsg(role, null, { k: key, p: params || null });
  }

  function renderChatLang() {
    const nodes = el.chatLog.querySelectorAll("[data-msg-key]");
    for (const n of nodes) {
      let spec;
      try { spec = JSON.parse(n.getAttribute("data-msg-key")); } catch { continue; }
      if (spec) n.textContent = t(spec.k, spec.p);
    }
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
    setStatus(isFollowUp ? "status.updating" : "status.writing", { rate: rate() }, "busy");

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
            setStatus("status.writing", { rate: rate() }, "busy");
          } else {
            el.codeEl.textContent = raw;
            setStatus("status.writingRaw", { rate: rate() }, "busy");
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
        throw new Error(t("err.notHtml"));
      }

      state.code = final;
      if (!isFollowUp) state.idea = idea;
      state.messages.push({ role: "user", content: isFollowUp ? idea : buildUserPrompt(idea) });
      state.messages.push({ role: "assistant", content: raw.trim() });

      renderCode(true);
      renderPreview(true);
      const secs = ((Date.now() - state.startedAt) / 1000).toFixed(1);
      setStatus("status.done", { s: secs }, null);

      if (note === "potongan") {
        // hasil terpotong → beri tahu user, jangan diamkan
        if (isFollowUp) addMsgKeyed("error", "warn.truncated");
        else { setNote(null); toast(t("warn.truncated")); }
        addMsgKeyed("meta", "chat.truncated");
      }

      if (isFollowUp) addMsgKeyed("assistant", "chat.updated");
      else el.wsTitle.textContent = idea;
      el.wsTitle.title = idea;

      // trim riwayat supaya konteks model tetap muat — tetapi JANGAN buang
      // system prompt. mesej[0] ialah SYSTEM_PROMPT; dahulu slice(-12)
      // membuangnya bila panjang mencecah 13 (≈ pusingan keenam), lalu model
      // beroperasi TANPA sebarang peraturan dan bebas menghasilkan apa sahaja.
      if (state.messages.length > 12) {
        const sys = (state.messages[0] && state.messages[0].role === "system")
          ? state.messages[0] : null;
        const rest = state.messages.slice(sys ? 1 : 0);
        state.messages = sys ? [sys].concat(rest.slice(-11)) : rest.slice(-12);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("status.stopped", null, null);
        if (state.code) renderCode(true);
        if (isFollowUp) addMsgKeyed("meta", "chat.stopped");
      } else {
        console.error(err);
        setStatus("status.failed", null, "err");
        const m = addMsg("error", "⚠ " + err.message);
        m.style.display = "block";
        if (isFollowUp) {
          // tetap tampilkan di chat, bukan cuma toast
        } else {
          toast(err.message);
          showWorkspace(false);
          setNoteRaw("⚠ " + err.message, "error");
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

  const LANG_NAME = {
    en: "English", ms: "Bahasa Melayu", id: "Bahasa Indonesia", "zh-CN": "Simplified Chinese"
  };

  function buildUserPrompt(idea) {
    const lang = LANG_NAME[currentLang()] || "English";
    return [
      "Create this web app.",
      "",
      "The user's requirements below are MANDATORY. Satisfy every one of them,",
      "and do not add anything they did not ask for:",
      idea.trim(),
      "",
      "Write every visible string in the generated app in " + lang + "."
    ].join("\n");
  }

  /* ============================================================
     Event wiring
     ============================================================ */
  function generate() {
    const idea = el.prompt.value.trim();
    if (!idea) {
      el.prompt.focus();
      setNote("note.writefirst", null, "warn");
      return;
    }
    if (!state.model) {
      setNote("note.nomodel", null, "error");
      return;
    }

    // reset sesi baru
    state.messages = [{ role: "system", content: SYSTEM_PROMPT }];
    state.code = "";
    state.chatCount = 0;
    el.chatBadge.hidden = true;
    el.chatLog.innerHTML = "";
    addMsgKeyed("meta", "chat.newsession", { model: state.model });
    el.previewPlaceholder.classList.remove("off");
    el.preview.removeAttribute("srcdoc");
    el.codeEl.textContent = "";
    el.codeMeta.textContent = "";
    setNote(null);

    showWorkspace(true);
    switchTab("code");
    window.scrollTo(0, 0);
    run(idea, false);
  }

  el.generateBtn.addEventListener("click", generate);
  el.prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
  });
  el.prompt.addEventListener("input", renderCharCount);

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    // Cari ikut id STABIL (data-chip), BUKAN ikut teks label —
    // label berubah mengikut bahasa, jadi guna label = chip tak dapat cari prompt.
    const id = chip.getAttribute("data-chip");
    const entry = (window.PROMPT_CHIPS || {})[id];
    if (entry && typeof entry === "object") {
      el.prompt.value = entry[currentLang()] || entry.en || "";
    } else {
      el.prompt.value = chip.textContent.trim();
    }
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
    if (!state.code) return toast(t("toast.nocode"));
    try {
      await navigator.clipboard.writeText(state.code);
      toast(t("toast.copied"));
    } catch {
      toast(t("toast.copyfail"));
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
    toast(t("toast.downloaded"));
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
    return who || t("license.default.holder");
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
      "# " + (idea || t("readme.defaulttitle")),
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
    if (!state.code) return toast(t("toast.nocode"));
    if (!window.ZipUtil) return toast(t("toast.zipnomod"));
    try {
      // "" => slugify jatuh ke "app" (nama fail neutral, bukan teks UI)
      const idea = state.idea || el.wsTitle.textContent || "";
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
      toast(t("toast.zipdone"));
    } catch (e) {
      console.error(e);
      toast(t("toast.zipfail", { err: e.message }));
    }
  }

  el.zipBtn.addEventListener("click", downloadZip);

  el.openBtn.addEventListener("click", () => {
    if (!state.code) return toast(t("toast.nocode"));
    const blob = new Blob([state.code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  });

  el.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const txt = el.chatInput.value.trim();
    if (!txt) return;
    if (state.streaming) return toast(t("toast.busy"));
    if (!state.model) return toast(t("toast.nomodel"));
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
        state.modelMode = "none";
        renderModelSelect();
        el.engineDot.className = "dot bad";
        state.engineMode = "none";
        renderEngine();
        setNote("note.nomodels.hint", null, "warn");
        return;
      }

      state.modelMode = "list";
      el.modelSelect.innerHTML = "";

      // Utama: lalai dari proxy. LOKAL sentiasa jadi pilihan lalai (penjanaan
      // tetap Ollama); wrangler cuma tugas latar. Baru: fallback local.
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
      state.engineMode = "ok";
      state.engineSource = source;
      state.modelCount = models.length;
      renderEngine();
      renderCharCount();

      // Nota privasi: varian ikut sumber inference, ikut bahasa semasa.
      state.privacyMode = (source === "local") ? "local" : "cloud";
      renderPrivacy();
    } catch (err) {
      console.error(err);
      el.engineDot.className = "dot bad";
      state.engineMode = "down";
      renderEngine();
      setNote("note.engine.unreachable", { err: err.message }, "error");
      el.generateBtn.disabled = true;
    }
  }

  el.modelSelect.addEventListener("change", () => { state.model = el.modelSelect.value; });

  /* Bila bahasa bertukar, terjemah semula SEMUA yang bergantung padanya —
     termasuk yang sudah dipaparkan (status, nota, mesej sembang, metadata). */
  document.addEventListener("pc:lang", () => {
    renderStatus();
    renderNote();
    renderCharCount();
    renderCodeMeta();
    renderEngine();
    renderPrivacy();
    renderModelSelect();
    renderChatLang();
  });

  // WAJIB dipanggil SELEPAS pendengar didaftarkan di atas: init() menghantar
  // peristiwa pc:lang secara serentak semasa kesan bahasa pelayar.
  if (I18N) I18N.init();

  boot();
})();
