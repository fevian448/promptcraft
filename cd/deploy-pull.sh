#!/usr/bin/env bash
# PromptCraft CD — tarik main, deploy HANYA bila CI hijau.
#
# Dipanggil promptcraft-cd.timer (setiap 2 minit) melalui promptcraft-cd.service
# (User=tukuk). TIADA GitHub Actions runner di mesin ini: semua kerja adalah
# OUTBOUND sahaja, jadi fork PR tidak boleh menyentuh server.
#
# Amanah: skrip ini BUKAN root. Ia hanya boleh memanggil SATU pembungkus
# NOPASSWD: /usr/local/sbin/promptcraft-deploy
set -euo pipefail

REPO=/home/tukuk/deploy/promptcraft
SLUG=fevian448/promptcraft
WORKFLOW=ci.yml
DEPLOY=/usr/local/sbin/promptcraft-deploy
DEPLOYED=/home/tukuk/deploy/.deployed

# `git reset` boleh menukar fail ini semasa bash masih membacanya. Salin diri ke
# fail sementara dahulu supaya langkah reset tidak merosakkan skrip yang berjalan.
if [ -z "${PC_CD_REEXEC:-}" ]; then
  _tmp="$(mktemp)"
  cp "$0" "$_tmp"
  chmod 700 "$_tmp"
  PC_CD_REEXEC=1 PC_CD_TMP="$_tmp" exec bash "$_tmp" "$@"
fi
trap 'rm -f "${PC_CD_TMP:-}"' EXIT

log()  { printf '%s %s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$*"; }
short() { printf '%.7s' "$1"; }

# Ujian setempat. Dinamik (tests/*.test.js) supaya ini BUKAN senarai fail keras
# keempat — senarai keras memang punca senyap yang didokumenkan dalam AGENTS.md.
run_tests() {
  cd "$REPO" || return 1
  local t
  for t in tests/*.test.js; do
    [ -e "$t" ] || { log "RALAT: tiada tests/*.test.js"; return 1; }
    node "$t" >/dev/null || return 1
  done
  bash -n deploy.sh || return 1
  bash -n cd/deploy-pull.sh || return 1
}

[ -d "$REPO/.git" ] || { log "RALAT: clean clone tiada: $REPO"; exit 1; }

# 1) Ambil origin/main. Repo public -> HTTPS anonymous, tiada token yang boleh luput.
git -C "$REPO" fetch --quiet --no-tags --prune origin main

LOCAL="$(git -C "$REPO" rev-parse HEAD)"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"

if [ "$LOCAL" = "$REMOTE" ]; then
  log "tiada commit baharu"
  exit 0
fi
log "origin/main: $(short "$LOCAL") -> $(short "$REMOTE")"

# 2) Tanya CI. null/kosong bermaksud masih berjalan atau belum mula.
#    Repo public = panggilan tanpa token (60/jam; dipanggil hanya bila ada commit baharu).
CONCLUSION="$(curl -fsS --max-time 20 \
  "https://api.github.com/repos/$SLUG/actions/workflows/$WORKFLOW/runs?branch=main&head_sha=$REMOTE&per_page=1" |
  python3 -c 'import sys,json;d=json.load(sys.stdin);r=(d.get("workflow_runs") or [None])[0];print((r or {}).get("conclusion") or "pending")')"

case "$CONCLUSION" in
  pending)
    log "CI masih berjalan untuk $(short "$REMOTE") — cuba lagi"
    exit 0
    ;;
  success)
    log "CI hijau untuk $(short "$REMOTE")"
    ;;
  *)
    # Gagal/batal — dilepaskan. Pengulangan setiap pukulan jam biarkan CI red
    # kelihatan dalam jurnal, dan tangkap semula bila CI dijalankan semula.
    log "CI '$CONCLUSION' untuk $(short "$REMOTE") — deploy DITAHAN"
    exit 0
    ;;
esac

# 3) Kemas kini clean clone. Kerja belum-commit di site-staging TIDAK terlibat.
git -C "$REPO" reset --quiet --hard "$REMOTE"
git -C "$REPO" clean --quiet -fd

# 4) Ujian setempat. Gagal => pulangkan pointer supaya pukulan seterusnya cuba lagi.
if ! run_tests; then
  git -C "$REPO" reset --quiet --hard "$LOCAL"
  log "RALAT: ujian setempat gagal untuk $(short "$REMOTE") — deploy dibatalkan, clone dipulangkan"
  exit 1
fi
log "ujian setempat lulus"

# 5) SATU-satunya tempat skrip ini meminta root. `sudo -n` supaya peraturan
#    sudoers yang hilang gagal dengan kuat, bukan tergantung menunggu kata laluan.
if ! sudo -n "$DEPLOY"; then
  git -C "$REPO" reset --quiet --hard "$LOCAL"
  log "RALAT: deploy gagal untuk $(short "$REMOTE") — clone dipulangkan, akan cuba semula"
  exit 1
fi

printf '%s\n' "$REMOTE" > "$DEPLOYED"
log "deploy selesai: $(short "$REMOTE") -> /var/www/html"
