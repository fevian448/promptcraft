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

echo "==> 3/4 Cek konfigurasi nginx"
nginx -t

echo "==> 4/4 Reload nginx"
systemctl reload nginx
echo "Selesai. Buka http://<ip-server>/"
