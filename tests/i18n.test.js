"use strict";
/* ============================================================
   Ujian i18n — halaman mesti PENUH boleh diterjemah.
   ------------------------------------------------------------
   Kenapa ujian ni wujud: keperluan halaman ialah JANGAN CAMPUR
   BAHASA. Kalau satu kunci hilang dalam satu bahasa, t() jatuh
   balik ke Inggeris dan satu ayat Inggeris terpapar dalam paparan
   Melayu — senyap, dan hanya terserlah bila pembaca perasan.

   Ujian ni menyemak:
     1. setiap kunci yang dirujuk wujud dalam SEMUA bahasa
     2. semua bahasa ada SET kunci yang SAMA (bukan bilangan saja)
     3. tiada terjemahan kosong
     4. setiap chip ada semua bahasa, dan data-chip <-> chips.js sepadan
     5. t() benar-benar memulangkan teks terjemahan merentas 4 bahasa
     6. kesan bahasa: tersimpan > pelayar > Inggeris (fallback)
     7. index.html STATIK tulen Inggeris (kalau JS gagal pun tak bercampur)
        + penanda uptime kekal dalam <title>

   Jalankan:  node tests/i18n.test.js
   Tiada dependensi luar (mod bawaan Node sahaja).
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");

/* --- muat i18n.js dalam sandbox dgn document palsu minima
       supaya set() boleh dipanggil dan t() boleh diuji ikut bahasa --- */
const ctx = { console, TextEncoder, Uint8Array, DataView, Date, Math };
ctx.window = ctx;
ctx.navigator = { languages: ["ms-MY"], language: "ms-MY" };
ctx.localStorage = {
  _v: {},
  getItem(k) { return this._v[k] || null; },
  setItem(k, v) { this._v[k] = v; }
};
ctx.CustomEvent = function (type, opts) {
  this.type = type;
  this.detail = opts && opts.detail;
};
ctx.document = {
  documentElement: { lang: "" },
  title: "",
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  dispatchEvent: () => {},
  addEventListener: () => {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), ctx);
const I18N = ctx.window.PROMPT_I18N;
assert.ok(I18N && I18N.dict, "window.PROMPT_I18N.dict tiada");

/* Array.from (bukan .map) supaya result milik realm SEMASA, bukan realm
   sandbox VM — deepStrictEqual membanding prototaip, dan array rentas-realm
   nampak serupa tetapi gagal perbandingan. */
const LANGS = Array.from(I18N.langs, (l) => l.code);
assert.deepStrictEqual(LANGS, ["en", "ms", "id", "zh-CN"],
  "senarai bahasa berubah — kemas kini jangkaan dalam ujian ini juga");
console.log("✓ bahasa: " + LANGS.join(", "));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const zip = fs.readFileSync(path.join(root, "zip.js"), "utf8");

/* ---------- kumpul semua kunci yang dirujuk dalam kod ---------- */
const used = new Map();
function note(key, src) {
  if (!used.has(key)) used.set(key, []);
  used.get(key).push(src);
}
for (const m of html.matchAll(/data-i18n(?:-html|-title|-ph|-aria)?="([^"]+)"/g)) note(m[1], "index.html");
for (const m of app.matchAll(/\bt\(\s*"([^"]+)"/g)) note(m[1], "app.js:t()");
for (const m of app.matchAll(/\bsetStatus\(\s*"([^"]+)"/g)) note(m[1], "app.js:setStatus");
for (const m of app.matchAll(/\bsetNote\(\s*"([^"]+)"/g)) note(m[1], "app.js:setNote");
for (const m of app.matchAll(/\baddMsgKeyed\([^,]+,\s*"([^"]+)"/g)) note(m[1], "app.js:addMsgKeyed");
for (const m of zip.matchAll(/\bt\(\s*"([^"]+)"/g)) note(m[1], "zip.js");
assert.ok(used.size > 50, `kunci dirujuk hanya ${used.size} — regex mungkin rosak`);
console.log(`✓ kunci dirujuk dikumpul: ${used.size}`);

/* ---------- 1. setiap kunci dirujuk wujud dalam SEMUA bahasa ---------- */
const missing = [];
for (const [key, srcs] of used) {
  for (const lang of LANGS) {
    if (!I18N.dict[lang] || I18N.dict[lang][key] == null) {
      missing.push(`${key}  hilang dalam [${lang}]  (${srcs.join(", ")})`);
    }
  }
}
assert.deepStrictEqual(missing, [],
  "kunci terjemahan hilang (akan bocor teks Inggeris):\n  " + missing.join("\n  "));
console.log("✓ setiap kunci dirujuk wujud dalam semua bahasa");

/* ---------- 2. SET kunci sama (bukan bilangan sama sahaja) ----------
   Banding nama kunci, bukan hanya bilangan: bilangan boleh sama walaupun
   satu kunci tersalah eja dalam satu bahasa — dan itu tetap bocor. */
const base = Object.keys(I18N.dict.en).sort();
for (const lang of LANGS) {
  const keys = Object.keys(I18N.dict[lang]).sort();
  assert.deepStrictEqual(keys, base,
    `set kunci ${lang} tidak sama dengan en`);
}
console.log(`✓ semua bahasa ada SET kunci yang sama (${base.length} kunci)`);

/* ---------- 3. tiada terjemahan kosong / bukan rentetan ---------- */
for (const lang of LANGS) {
  for (const [key, val] of Object.entries(I18N.dict[lang])) {
    assert.ok(typeof val === "string" && val.trim().length > 0, `${lang}.${key} kosong`);
  }
}
console.log("✓ tiada terjemahan kosong");

/* ---------- 4. chips.js: setiap chip ada semua bahasa ---------- */
const chipsCtx = { window: {} };
vm.createContext(chipsCtx);
vm.runInContext(fs.readFileSync(path.join(root, "chips.js"), "utf8"), chipsCtx);
const chips = chipsCtx.window.PROMPT_CHIPS;
assert.ok(chips, "window.PROMPT_CHIPS tiada");

const chipProblems = [];
for (const [id, perLang] of Object.entries(chips)) {
  if (typeof perLang !== "object" || perLang === null) {
    chipProblems.push(`${id}: bentuk lama (bukan objek bahasa)`);
    continue;
  }
  for (const lang of LANGS) {
    if (!perLang[lang] || !String(perLang[lang]).trim()) {
      chipProblems.push(`chip ${id} hilang [${lang}]`);
    }
  }
}
assert.deepStrictEqual(chipProblems, [], "chip bermasalah:\n  " + chipProblems.join("\n  "));
console.log(`✓ ${Object.keys(chips).length} chip: semua ada keempat-empat bahasa`);

/* ---------- 5. data-chip HTML <-> chips.js sepadan dua hala ----------
   Sebab: chip dicari ikut data-chip (id stabil), bukan ikut label.
   Label diterjemah, jadi sepadan-ikut-teks akan putus bila tukar bahasa. */
const htmlChips = [...html.matchAll(/data-chip="([^"]+)"/g)].map((m) => m[1]);
assert.ok(htmlChips.length > 0, "tiada data-chip dalam index.html");
const badIds = htmlChips.filter((id) => !chips[id]);
assert.deepStrictEqual(badIds, [], "data-chip tanpa prompt: " + badIds.join(", "));
const orphans = Object.keys(chips).filter((id) => !htmlChips.includes(id));
assert.deepStrictEqual(orphans, [], "prompt tanpa data-chip: " + orphans.join(", "));
console.log(`✓ ${htmlChips.length} data-chip HTML sepadan tepat dgn chips.js`);

/* ---------- 6. UJIAN SEBENAR: set() + t() merentas 4 bahasa ---------- */
const probes = [
  ["en", "btn.generate", "Generate"],
  ["ms", "btn.generate", "Jana"],
  ["id", "btn.generate", "Hasilkan"],
  ["zh-CN", "btn.generate", "\u751f\u6210"],

  ["en", "hint.chars", "12 characters"],
  ["ms", "hint.chars", "12 aksara"],
  ["id", "hint.chars", "12 karakter"],
  ["zh-CN", "hint.chars", "12 \u4e2a\u5b57\u7b26"],

  ["en", "status.done", "done in 3s"],
  ["ms", "status.done", "selesai dalam 3s"],
  ["id", "status.done", "selesai dalam 3s"],
  ["zh-CN", "status.done", "3 \u79d2\u5b8c\u6210"],

  ["en", "tab.code", "Code"],
  ["ms", "tab.code", "Kod"],
  ["id", "tab.code", "Kode"],
  ["zh-CN", "tab.code", "\u4ee3\u7801"],

  ["en", "chat.send", "Send"],
  ["ms", "chat.send", "Hantar"],
  ["id", "chat.send", "Kirim"],
  ["zh-CN", "chat.send", "\u53d1\u9001"],

  ["ms", "toast.zipfail", "Gagal bina ZIP: ralat xyz"],
  ["id", "toast.zipfail", "Gagal membuat ZIP: ralat xyz"],
  ["zh-CN", "toast.zipfail", "\u6784\u5efa ZIP \u5931\u8d25\uff1aralat xyz"]
];
for (const [lang, key, want] of probes) {
  I18N.set(lang, { save: false });
  const params = key === "hint.chars" ? { n: 12 }
    : key === "status.done" ? { s: 3 }
    : key === "toast.zipfail" ? { err: "ralat xyz" }
    : null;
  const got = I18N.t(key, params);
  assert.strictEqual(got, want, `[${lang}] ${key} => "${got}" (jangkaan "${want}")`);
}
console.log(`✓ ${probes.length} terjemahan sebenar lulus merentas 4 bahasa`);

/* ---------- 7. kesan bahasa: tersimpan > pelayar > Inggeris ---------- */
I18N.set("en", { save: false });
assert.strictEqual(I18N.detect(), "ms", "navigator.languages=ms-MY sepatutnya kesan Melayu");
ctx.localStorage._v["promptcraft.lang"] = "zh-CN";
assert.strictEqual(I18N.detect(), "zh-CN", "pilihan tersimpan mesti mengatasi pelayar");
delete ctx.localStorage._v["promptcraft.lang"];
ctx.navigator.languages = ["ja-JP"];
assert.strictEqual(I18N.detect(), "en", "bahasa tak disokong => jatuh ke Inggeris");
console.log("✓ kesan bahasa: tersimpan > pelayar > Inggeris (fallback)");

/* ---------- 8. index.html STATIK tulen Inggeris ----------
   Kalau JS gagal dimuat, halaman mesti kekal satu bahasa penuh (Inggeris),
   bukan campur tiga seperti sebelum ini. */
const markers = [
  "karakter", "kamu ", "Deskripsi aplikasi", "memuat model", "memeriksa Ollama",
  "Dibangun dengan", "rahsia", "perkhidmatan", "Kirim", "Jelaskan perubahan",
  "akan muncul", "tombol reset", "warnanya", "pengeluaran bulanan",
  "grafik batang", "menambah transaksi", "Tulis satu kalimat",
  "Unduh index", "Muat ulang", "Hentikan generasi", "Salin kode",
  "Preview akan", "Contoh prompt", "Pilih model",
  ">Baru<", "siap</span>", "tiada model", "Minta perubahan",
  "ganti warnanya", "model berjalan", "sumber terbuka"
];
const leaks = markers.filter((mk) => html.includes(mk));
assert.deepStrictEqual(leaks, [],
  "teks tak diterjemah dalam HTML statik:\n  " + leaks.join("\n  "));
console.log("✓ index.html statik tulen Inggeris (tiada penanda Melayu/Indonesia baki)");

/* ---------- 9. penanda uptime KEKAL dalam <title> statik ----------
   .github/workflows/uptime.yml grep "Turn your idea into an app" TANPA JS.
   Tukar tajuk statik => monitor lapor DOWN palsu + buka issue outage. */
assert.ok(html.includes("Turn your idea into an app"),
  "penanda uptime hilang dari index.html — uptime monitor akan laporan DOWN palsu");
console.log("✓ penanda uptime kekal dalam <title> statik (sebelum JS)");

console.log("\nSEMUA UJIAN I18N LULUS ✓");
