"use strict";
/* ============================================================
   Ujian regresi ZipUtil — dijalankan oleh GitHub Actions.
   Jalankan:  node tests/zip.test.js
   Tiada dependensi luar (menggunakan mod bawaan Node sahaja).
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");

/* --- muat zip.js dalam sandbox (ia menulis ke window) --- */
const ctx = { TextEncoder, Uint8Array, DataView, console, Date, Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "zip.js"), "utf8"), ctx);
const { ZipUtil } = ctx.window;

assert.ok(ZipUtil && typeof ZipUtil.make === "function", "ZipUtil.make tiada");
assert.ok(typeof ZipUtil.crc32 === "function", "ZipUtil.crc32 tiada");
console.log("✓ zip.js dimuat dan mengeksport ZipUtil");

/* --- 1. CRC32 mesti sepadan nilai rujukan piawaian CRC-32/ISO --- */
const probe = new TextEncoder().encode("123456789");
assert.strictEqual(
  ZipUtil.crc32(probe),
  0xCBF43926,
  "CRC32 salah — sepatutnya 0xCBF43926 untuk \"123456789\""
);
console.log("✓ CRC32 lulus nilai rujukan (0xCBF43926)");

/* --- 2. data uji dengan unicode + emoji ( UTF-8 flag wujud ) --- */
const files = [
  {
    name: "index.html",
    data: "<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>Uji</title></head>\n" +
          "<body><h1>Héllo wörld — ünïcode & emoji 🎉</h1></body>\n</html>"
  },
  { name: "README.md", data: "# Projek Uji\n\n```bash\necho 'code fence'\n```\n" },
  { name: "LICENSE.txt", data: "MIT License\nCopyright (c) 2026 Uji\n" }
];

const bytes = ZipUtil.make(files);
assert.ok(bytes instanceof Uint8Array, "make() mesti pulangkan Uint8Array");
console.log(`✓ ZIP dihasilkan (${bytes.length} bait, ${files.length} fail)`);

/* --- 3. tandatangan struktur ZIP --- */
const sigLocal = String.fromCharCode(...bytes.slice(0, 4));     // PK\x03\x04
assert.strictEqual(sigLocal, "PK\u0003\u0004", "tandatangan local header salah");
console.log("✓ local file header ditandatangani PK\\x03\\x04");

/* --- 4. walk setiap entri: nama + data mesti tepat pada offsetnya --- */
let offset = 0;
const enc = new TextEncoder();
for (const expected of files) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  assert.strictEqual(view.getUint32(0, true), 0x04034b50, "sig entri salah @ " + offset);

  const flags = view.getUint16(6, true);
  const method = view.getUint16(8, true);
  const crc = view.getUint32(14, true);
  const size = view.getUint32(18, true);
  const nameLen = view.getUint16(26, true);

  assert.strictEqual(method, 0, "method mesti STORE (0), bukan " + method);
  assert.strictEqual(flags & 0x0800, 0x0800, "flag UTF-8 (0x0800) mesti ditetapkan");

  const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
  const gotName = Buffer.from(nameBytes).toString("utf8");
  assert.strictEqual(gotName, expected.name, "nama fail salah: " + gotName);

  const dataStart = offset + 30 + nameLen;
  const gotData = bytes.slice(dataStart, dataStart + size);
  const wantData = enc.encode(expected.data);
  assert.strictEqual(size, wantData.length, "saiz data salah utk " + gotName);
  assert.strictEqual(
    Buffer.compare(Buffer.from(gotData), Buffer.from(wantData)),
    0,
    "data rosak utk " + gotName
  );
  assert.strictEqual(ZipUtil.crc32(gotData), crc, "CRC32 entri tak sepadan utk " + gotName);

  offset = dataStart + size;
}
console.log("✓ semua entri: nama, saiz, kandungan dan CRC32 tepat");

/* --- 5. End of central directory mesti wujud di hujung --- */
const eocdSig = String.fromCharCode(...bytes.slice(-22, -18));
assert.strictEqual(eocdSig, "PK\u0005\u0006", "EOCD tidak dijumpai di hujung arkib");
const ev = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 22);
assert.strictEqual(ev.getUint16(10, true), files.length, "bilangan entri dalam EOCD salah");
console.log("✓ EOCD wujud dan menyenaraikan semua entri");

console.log("\nSEMUA UJIAN ZIP LULUS ✓");
