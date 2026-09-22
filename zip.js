/* ============================================================
   ZipUtil — pembina ZIP tulen dalam JS (method STORE, tiada gzip)
   Sebab: site ini bermatlamat "tiada resource luar", jadi JSZip
   dari CDN tidak sesuai. Format ZIP store-only cukup ringkas.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- CRC32 (diperlukan oleh format ZIP) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) {
      c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- tarikh/masa format DOS (16-bit) ---------- */
  function dosDateTime(d) {
    var y = Math.min(2107, Math.max(1980, d.getFullYear()));
    var time = ((d.getHours() & 0x1F) << 11) |
               ((d.getMinutes() & 0x3F) << 5) |
               ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    var date = (((y - 1980) & 0x7F) << 9) |
               (((d.getMonth() + 1) & 0x0F) << 5) |
               (d.getDate() & 0x1F);
    return { time: time, date: date };
  }

  function toBytes(s) {
    if (typeof s !== "string") return s;
    return new TextEncoder().encode(s);
  }

  /**
   * Bina arkib ZIP.
   * @param {Array<{name:string, data:string|Uint8Array}>} files
   * @returns {Uint8Array} bait ZIP yang sah
   */
  function make(files) {
    if (!files || !files.length) throw new Error("ZipUtil.make: tiada fail");

    var stamp = dosDateTime(new Date());
    var localChunks = [];
    var centralChunks = [];
    var offset = 0;

    for (var i = 0; i < files.length; i++) {
      var nameBytes = toBytes(files[i].name);
      var dataBytes = toBytes(files[i].data);
      var crc = crc32(dataBytes);
      var size = dataBytes.length;

      /* ---- Local file header (30 bait + nama) ---- */
      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); // sig
      lv.setUint16(4, 20, true);         // version needed to extract
      lv.setUint16(6, 0x0800, true);     // general purpose flag: UTF-8 filename
      lv.setUint16(8, 0, true);          // compression method: 0 = STORE
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);      // compressed size
      lv.setUint32(22, size, true);      // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);         // extra field length
      local.set(nameBytes, 30);

      /* ---- Central directory file header (46 bait + nama) ---- */
      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); // sig
      cv.setUint16(4, 20, true);         // version made by
      cv.setUint16(6, 20, true);         // version needed
      cv.setUint16(8, 0x0800, true);     // UTF-8 filename
      cv.setUint16(10, 0, true);         // method: STORE
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);         // extra len
      cv.setUint16(32, 0, true);         // comment len
      cv.setUint16(34, 0, true);         // disk number start
      cv.setUint16(36, 0, true);         // internal attrs
      cv.setUint32(38, 0, true);         // external attrs
      cv.setUint32(42, offset, true);    // relative offset of local header
      cd.set(nameBytes, 46);

      localChunks.push(local, dataBytes);
      centralChunks.push(cd);
      offset += local.length + size;
    }

    /* ---- End of central directory (EOCD) ---- */
    var cdSize = 0;
    for (var j = 0; j < centralChunks.length; j++) cdSize += centralChunks[j].length;

    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);   // sig
    ev.setUint16(4, 0, true);            // disk number
    ev.setUint16(6, 0, true);            // disk with CD
    ev.setUint16(8, centralChunks.length, true);  // entries on this disk
    ev.setUint16(10, centralChunks.length, true); // total entries
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);      // offset of CD
    ev.setUint16(20, 0, true);           // comment length

    /* ---- gabungkan semua ---- */
    var all = localChunks.concat(centralChunks, [eocd]);
    var total = 0;
    for (var k = 0; k < all.length; k++) total += all[k].length;

    var out = new Uint8Array(total);
    var pos = 0;
    for (var m = 0; m < all.length; m++) {
      out.set(all[m], pos);
      pos += all[m].length;
    }
    return out;
  }

  window.ZipUtil = { make: make, crc32: crc32 };
})();
