"use strict";
/* ============================================================
   Ujian rujukan DOM — memastikan setiap $("id") dalam app.js
   mempunyai pasangan id="..." dalam index.html.
   Kesilapan ni senang berlaku masa tambah butang (contoh: zipBtn)
   dan hanya terserlah di pelayar.
   Jalankan:  node tests/dom-refs.test.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");

/* semua id yang wujud dalam HTML */
const defined = new Set();
for (const m of html.matchAll(/\bid="([^"]+)"/g)) defined.add(m[1]);

/* semua rujukan dalam app.js:  $("x")  dan  getElementById("x") */
const refs = new Map();
for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) {
  if (!refs.has(m[1])) refs.set(m[1], []);
  refs.get(m[1]).push("$()");
}
for (const m of js.matchAll(/getElementById\("([^"]+)"\)/g)) {
  if (!refs.has(m[1])) refs.set(m[1], []);
  refs.get(m[1]).push("getElementById()");
}

assert.ok(refs.size > 0, "tiada rujukan ditemui — regex mungkin rosak");

const missing = [...refs.keys()].filter((id) => !defined.has(id));
assert.deepStrictEqual(
  missing,
  [],
  "id hilang dalam index.html (akan menyebabkan TypeError di pelayar): " +
    missing.map((id) => `${id} (${refs.get(id).join(",")})`).join("; ")
);

console.log(`✓ ${refs.size} rujukan DOM semua wujud dalam index.html`);

/* amaran (bukan ralat): id yang ditakrif tapi tak digunakan */
const unused = [...defined].filter((id) => !refs.has(id));
if (unused.length) {
  console.log(`· maklumat: ${unused.length} id tak dirujuk dalam app.js → ${unused.join(", ")}`);
}

/* pastikan butang penting kekal wujud (regresi terhadap pemadaman tak sengaja) */
for (const must of ["generateBtn", "prompt", "modelSelect", "preview", "codeEl", "zipBtn"]) {
  assert.ok(defined.has(must), `elemen penting hilang: #${must}`);
}
console.log("✓ elemen kritikal (generate/prompt/model/preview/zip) semua ada");

console.log("\nSEMUA UJIAN RUJUKAN DOM LULUS ✓");
