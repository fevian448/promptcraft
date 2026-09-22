#!/usr/bin/env bash
# Deploy site + nginx proxy untuk Ollama.
# Jalankan dengan: sudo ./deploy.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/var/www/html
NGINX_SITE=/etc/nginx/sites-available/default

echo "==> 1/4 Menyalin file ke $DEST"
install -d -m 0755 "$DEST"
for f in index.html styles.css app.js chips.js zip.js site-config.js i18n.js; do
  install -m 0644 "$SRC/$f" "$DEST/$f"
  echo "    + $f"
done

# Binaan Unity WebGL: direktori, BUKAN fail tunggal — jadi kita TIDAK menambah
# senarai hardcoded ketiga (punca kegagalan senyap dalam repo ni, lihat AGENTS.md).
# Kalau tiada, dilewati supaya deploy tapak tetap jalan walau game belum dibina.
if [ -d "$SRC/game" ]; then
  install -d -m 0755 "$DEST/game"
  cp -R "$SRC/game/." "$DEST/game/"
  # WAJIB: fail .br keluar dari pembinaan dengan mod 0600 (hanya pemilik boleh
  # baca). www-data mesti boleh baca, kalau tidak nginx balas 403 —
  # "open() ... failed (13: Permission denied)" dalam /var/log/nginx/error.log.
  chmod -R a+rX "$DEST/game"
  echo "    + game/ (Unity WebGL, $(find "$DEST/game" -type f | wc -l) fail)"
else
  echo "    - game/ tiada dalam repo, dilewati"
fi

echo "==> 2/4 Memasang proxy /api/ollama -> 127.0.0.1:3000 (PromptCraft AI Proxy)"
if grep -q "location /api/ollama/" "$NGINX_SITE"; then
  if grep -q "proxy_pass http://127.0.0.1:3000/" "$NGINX_SITE"; then
    echo "    sudah betul (-> :3000), dilewati"
  else
    echo "    AMARAN: location wujud tapi tidak menunjuk :3000"
    echo "    -> nginx mungkin masih menunjuk Ollama terus (:11434), bukan proxy."
    echo "    -> Betulkan manual: proxy_pass http://127.0.0.1:3000/;"
  fi
else
  python3 - "$NGINX_SITE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
block = """
\t# PromptCraft AI Proxy (Node): free cloud API (utama) -> Ollama local (fallback).
\t# API key kekal server-side, tak pernah disajikan ke browser.
\tlocation /api/ollama/ {
\t\tsend_timeout 600s;
\t\tproxy_http_version 1.1;
\t\tproxy_set_header Connection "";
\t\tproxy_set_header Host 127.0.0.1:3000;
\t\tproxy_set_header Origin "";
\t\t# wajib utk stream NDJSON - halang buffer keluaran model
\t\tproxy_buffering off;
\t\tproxy_cache off;
\t\tproxy_read_timeout 600s;
\t\tproxy_send_timeout 600s;
\t\tproxy_pass http://127.0.0.1:3000/;
\t}
"""
i = s.index("\tlocation / {")
s = s[:i] + block + "\n" + s[i:]
open(p, "w").write(s)
print("    location ditambah -> :3000")
PY
fi

# Header brotli untuk binaan Unity. Loader Unity MENEGAKKAN "Content-Encoding: br"
# pada fail .br (amaran dalam webgl.loader.js): tanpa header ni, WebGL gagal muat.
if grep -q "game/Build/webgl" "$NGINX_SITE"; then
  echo "    blok brotli /game/ sudah ada, dilewati"
else
  python3 - "$NGINX_SITE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
block = """
\t# Unity WebGL: fail .br wajib disajikan ber-"Content-Encoding: br", dan
\t# Content-Type mesti jenis DECOMPRESSED (bukan sambungan ".br" itu sendiri).
\t# nginx menilai lokasi regex dahulu, jadi blok ni menang untuk fail .br.
\tlocation ~* ^/game/Build/webgl\\.wasm\\.br$ {
\t\tgzip off;
\t\tdefault_type application/wasm;
\t\tadd_header Content-Encoding br;
\t}
\tlocation ~* ^/game/Build/webgl\\.framework\\.js\\.br$ {
\t\tgzip off;
\t\tdefault_type text/javascript;
\t\tadd_header Content-Encoding br;
\t}
\tlocation ~* ^/game/.+\\.br$ {
\t\tgzip off;
\t\tadd_header Content-Encoding br;
\t}
"""
i = s.index("\tlocation / {")
s = s[:i] + block + "\n" + s[i:]
open(p, "w").write(s)
print("    blok brotli /game/ ditambah")
PY
fi

echo "==> 3/4 Cek konfigurasi nginx"
nginx -t

echo "==> 4/4 Reload nginx"
systemctl reload nginx
echo "Selesai. Buka http://<ip-server>/"
