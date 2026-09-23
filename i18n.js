/* ============================================================
   i18n — data bahasa + pemakaian pada DOM
   ------------------------------------------------------------
   Matlamat: halaman TIDAK PERNAH bercampur bahasa.
   HTML statik kekal Inggeris (lalai + fallback kalau JS gagal),
   JS bertukar ikut pelayar pengguna semasa muat.

   NAMA BAHASA (endonim) kekal dalam bahasa sendiri — amalan
   piawaian pemilih bahasa: "English", "Bahasa Melayu", dst.

   Tambah bahasa baru:
     1. tambah entri dalam LANGS
     2. tambah blok penuh dalam DICT.<kod>
     tiada fail lain perlu disentuh.

   AMARAN (uptime monitor): <title> statik dalam index.html
   mesti terus mengandungi "Turn your idea into an app".
   Jangan tukar teks statik itu kepada bahasa lain.
   ============================================================ */
(function () {
  "use strict";

  var LANGS = [
    { code: "en",    label: "English" },
    { code: "ms",    label: "Bahasa Melayu" },
    { code: "id",    label: "Bahasa Indonesia" },
    { code: "zh-CN", label: "简体中文" }
  ];

  var FALLBACK = "en";
  var STORE_KEY = "promptcraft.lang";

  /* ------------------------------------------------------------------
     Kamus. Setiap key wajib wujud dalam SEMUA blok bahasa, supaya
     satu pun hilang => teks lombong terpapar (t() log amaran).
     ------------------------------------------------------------------ */
  var DICT = {

    /* ========================= ENGLISH (lalai) ========================= */
    en: {
      "doc.title": "PromptCraft — Turn your idea into an app",
      "doc.desc": "Describe the app you want; the local Ollama model writes the code and shows it right away.",

      "top.home.aria": "PromptCraft home",
      "top.engine.title": "Inference backend",
      "top.engine.checking": "Checking Ollama\u2026",
      "top.powered": "Powered by Ollama",
      "top.lang.aria": "Language",

      "hero.eyebrow": "Open-source app generator \u00b7 runs on a local model",
      "hero.l1": "Turn your idea",
      "hero.l2": "into an app",
      "hero.sub": "Write one sentence. Your model writes the code, and you can run it, edit it, and refine it through chat.",

      "prompt.label": "App description",
      "prompt.placeholder": "Monthly spending app with bar charts, dark mode, and a way to add transactions\u2026",

      "model.label": "model",
      "model.aria": "Choose a model",
      "model.loading": "Loading models\u2026",
      "model.none": "(no models)",
      "hint.chars": "{n} characters",

      "btn.generate": "Generate",
      "chips.aria": "Example prompts",

      "chip.sneaker": "Sneaker Drop",
      "chip.expense": "Expense Tracker",
      "chip.sourdough": "Sourdough Timer",
      "chip.team": "Team Chat",
      "chip.beat": "Beat Maker",
      "chip.palette": "Palette Generator",

      "foot.built": "Built with <strong>Ollama</strong> &amp; <strong>qwen2.5-coder</strong>.",

      "flow.title": "How it works",
      "flow.s1.t": "Describe it",
      "flow.s1.d": "Write one sentence about the app you want.",
      "flow.s2.t": "Generate",
      "flow.s2.d": "Your model writes a complete, self-contained app.",
      "flow.s3.t": "Refine and export",
      "flow.s3.d": "Chat to adjust it, then download the file or a ZIP.",

      "feats.title": "Built for makers",
      "feats.a.t": "Runs on this machine",
      "feats.a.d": "Ollama runs locally; free cloud AI only assists in the background.",
      "feats.b.t": "One file",
      "feats.b.d": "HTML, CSS and JavaScript in a single self-contained file.",
      "feats.c.t": "Live preview",
      "feats.c.d": "Watch the app render while the code streams in.",
      "feats.d.t": "Four languages",
      "feats.d.d": "English, Malay, Indonesian and Simplified Chinese.",

      "cta.title": "Describe your app",
      "cta.btn": "Start writing",
      "privacy.cloud": "Models are chosen automatically: free cloud AI first, the local Ollama model as a fallback when the cloud rate-limits. <strong>Your prompt may be sent to a third-party AI provider</strong> \u2014 never include secrets or sensitive data.",
      "privacy.local": "For now all inference runs on this server (local Ollama). Once a free cloud API is connected, prompts may be sent to a third-party AI provider \u2014 <strong>never include secrets or sensitive data</strong>.",

      "ws.new": "New",
      "status.ready": "ready",
      "status.updating": "Updating\u2026{rate}",
      "status.writing": "Writing code\u2026{rate}",
      "status.writingRaw": "Writing\u2026{rate}",
      "status.done": "done in {s}s",
      "status.stopped": "stopped",
      "status.failed": "failed",

      "btn.copy": "Copy",
      "btn.copy.title": "Copy code",
      "btn.download": "Download",
      "btn.download.title": "Download index.html",
      "btn.zip": "ZIP",
      "btn.zip.title": "Download ZIP project (index.html + README + LICENSE)",
      "btn.refresh": "Refresh",
      "btn.refresh.title": "Reload preview",
      "btn.stop": "Stop",
      "btn.stop.title": "Stop generation",

      "tab.code": "Code",
      "tab.chat": "Chat",
      "meta.lines": "{n} lines \u00b7 {kb} KB",

      "chat.empty": "Ask for changes in chat, for example:<br><em>\u201cmake it brighter and add a reset button\u201d</em>",
      "chat.input.ph": "Describe the change you want\u2026",
      "chat.input.aria": "Requested change",
      "chat.send": "Send",
      "chat.newsession": "New session \u00b7 model {model}",
      "chat.updated": "\u2713 Code updated \u2014 see the Code tab and preview panel.",
      "chat.truncated": "Output was cut off; the code was tidied up automatically.",
      "chat.stopped": "Generation stopped.",
      "warn.truncated": "\u26a0 The result was cut off mid-way (the model ran out of tokens). The preview may be incomplete \u2014 try Generate again or shorten your prompt.",
      "err.notHtml": "The model did not produce valid HTML. Try again or change your prompt.",

      "preview.pane": "preview \u00b7 index.html",
      "preview.open.title": "Open in a new tab",
      "preview.iframe.title": "App preview",
      "preview.empty": "Your preview will appear here",

      "note.writefirst": "Write a description of your app first.",
      "note.nomodel": "No Ollama model is available.",
      "note.nomodels.hint": "No models available. Run: ollama pull qwen2.5-coder:0.5b",
      "note.engine.unreachable": "Could not reach the engine ({err}). Make sure promptcraft-proxy and ollama are running.",

      "engine.hybrid": "Local AI + cloud helper \u00b7 {n} models",
      "engine.local": "Local Ollama \u00b7 {n} models",
      "engine.none": "no models",
      "engine.down": "engine unreachable",

      "toast.nocode": "No code yet",
      "toast.copied": "Code copied \u2713",
      "toast.copyfail": "Copy failed (clipboard permission denied)",
      "toast.downloaded": "index.html downloaded \u2713",
      "toast.zipnomod": "ZIP module not loaded yet",
      "toast.zipdone": "ZIP project downloaded \u2713 (3 files)",
      "toast.zipfail": "Failed to build ZIP: {err}",
      "toast.busy": "Still processing\u2026",
      "toast.nomodel": "Model not ready yet",

      "err.unreachable": "Ollama is unreachable",

      "readme.defaulttitle": "Web app made with PromptCraft",
      "license.default.holder": "PromptCraft generator",
      "zip.nofiles": "ZipUtil.make: no files"
    },

    /* ========================= BAHASA MELAYU ========================= */
    ms: {
      "doc.title": "PromptCraft \u2014 Tukar idea anda menjadi aplikasi",
      "doc.desc": "Huraikan aplikasi yang anda mahu, model Ollama tempatan akan menulis kod dan memaparkannya serta-merta.",

      "top.home.aria": "Laman utama PromptCraft",
      "top.engine.title": "Enjin inferens",
      "top.engine.checking": "Memeriksa Ollama\u2026",
      "top.powered": "Dikuasakan oleh Ollama",
      "top.lang.aria": "Bahasa",

      "hero.eyebrow": "Penjana aplikasi sumber terbuka \u00b7 model berjalan secara tempatan",
      "hero.l1": "Tukar idea anda",
      "hero.l2": "menjadi aplikasi",
      "hero.sub": "Tulis satu ayat. Model anda akan menulis kod, dan anda boleh terus menjalankannya, menyuntingnya dan menyempurnakannya melalui sembang.",

      "prompt.label": "Penerangan aplikasi",
      "prompt.placeholder": "Aplikasi perbelanjaan bulanan dengan carta bar, mod gelap, dan cara menambah transaksi\u2026",

      "model.label": "model",
      "model.aria": "Pilih model",
      "model.loading": "Memuat model\u2026",
      "model.none": "(tiada model)",
      "hint.chars": "{n} aksara",

      "btn.generate": "Jana",
      "chips.aria": "Contoh prompt",

      "chip.sneaker": "Pelancaran Sneaker",
      "chip.expense": "Penjejak Perbelanjaan",
      "chip.sourdough": "Pemasa Sourdough",
      "chip.team": "Sembang Pasukan",
      "chip.beat": "Pencipta Irama",
      "chip.palette": "Penjana Palet",

      "foot.built": "Dibina dengan <strong>Ollama</strong> &amp; <strong>qwen2.5-coder</strong>.",

      "flow.title": "Cara ia berfungsi",
      "flow.s1.t": "Terangkan",
      "flow.s1.d": "Tulis satu ayat tentang app yang anda mahu.",
      "flow.s2.t": "Jana",
      "flow.s2.d": "Model anda menulis app lengkap yang berdiri sendiri.",
      "flow.s3.t": "Perhalus dan eksport",
      "flow.s3.d": "Berbual untuk menyelaras, kemudian muat turun fail atau ZIP.",

      "feats.title": "Dibina untuk pembina",
      "feats.a.t": "Berjalan pada mesin ini",
      "feats.a.d": "Ollama berjalan secara lokal; AI awan percuma hanya membantu di latar belakang.",
      "feats.b.t": "Satu fail",
      "feats.b.d": "HTML, CSS dan JavaScript dalam satu fail lengkap.",
      "feats.c.t": "Pratonton langsung",
      "feats.c.d": "Lihat app dirender semasa kode mengalir masuk.",
      "feats.d.t": "Empat bahasa",
      "feats.d.d": "Inggeris, Melayu, Indonesia dan Cina Ringkas.",

      "cta.title": "Terangkan app anda",
      "cta.btn": "Mula menulis",
      "privacy.cloud": "Model dipilih secara automatik: perkhidmatan AI awan percuma dahulu, model tempatan (Ollama) sebagai sandaran apabila awan mencapai had laju. <strong>Prompt anda mungkin dihantar kepada pembekal AI pihak ketiga</strong> \u2014 jangan masukkan rahsia atau data sensitif.",
      "privacy.local": "Buat masa ini semua inferens berjalan pada pelayan ini (Ollama tempatan). Bila API awan percuma dipasang, prompt mungkin dihantar kepada pembekal AI pihak ketiga \u2014 <strong>jangan masukkan rahsia atau data sensitif</strong>.",

      "ws.new": "Baru",
      "status.ready": "siap",
      "status.updating": "Mengemas kini\u2026{rate}",
      "status.writing": "Menulis kod\u2026{rate}",
      "status.writingRaw": "Menulis\u2026{rate}",
      "status.done": "selesai dalam {s}s",
      "status.stopped": "dihentikan",
      "status.failed": "gagal",

      "btn.copy": "Salin",
      "btn.copy.title": "Salin kod",
      "btn.download": "Muat turun",
      "btn.download.title": "Muat turun index.html",
      "btn.zip": "ZIP",
      "btn.zip.title": "Muat turun projek ZIP (index.html + README + LICENSE)",
      "btn.refresh": "Muat semula",
      "btn.refresh.title": "Muat semula pratonton",
      "btn.stop": "Henti",
      "btn.stop.title": "Hentikan penjanaan",

      "tab.code": "Kod",
      "tab.chat": "Sembang",
      "meta.lines": "{n} baris \u00b7 {kb} KB",

      "chat.empty": "Minta perubahan melalui sembang, contoh:<br><em>\u201ctukar warnanya menjadi terang dan tambah butang set semula\u201d</em>",
      "chat.input.ph": "Huraikan perubahan yang anda mahu\u2026",
      "chat.input.aria": "Perubahan yang diminta",
      "chat.send": "Hantar",
      "chat.newsession": "Sesi baharu \u00b7 model {model}",
      "chat.updated": "\u2713 Kod sudah dikemas kini \u2014 lihat tab Kod dan panel pratonton.",
      "chat.truncated": "Output terpotong, kod dirapikan secara automatik.",
      "chat.stopped": "Penjanaan dihentikan.",
      "warn.truncated": "\u26a0 Hasil terpotong di tengah (kehabisan token). Pratonton mungkin belum lengkap \u2014 cuba jana semula atau pendekkan prompt anda.",
      "err.notHtml": "Model tidak menghasilkan HTML yang sah. Cuba lagi atau tukar prompt anda.",

      "preview.pane": "pratonton \u00b7 index.html",
      "preview.open.title": "Buka dalam tab baharu",
      "preview.iframe.title": "Pratonton aplikasi",
      "preview.empty": "Pratonton akan muncul di sini",

      "note.writefirst": "Tulis penerangan aplikasi anda dahulu.",
      "note.nomodel": "Tiada model Ollama yang boleh digunakan.",
      "note.nomodels.hint": "Tiada model tersedia. Jalankan: ollama pull qwen2.5-coder:0.5b",
      "note.engine.unreachable": "Tidak dapat menghubungi enjin ({err}). Pastikan servis promptcraft-proxy dan ollama berjalan.",

      "engine.hybrid": "AI lokal + pembantu awan \u00b7 {n} model",
      "engine.local": "Ollama tempatan \u00b7 {n} model",
      "engine.none": "tiada model",
      "engine.down": "enjin tidak terjangkau",

      "toast.nocode": "Belum ada kod",
      "toast.copied": "Kod disalin \u2713",
      "toast.copyfail": "Gagal menyalin (kebenaran papan klip ditolak)",
      "toast.downloaded": "index.html dimuat turun \u2713",
      "toast.zipnomod": "Modul ZIP belum dimuat",
      "toast.zipdone": "Projek ZIP dimuat turun \u2713 (3 fail)",
      "toast.zipfail": "Gagal bina ZIP: {err}",
      "toast.busy": "Masih memproses\u2026",
      "toast.nomodel": "Model belum sedia",

      "err.unreachable": "Ollama tidak terjangkau",

      "readme.defaulttitle": "Aplikasi web hasil PromptCraft",
      "license.default.holder": "Penjana PromptCraft",
      "zip.nofiles": "ZipUtil.make: tiada fail"
    },

    /* ========================= BAHASA INDONESIA ========================= */
    id: {
      "doc.title": "PromptCraft \u2014 Ubah idemu jadi aplikasi",
      "doc.desc": "Deskripsikan aplikasi yang kamu mau, model Ollama lokal akan menulis kode dan langsung menampilkannya.",

      "top.home.aria": "Beranda PromptCraft",
      "top.engine.title": "Backend inferensi",
      "top.engine.checking": "Memeriksa Ollama\u2026",
      "top.powered": "Didukung oleh Ollama",
      "top.lang.aria": "Bahasa",

      "hero.eyebrow": "Generator aplikasi open-source \u00b7 model berjalan lokal",
      "hero.l1": "Ubah idemu",
      "hero.l2": "jadi aplikasi",
      "hero.sub": "Tulis satu kalimat. Model kamu akan menulis kode, lalu kamu bisa langsung menjalankannya, mengeditnya, dan menyempurnakannya lewat chat.",

      "prompt.label": "Deskripsi aplikasi",
      "prompt.placeholder": "Aplikasi pengeluaran bulanan dengan grafik batang, dark mode, dan bisa menambah transaksi\u2026",

      "model.label": "model",
      "model.aria": "Pilih model",
      "model.loading": "Memuat model\u2026",
      "model.none": "(tidak ada model)",
      "hint.chars": "{n} karakter",

      "btn.generate": "Hasilkan",
      "chips.aria": "Contoh prompt",

      "chip.sneaker": "Rilis Sneaker",
      "chip.expense": "Pelacak Pengeluaran",
      "chip.sourdough": "Timer Sourdough",
      "chip.team": "Obrolan Tim",
      "chip.beat": "Pembuat Beat",
      "chip.palette": "Generator Palet",

      "foot.built": "Dibangun dengan <strong>Ollama</strong> &amp; <strong>qwen2.5-coder</strong>.",

      "flow.title": "Cara kerjanya",
      "flow.s1.t": "Jelaskan",
      "flow.s1.d": "Tulis satu kalimat tentang app yang Anda mau.",
      "flow.s2.t": "Hasilkan",
      "flow.s2.d": "Model Anda menulis app lengkap yang berdiri sendiri.",
      "flow.s3.t": "Sempurnakan dan ekspor",
      "flow.s3.d": "Chat untuk menyesuaikan, lalu unduh file atau ZIP.",

      "feats.title": "Dibangun untuk pembuat",
      "feats.a.t": "Berjalan di mesin ini",
      "feats.a.d": "Ollama berjalan lokal; AI cloud gratis hanya membantu di latar belakang.",
      "feats.b.t": "Satu file",
      "feats.b.d": "HTML, CSS, dan JavaScript dalam satu file lengkap.",
      "feats.c.t": "Pratinjau langsung",
      "feats.c.d": "Lihat app dirender saat kode mengalir masuk.",
      "feats.d.t": "Empat bahasa",
      "feats.d.d": "Inggris, Melayu, Indonesia, dan Tionghoa Sederhana.",

      "cta.title": "Jelaskan app Anda",
      "cta.btn": "Mulai menulis",
      "privacy.cloud": "Model dipilih otomatis: layanan AI cloud gratis dahulu, model lokal (Ollama) sebagai cadangan saat cloud kena batas. <strong>Prompt kamu bisa dikirim ke penyedia AI pihak ketiga</strong> \u2014 jangan masukkan rahasia atau data sensitif.",
      "privacy.local": "Sementara semua inference berjalan di server ini (Ollama lokal). Begitu API cloud gratis terpasang, prompt bisa dikirim ke penyedia AI pihak ketiga \u2014 <strong>jangan masukkan rahasia atau data sensitif</strong>.",

      "ws.new": "Baru",
      "status.ready": "siap",
      "status.updating": "Memperbarui\u2026{rate}",
      "status.writing": "Menulis kode\u2026{rate}",
      "status.writingRaw": "Menulis\u2026{rate}",
      "status.done": "selesai dalam {s}s",
      "status.stopped": "dihentikan",
      "status.failed": "gagal",

      "btn.copy": "Salin",
      "btn.copy.title": "Salin kode",
      "btn.download": "Unduh",
      "btn.download.title": "Unduh index.html",
      "btn.zip": "ZIP",
      "btn.zip.title": "Unduh proyek ZIP (index.html + README + LICENSE)",
      "btn.refresh": "Muat ulang",
      "btn.refresh.title": "Muat ulang pratinjau",
      "btn.stop": "Berhenti",
      "btn.stop.title": "Hentikan generasi",

      "tab.code": "Kode",
      "tab.chat": "Chat",
      "meta.lines": "{n} baris \u00b7 {kb} KB",

      "chat.empty": "Minta perubahan lewat chat, contoh:<br><em>\u201cganti warnanya jadi terang dan tambahkan tombol reset\u201d</em>",
      "chat.input.ph": "Jelaskan perubahan yang kamu mau\u2026",
      "chat.input.aria": "Perubahan yang diminta",
      "chat.send": "Kirim",
      "chat.newsession": "Sesi baru \u00b7 model {model}",
      "chat.updated": "\u2713 Kode sudah diperbarui \u2014 lihat tab Kode dan panel pratinjau.",
      "chat.truncated": "Output terpotong, kode dirapikan otomatis.",
      "chat.stopped": "Generasi dihentikan.",
      "warn.truncated": "\u26a0 Hasil terpotong di tengah (model kehabisan token). Pratinjau mungkin belum lengkap \u2014 coba Hasilkan ulang atau persempit prompt.",
      "err.notHtml": "Model tidak mengeluarkan HTML yang valid. Coba lagi atau ubah prompt.",

      "preview.pane": "pratinjau \u00b7 index.html",
      "preview.open.title": "Buka di tab baru",
      "preview.iframe.title": "Pratinjau aplikasi",
      "preview.empty": "Pratinjau akan muncul di sini",

      "note.writefirst": "Tulis dulu deskripsi aplikasimu.",
      "note.nomodel": "Tidak ada model Ollama yang bisa dipakai.",
      "note.nomodels.hint": "Tidak ada model tersedia. Jalankan: ollama pull qwen2.5-coder:0.5b",
      "note.engine.unreachable": "Tidak bisa menghubungi engine ({err}). Pastikan layanan promptcraft-proxy dan ollama berjalan.",

      "engine.hybrid": "AI lokal + bantuan cloud \u00b7 {n} model",
      "engine.local": "Ollama lokal \u00b7 {n} model",
      "engine.none": "tidak ada model",
      "engine.down": "engine tidak terjangkau",

      "toast.nocode": "Belum ada kode",
      "toast.copied": "Kode disalin \u2713",
      "toast.copyfail": "Gagal menyalin (izin clipboard ditolak)",
      "toast.downloaded": "index.html diunduh \u2713",
      "toast.zipnomod": "Modul ZIP belum dimuat",
      "toast.zipdone": "Proyek ZIP diunduh \u2713 (3 berkas)",
      "toast.zipfail": "Gagal membuat ZIP: {err}",
      "toast.busy": "Masih memproses\u2026",
      "toast.nomodel": "Model belum siap",

      "err.unreachable": "Ollama tidak terjangkau",

      "readme.defaulttitle": "Aplikasi web hasil PromptCraft",
      "license.default.holder": "Generator PromptCraft",
      "zip.nofiles": "ZipUtil.make: tidak ada berkas"
    },

    /* ========================= 简体中文 ========================= */
    "zh-CN": {
      "flow.title": "工作原理",
      "flow.s1.t": "描述",
      "flow.s1.d": "用一句话描述你想要的应用。",
      "flow.s2.t": "生成",
      "flow.s2.d": "你的模型会写出一个完整的独立应用。",
      "flow.s3.t": "修改并导出",
      "flow.s3.d": "通过聊天调整，然后下载文件或 ZIP。",

      "feats.title": "为创作者打造",
      "feats.a.t": "在本机运行",
      "feats.a.d": "Ollama 在本地运行；免费云端 AI 仅在后台协助。",
      "feats.b.t": "单个文件",
      "feats.b.d": "HTML、CSS 与 JavaScript 都在一个自包含文件中。",
      "feats.c.t": "实时预览",
      "feats.c.d": "代码流式输出时即可看到应用渲染。",
      "feats.d.t": "四种语言",
      "feats.d.d": "英语、马来语、印尼语和简体中文。",

      "cta.title": "描述你的应用",
      "cta.btn": "开始编写",
      "doc.title": "PromptCraft \u2014 \u628a\u4f60\u7684\u60f3\u6cd5\u53d8\u6210\u5e94\u7528",
      "doc.desc": "\u63cf\u8ff0\u4f60\u60f3\u8981\u7684\u5e94\u7528\uff0c\u672c\u5730 Ollama \u6a21\u578b\u4f1a\u76f4\u63a5\u5199\u51fa\u4ee3\u7801\u5e76\u7acb\u5373\u663e\u793a\u3002",

      "top.home.aria": "PromptCraft \u9996\u9875",
      "top.engine.title": "\u63a8\u7406\u540e\u7aef",
      "top.engine.checking": "\u6b63\u5728\u68c0\u67e5 Ollama\u2026",
      "top.powered": "\u7531 Ollama \u9a71\u52a8",
      "top.lang.aria": "\u8bed\u8a00",

      "hero.eyebrow": "\u5f00\u6e90\u5e94\u7528\u751f\u6210\u5668 \u00b7 \u672c\u5730\u6a21\u578b\u8fd0\u884c",
      "hero.l1": "\u628a\u4f60\u7684\u60f3\u6cd5",
      "hero.l2": "\u53d8\u6210\u5e94\u7528",
      "hero.sub": "\u5199\u4e00\u53e5\u8bdd\uff0c\u4f60\u7684\u6a21\u578b\u5c31\u4f1a\u5199\u51fa\u4ee3\u7801\uff0c\u4f60\u53ef\u4ee5\u76f4\u63a5\u8fd0\u884c\u3001\u7f16\u8f91\uff0c\u5e76\u901a\u8fc7\u804a\u5929\u7ee7\u7eed\u5b8c\u5584\u3002",

      "prompt.label": "\u5e94\u7528\u63cf\u8ff0",
      "prompt.placeholder": "\u5e26\u67f1\u72b6\u56fe\u3001\u6df1\u8272\u6a21\u5f0f\u5e76\u53ef\u6dfb\u52a0\u4ea4\u6613\u7684\u6708\u5ea6\u652f\u51fa\u5e94\u7528\u2026",

      "model.label": "\u6a21\u578b",
      "model.aria": "\u9009\u62e9\u6a21\u578b",
      "model.loading": "\u6b63\u5728\u52a0\u8f7d\u6a21\u578b\u2026",
      "model.none": "\uff08\u6682\u65e0\u6a21\u578b\uff09",
      "hint.chars": "{n} \u4e2a\u5b57\u7b26",

      "btn.generate": "\u751f\u6210",
      "chips.aria": "\u63d0\u793a\u8bcd\u793a\u4f8b",

      "chip.sneaker": "\u7403\u978b\u53d1\u5e03",
      "chip.expense": "\u8bb0\u8d26\u5e94\u7528",
      "chip.sourdough": "\u9178\u9762\u56e2\u8ba1\u65f6\u5668",
      "chip.team": "\u56e2\u961f\u804a\u5929",
      "chip.beat": "\u8282\u62cd\u5236\u4f5c\u5668",
      "chip.palette": "\u914d\u8272\u751f\u6210\u5668",

      "foot.built": "\u57fa\u4e8e <strong>Ollama</strong> \u548c <strong>qwen2.5-coder</strong> \u6784\u5efa\u3002",
      "privacy.cloud": "\u6a21\u578b\u4f1a\u81ea\u52a8\u9009\u62e9\uff1a\u4f18\u5148\u4f7f\u7528\u514d\u8d39\u4e91\u7aef AI\uff0c\u4e91\u7aef\u9650\u901f\u65f6\u56de\u9000\u5230\u672c\u5730 Ollama \u6a21\u578b\u3002<strong>\u4f60\u7684\u63d0\u793a\u8bcd\u53ef\u80fd\u4f1a\u53d1\u9001\u7ed9\u7b2c\u4e09\u65b9 AI \u670d\u52a1</strong>\u2014\u2014\u8bf7\u52ff\u8f93\u5165\u5bc6\u94a5\u6216\u654f\u611f\u6570\u636e\u3002",
      "privacy.local": "\u76ee\u524d\u6240\u6709\u63a8\u7406\u90fd\u5728\u672c\u670d\u52a1\u5668\u4e0a\u8fd0\u884c\uff08\u672c\u5730 Ollama\uff09\u3002\u63a5\u5165\u514d\u8d39\u4e91\u7aef API \u540e\uff0c\u63d0\u793a\u8bcd\u53ef\u80fd\u4f1a\u53d1\u9001\u7ed9\u7b2c\u4e09\u65b9 AI \u670d\u52a1\u2014\u2014<strong>\u8bf7\u52ff\u8f93\u5165\u5bc6\u94a5\u6216\u654f\u611f\u6570\u636e</strong>\u3002",

      "ws.new": "\u65b0\u5efa",
      "status.ready": "\u5c31\u7eea",
      "status.updating": "\u6b63\u5728\u66f4\u65b0\u2026{rate}",
      "status.writing": "\u6b63\u5728\u5199\u4ee3\u7801\u2026{rate}",
      "status.writingRaw": "\u6b63\u5728\u5199\u2026{rate}",
      "status.done": "{s} \u79d2\u5b8c\u6210",
      "status.stopped": "\u5df2\u505c\u6b62",
      "status.failed": "\u5931\u8d25",

      "btn.copy": "\u590d\u5236",
      "btn.copy.title": "\u590d\u5236\u4ee3\u7801",
      "btn.download": "\u4e0b\u8f7d",
      "btn.download.title": "\u4e0b\u8f7d index.html",
      "btn.zip": "ZIP",
      "btn.zip.title": "\u4e0b\u8f7d ZIP \u9879\u76ee\uff08index.html + README + LICENSE\uff09",
      "btn.refresh": "\u5237\u65b0",
      "btn.refresh.title": "\u5237\u65b0\u9884\u89c8",
      "btn.stop": "\u505c\u6b62",
      "btn.stop.title": "\u505c\u6b62\u751f\u6210",

      "tab.code": "\u4ee3\u7801",
      "tab.chat": "\u804a\u5929",
      "meta.lines": "{n} \u884c \u00b7 {kb} KB",

      "chat.empty": "\u5728\u804a\u5929\u4e2d\u63d0\u51fa\u4fee\u6539\uff0c\u4f8b\u5982\uff1a<br><em>\u201c\u628a\u989c\u8272\u8c03\u4eae\u4e00\u70b9\uff0c\u518d\u52a0\u4e00\u4e2a\u91cd\u7f6e\u6309\u94ae\u201d</em>",
      "chat.input.ph": "\u63cf\u8ff0\u4f60\u60f3\u8981\u7684\u4fee\u6539\u2026",
      "chat.input.aria": "\u8bf7\u6c42\u7684\u4fee\u6539",
      "chat.send": "\u53d1\u9001",
      "chat.newsession": "\u65b0\u4f1a\u8bdd \u00b7 \u6a21\u578b {model}",
      "chat.updated": "\u2713 \u4ee3\u7801\u5df2\u66f4\u65b0\u2014\u2014\u8bf7\u67e5\u770b\u201c\u4ee3\u7801\u201d\u6807\u7b7e\u9875\u548c\u9884\u89c8\u9762\u677f\u3002",
      "chat.truncated": "\u8f93\u51fa\u88ab\u622a\u65ad\uff0c\u4ee3\u7801\u5df2\u81ea\u52a8\u6574\u7406\u3002",
      "chat.stopped": "\u751f\u6210\u5df2\u505c\u6b62\u3002",
      "warn.truncated": "\u26a0 \u7ed3\u679c\u5728\u4e2d\u9014\u88ab\u622a\u65ad\uff08\u6a21\u578b token \u7528\u5c3d\uff09\u3002\u9884\u89c8\u53ef\u80fd\u4e0d\u5b8c\u6574\u2014\u2014\u8bf7\u91cd\u65b0\u751f\u6210\u6216\u7f29\u77ed\u63d0\u793a\u8bcd\u3002",
      "err.notHtml": "\u6a21\u578b\u6ca1\u6709\u751f\u6210\u6709\u6548\u7684 HTML\u3002\u8bf7\u91cd\u8bd5\u6216\u4fee\u6539\u63d0\u793a\u8bcd\u3002",

      "preview.pane": "\u9884\u89c8 \u00b7 index.html",
      "preview.open.title": "\u5728\u65b0\u6807\u7b7e\u9875\u6253\u5f00",
      "preview.iframe.title": "\u5e94\u7528\u9884\u89c8",
      "preview.empty": "\u9884\u89c8\u5c06\u663e\u793a\u5728\u8fd9\u91cc",

      "note.writefirst": "\u8bf7\u5148\u5199\u4e0b\u4f60\u7684\u5e94\u7528\u63cf\u8ff0\u3002",
      "note.nomodel": "\u6ca1\u6709\u53ef\u7528\u7684 Ollama \u6a21\u578b\u3002",
      "note.nomodels.hint": "\u6ca1\u6709\u53ef\u7528\u6a21\u578b\u3002\u8bf7\u8fd0\u884c\uff1aollama pull qwen2.5-coder:0.5b",
      "note.engine.unreachable": "\u65e0\u6cd5\u8fde\u63a5\u5f15\u64ce\uff08{err}\uff09\u3002\u8bf7\u786e\u8ba4 promptcraft-proxy \u548c ollama \u670d\u52a1\u6b63\u5728\u8fd0\u884c\u3002",

      "engine.hybrid": "\u672c\u5730 AI + \u4e91\u7aef\u52a9\u624b \u00b7 {n} \u4e2a\u6a21\u578b",
      "engine.local": "\u672c\u5730 Ollama \u00b7 {n} \u4e2a\u6a21\u578b",
      "engine.none": "\u65e0\u6a21\u578b",
      "engine.down": "\u5f15\u64ce\u65e0\u6cd5\u8fde\u63a5",

      "toast.nocode": "\u8fd8\u6ca1\u6709\u4ee3\u7801",
      "toast.copied": "\u4ee3\u7801\u5df2\u590d\u5236 \u2713",
      "toast.copyfail": "\u590d\u5236\u5931\u8d25\uff08\u526a\u8d34\u677f\u6743\u9650\u88ab\u62d2\u7edd\uff09",
      "toast.downloaded": "index.html \u5df2\u4e0b\u8f7d \u2713",
      "toast.zipnomod": "ZIP \u6a21\u5757\u5c1a\u672a\u52a0\u8f7d",
      "toast.zipdone": "ZIP \u9879\u76ee\u5df2\u4e0b\u8f7d \u2713\uff083 \u4e2a\u6587\u4ef6\uff09",
      "toast.zipfail": "\u6784\u5efa ZIP \u5931\u8d25\uff1a{err}",
      "toast.busy": "\u4ecd\u5728\u5904\u7406\u2026",
      "toast.nomodel": "\u6a21\u578b\u5c1a\u672a\u5c31\u7eea",

      "err.unreachable": "\u65e0\u6cd5\u8fde\u63a5 Ollama",

      "readme.defaulttitle": "\u7531 PromptCraft \u751f\u6210\u7684\u7f51\u9875\u5e94\u7528",
      "license.default.holder": "PromptCraft \u751f\u6210\u5668",
      "zip.nofiles": "ZipUtil.make\uff1a\u6ca1\u6709\u6587\u4ef6"
    }
  };

  /* ------------------------------------------------------------------ */

  var current = FALLBACK;
  var warned = {};

  function has(code) {
    return Object.prototype.hasOwnProperty.call(DICT, code);
  }

  /** Tukar {pemboleh ubah} dalam string terjemahan. */
  function fill(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, name) {
      return params[name] != null ? String(params[name]) : m;
    });
  }

  /**
   * Ambil teks untuk key semasa bahasa.
   * Kunci tak dikenal => pulangkan kunci itu sendiri DAN log amaran
   * (supaya pepijat terjemahan hilang terserlah, bukan senyap).
   */
  function t(key, params) {
    if (key == null) return "";
    var table = DICT[current] || DICT[FALLBACK];
    var s = table[key];
    if (s == null) s = DICT[FALLBACK][key];
    if (s == null) {
      if (!warned[key]) {
        warned[key] = true;
        if (window.console && console.warn) console.warn("[i18n] key hilang:", key);
      }
      return key;
    }
    return fill(s, params);
  }

  /** Kesankan pilihan bahasa: simpan > pelayar > lalai. */
  function detect() {
    try {
      var saved = window.localStorage.getItem(STORE_KEY);
      if (saved && has(saved)) return saved;
    } catch (e) { /* localStorage boleh disekat */ }

    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        list = Array.prototype.slice.call(navigator.languages);
      } else if (navigator.language) {
        list = [navigator.language];
      }
    } catch (e) { list = []; }

    for (var i = 0; i < list.length; i++) {
      var low = String(list[i] || "").toLowerCase();
      if (low.indexOf("zh") === 0) return "zh-CN";
      if (low.indexOf("ms") === 0) return "ms";
      if (low.indexOf("id") === 0) return "id";
      if (low.indexOf("en") === 0) return "en";
    }
    return FALLBACK;
  }

  function each(selector, fn) {
    var list = document.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i], list[i].getAttribute("data-i18n") ||
      list[i].getAttribute("data-i18n-html") || list[i].getAttribute("data-i18n-title") ||
      list[i].getAttribute("data-i18n-ph") || list[i].getAttribute("data-i18n-aria"));
  }

  /** Isi senarai pilih bahasa (endonim — kekal dalam bahasa sendiri). */
  function fillLangSelect() {
    var sel = document.getElementById("langSelect");
    if (!sel) return;
    if (!sel.options.length) {
      for (var i = 0; i < LANGS.length; i++) {
        var o = document.createElement("option");
        o.value = LANGS[i].code;
        o.textContent = LANGS[i].label;
        sel.appendChild(o);
      }
    }
    sel.value = current;
  }

  /** Terjemah semua teks statik yang bertanda data-i18n*. */
  function applyStatic() {
    document.documentElement.lang = current;

    each("[data-i18n]", function (node, key) { node.textContent = t(key); });
    each("[data-i18n-html]", function (node, key) { node.innerHTML = t(key); });
    each("[data-i18n-title]", function (node, key) { node.setAttribute("title", t(key)); });
    each("[data-i18n-ph]", function (node, key) { node.setAttribute("placeholder", t(key)); });
    each("[data-i18n-aria]", function (node, key) { node.setAttribute("aria-label", t(key)); });

    document.title = t("doc.title");
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", t("doc.desc"));
  }

  function apply() {
    fillLangSelect();
    applyStatic();
    try {
      document.dispatchEvent(new CustomEvent("pc:lang", { detail: { lang: current } }));
    } catch (e) { /* browser sangat lama */ }
  }

  /** Tukar bahasa. simpan=true => kekal untuk lawatan seterusnya. */
  function set(code, opts) {
    if (!has(code)) code = FALLBACK;
    current = code;
    if (!opts || opts.save !== false) {
      try { window.localStorage.setItem(STORE_KEY, code); } catch (e) {}
    }
    apply();
  }

  function init() {
    current = detect();
    apply();
    var sel = document.getElementById("langSelect");
    if (sel && !sel.__wired) {
      sel.__wired = true;
      sel.addEventListener("change", function () { set(sel.value); });
    }
  }

  window.PROMPT_I18N = {
    langs: LANGS,
    // DICT didedah supaya tests/i18n.test.js boleh menyemak KESEMUA kunci
    // wujud dalam KESEMUA bahasa (satu kunci hilang = satu ayat tak diterjemah).
    dict: DICT,
    detect: detect,
    t: t,
    set: set,
    init: init,
    lang: function () { return current; },
    has: has
  };
})();
