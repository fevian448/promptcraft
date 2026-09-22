#!/usr/bin/env bash
# Pasang PromptCraft AI Proxy sebagai servis systemd.
# Jalankan dengan: sudo ./install-proxy.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/promptcraft-proxy
UNIT=/etc/systemd/system/promptcraft-proxy.service
ENV=/home/tukuk/.config/promptcraft/proxy.env

echo "==> 1/5 Semak node"
command -v node >/dev/null || { echo "node tiada"; exit 1; }
node --check "$SRC/server.js"
echo "    node $(node --version) — syntax OK"

echo "==> 2/5 Salin kod ke $DEST"
install -d -m 0755 "$DEST"
install -m 0644 "$SRC/server.js" "$DEST/server.js"
echo "    + server.js"

echo "==> 3/5 Sediakan fail environment"
if [ -f "$ENV" ]; then
  echo "    sedia ada, dilewati: $ENV"
else
  echo "    TAMAR: $ENV tidak dijumpai — salin dari /home/tukuk/.config/promptcraft/proxy.env"
  exit 1
fi
chmod 600 "$ENV"
chown tukuk:tukuk "$ENV"
echo "    permission: $(stat -c '%a %U' "$ENV")"

echo "==> 4/5 Pasang unit systemd"
install -m 0644 "$SRC/promptcraft-proxy.service" "$UNIT"
systemctl daemon-reload
systemctl enable promptcraft-proxy >/dev/null 2>&1 || true

echo "==> 5/5 Restart & semak"
systemctl restart promptcraft-proxy
sleep 2
systemctl --no-pager status promptcraft-proxy | head -8

echo
echo "==> Uji endpoint:"
sleep 1
curl -s --max-time 5 http://127.0.0.1:3000/healthz || echo "(belum siap)"
echo
echo "Selesai. Lihat log: journalctl -u promptcraft-proxy -f"
