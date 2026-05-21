#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MachCtrl — Empacotador do Instalador Autoextraível
#  Rode após o build: bash scripts/pack-installer.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "2.0.0")
APPIMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
BACKEND="$SCRIPT_DIR/backend/machctrl_server.py"
ICON="$SCRIPT_DIR/src/assets/app-icon.png"
OUT="$SCRIPT_DIR/MachCtrl-Installer.desktop"
TMP_ICON=$(mktemp /tmp/machctrl-icon.XXXXXX)
TMP_PY=$(mktemp /tmp/machctrl-gen.XXXXXX.py)
trap 'rm -f "$TMP_ICON" "$TMP_PY"' EXIT

[[ -f "$APPIMAGE" ]] || { echo "ERRO: AppImage não encontrado. Rode: npm run build:appimage"; exit 1; }
[[ -f "$BACKEND"  ]] || { echo "ERRO: backend não encontrado"; exit 1; }

APPIMAGE_MD5=$(md5sum "$APPIMAGE" | cut -d' ' -f1)
echo "╔══════════════════════════════════════════╗"
echo "║  MachCtrl — Empacotando Instalador       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Versão:   $VERSION"
echo "  AppImage: $(du -sh "$APPIMAGE" | cut -f1)"
echo "  MD5:      $APPIMAGE_MD5"
echo "  Preparando..."

# Salva ícone b64 em arquivo temporário (evita "lista de argumentos muito longa")
HAS_ICON=false
if [[ -f "$ICON" ]]; then
  gzip -9 -c "$ICON" | base64 -w0 > "$TMP_ICON"
  HAS_ICON=true
fi

# Gera o script Python em arquivo temporário
cat > "$TMP_PY" << 'PYEOF'
import sys, os

out_path   = sys.argv[1]
version    = sys.argv[2]
appimg_md5 = sys.argv[3]
icon_file  = sys.argv[4]  # caminho para arquivo com icon b64, ou ""

icon_b64 = ""
if icon_file and os.path.exists(icon_file):
    with open(icon_file) as f:
        icon_b64 = f.read().strip()

script = f"""#!/bin/bash
# MachCtrl v{version} — Instalador Autoextraível
# AppImage MD5: {appimg_md5}
# ⚠️  Não redistribua — uso pessoal apenas.
APP_VERSION="{version}"
INSTALL_DIR="/opt/machctrl"
LOG_FILE="/tmp/machctrl-install.log"
CURRENT_USER="${{SUDO_USER:-$(logname 2>/dev/null || whoami)}}"
SCRIPT_PATH="$(readlink -f "$0")"

if [[ "$EUID" -eq 0 && -z "$SUDO_USER" ]]; then
  echo "Não execute como root diretamente. Use: bash MachCtrl-Installer.sh" >&2; exit 1
fi

if command -v kdialog &>/dev/null; then
  msg()        {{ kdialog --title "MachCtrl" --msgbox "$1" 2>/dev/null || echo "$1"; }}
  yesno()      {{ kdialog --title "MachCtrl" --yesno "$1" 2>/dev/null; }}
  busy_start() {{ kdialog --title "MachCtrl" --passivepopup "Instalando MachCtrl ${{APP_VERSION}}... aguarde." 600 2>/dev/null & BUSY_PID=$!; }}
  busy_stop()  {{ kill "$BUSY_PID" 2>/dev/null; wait "$BUSY_PID" 2>/dev/null || true; }}
elif command -v zenity &>/dev/null; then
  msg()        {{ zenity --info --title "MachCtrl" --text "$1" --width 420 2>/dev/null || echo "$1"; }}
  yesno()      {{ zenity --question --title "MachCtrl" --text "$1" --width 420 2>/dev/null; }}
  busy_start() {{ zenity --progress --title "MachCtrl" --text "Instalando MachCtrl ${{APP_VERSION}}..." --pulsate --width 420 2>/dev/null & BUSY_PID=$!; }}
  busy_stop()  {{ kill "$BUSY_PID" 2>/dev/null; wait "$BUSY_PID" 2>/dev/null || true; }}
elif command -v yad &>/dev/null; then
  msg()        {{ yad --title "MachCtrl" --text "$1" --button=OK:0 --width 420 2>/dev/null || echo "$1"; }}
  yesno()      {{ yad --title "MachCtrl" --text "$1" --button=Sim:0 --button="Não":1 --width 420 2>/dev/null; }}
  busy_start() {{ yad --title "MachCtrl" --text "Instalando..." --progress --pulsate --width 420 2>/dev/null & BUSY_PID=$!; }}
  busy_stop()  {{ kill "$BUSY_PID" 2>/dev/null; wait "$BUSY_PID" 2>/dev/null || true; }}
else
  msg()        {{ echo -e "\\n[MachCtrl] $1\\n"; }}
  yesno()      {{ read -rp "[MachCtrl] $1 (s/N): " r; [[ "$r" =~ ^[Ss]$ ]]; }}
  busy_start() {{ echo "[MachCtrl] Instalando..."; BUSY_PID=""; }}
  busy_stop()  {{ true; }}
fi

if [[ -f "$INSTALL_DIR/MachCtrl.AppImage" ]]; then
  yesno "MachCtrl já está instalado.\\n\\nDeseja reinstalar / atualizar para v${{APP_VERSION}}?" || exit 0
fi

yesno "MachCtrl ${{APP_VERSION}} — Monitor de Hardware para Linux\\n\\n  ✦ Instalado em: /opt/machctrl\\n  ✦ Serviço automático: machctrl-backend\\n  ✦ Atalho no menu: sim\\n  ✦ Dependências: python, lm_sensors, dmidecode\\n\\nDeseja instalar?" || exit 0

TMPDIR_INST=$(mktemp -d /tmp/machctrl-inst.XXXXXX)
trap 'rm -rf "$TMPDIR_INST"' EXIT

busy_start

echo "Extraindo AppImage..."
sed -n '/^__APPIMAGE_START__$/,/^__APPIMAGE_END__$/{{/^__APPIMAGE/d;p}}' "$SCRIPT_PATH" | base64 -d | gunzip > "$TMPDIR_INST/MachCtrl.AppImage"
chmod +x "$TMPDIR_INST/MachCtrl.AppImage"

echo "Extraindo backend..."
sed -n '/^__BACKEND_START__$/,/^__BACKEND_END__$/{{/^__BACKEND/d;p}}' "$SCRIPT_PATH" | base64 -d | gunzip > "$TMPDIR_INST/machctrl_server.py"
"""

if icon_b64:
    script += f"""
echo "Extraindo ícone..."
sed -n '/^__ICON_START__$/,/^__ICON_END__$/{{/^__ICON/d;p}}' "$SCRIPT_PATH" | base64 -d | gunzip > "$TMPDIR_INST/app-icon.png" 2>/dev/null || true
"""

script += """
ROOT_SCRIPT=$(mktemp /tmp/machctrl-root.XXXXXX.sh)
chmod +x "$ROOT_SCRIPT"

# Escreve o script root expandindo as variáveis corretamente
cat > "$ROOT_SCRIPT" << ROOTEOF
#!/bin/bash
exec >> "${LOG_FILE}" 2>&1
set -euo pipefail

echo "[1/5] Dependências..."
for pkg in python python-psutil python-websockets lm_sensors dmidecode lshw fuse2 fuse3; do
  pacman -Qi "\$pkg" &>/dev/null || pacman -S --noconfirm --needed "\$pkg" &>/dev/null || true
done
python3 -c "import websockets" 2>/dev/null || pip install websockets --break-system-packages &>/dev/null || true

echo "[2/5] Instalando arquivos..."
mkdir -p "${INSTALL_DIR}/backend"
cp "${TMPDIR_INST}/MachCtrl.AppImage" "${INSTALL_DIR}/MachCtrl.AppImage"
chmod +x "${INSTALL_DIR}/MachCtrl.AppImage"
cp "${TMPDIR_INST}/machctrl_server.py" "${INSTALL_DIR}/backend/machctrl_server.py"
if [[ -f "${TMPDIR_INST}/app-icon.png" ]]; then
  install -Dm644 "${TMPDIR_INST}/app-icon.png" /usr/share/pixmaps/machctrl.png
  install -Dm644 "${TMPDIR_INST}/app-icon.png" /usr/share/icons/hicolor/256x256/apps/machctrl.png
  gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
fi
cat > /usr/local/bin/machctrl << 'LAUNCHEREOF'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "\$@"
LAUNCHEREOF
chmod +x /usr/local/bin/machctrl

echo "[3/5] Serviço systemd..."
echo "${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode" > /etc/sudoers.d/machctrl
chmod 440 /etc/sudoers.d/machctrl
cat > /etc/systemd/system/machctrl-backend.service << 'SVCEOF'
[Unit]
Description=MachCtrl Backend
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/machctrl/backend/machctrl_server.py
WorkingDirectory=/opt/machctrl
Restart=on-failure
RestartSec=5
User=root
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal
SyslogIdentifier=machctrl
[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable --now machctrl-backend.service

echo "[4/5] Sensores..."
yes '' | sensors-detect --auto &>/dev/null || true

echo "[5/5] Menu..."
cat > /usr/share/applications/machctrl.desktop << 'DESKEOF'
[Desktop Entry]
Name=MachCtrl
GenericName=Monitor de Hardware
Comment=Monitor e Otimizador de Hardware para Linux
Exec=/usr/local/bin/machctrl
Icon=machctrl
Terminal=false
Type=Application
Categories=System;Monitor;
Keywords=hardware;cpu;gpu;ram;monitor;temperatura;
StartupNotify=true
DESKEOF
update-desktop-database /usr/share/applications 2>/dev/null || true
DBUS_ADDR=\$(grep -z DBUS_SESSION_BUS_ADDRESS /proc/\$(pgrep -u "${CURRENT_USER}" | head -1)/environ 2>/dev/null | tr -d '\\0' | sed 's/DBUS_SESSION_BUS_ADDRESS=//' || true)
sudo -u "${CURRENT_USER}" env DBUS_SESSION_BUS_ADDRESS="\$DBUS_ADDR" bash -c 'kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true' 2>/dev/null || true
echo "SUCESSO"
ROOTEOF

EXIT_CODE=0
if command -v pkexec &>/dev/null; then
  pkexec bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v kdesu &>/dev/null; then
  kdesu bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v konsole &>/dev/null; then
  konsole --hold -e sudo bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v xterm &>/dev/null; then
  xterm -hold -e sudo bash "$ROOT_SCRIPT" || EXIT_CODE=$?
else
  sudo bash "$ROOT_SCRIPT" || EXIT_CODE=$?
fi

busy_stop
rm -f "$ROOT_SCRIPT"

if [[ $EXIT_CODE -eq 0 ]] && grep -q "SUCESSO" "$LOG_FILE" 2>/dev/null; then
  msg "✅  MachCtrl ${APP_VERSION} instalado!\\n\\nAbra pelo menu de apps → MachCtrl\\nou pelo terminal: machctrl"
else
  msg "❌  Falha na instalação.\\n\\nLog: $LOG_FILE"
fi
exit 0
"""

with open(out_path, 'w') as f:
    f.write(script)
print("OK")
PYEOF

python3 "$TMP_PY" "$OUT" "$VERSION" "$APPIMAGE_MD5" "$TMP_ICON"

# ── Anexa payloads no final ───────────────────────────────────────────────────
echo -n "  Comprimindo AppImage (~104MB, aguarde)... "
printf '\n__APPIMAGE_START__\n' >> "$OUT"
gzip -9 -c "$APPIMAGE" | base64 -w76 >> "$OUT"
printf '__APPIMAGE_END__\n' >> "$OUT"
echo "OK"

echo -n "  Backend... "
printf '\n__BACKEND_START__\n' >> "$OUT"
gzip -9 -c "$BACKEND" | base64 -w76 >> "$OUT"
printf '__BACKEND_END__\n' >> "$OUT"
echo "OK"

if [[ "$HAS_ICON" == "true" ]]; then
  echo -n "  Ícone... "
  printf '\n__ICON_START__\n' >> "$OUT"
  cat "$TMP_ICON" >> "$OUT"
  printf '\n__ICON_END__\n' >> "$OUT"
  echo "OK"
fi

# ── Criptografa o instalador com openssl AES-256 ──────────────────────────────
# Torna o conteúdo ilegível em qualquer editor
PLAIN="$OUT"
KEY=$(echo "${APPIMAGE_MD5}machctrl2024" | md5sum | cut -d' ' -f1)
echo -n "  Criptografando... "

# Salva ícone em base64 para embutir no .desktop
ICON_B64_SMALL=""
[[ -f "$ICON" ]] && ICON_B64_SMALL=$(gzip -9 -c "$ICON" | base64 -w0)

# Copia ícone para local permanente (usado pelo .desktop)
ICON_SYSTEM="/usr/share/pixmaps/machctrl-installer.png"
ICON_LOCAL="$(dirname "$PLAIN")/.machctrl-icon.png"
[[ -f "$ICON" ]] && cp "$ICON" "$ICON_LOCAL"

# Gera wrapper .desktop — KDE/GNOME mostra ícone e executa ao clicar duas vezes
# Marca __DATA_START__ no arquivo para o tail encontrar os dados cifrados
cat > "${PLAIN}.wrap" << WRAPEOF
[Desktop Entry]
Name=Instalar MachCtrl ${VERSION}
Comment=Monitor de Hardware para Linux — Clique duas vezes para instalar
Exec=bash -c 'F=\$(readlink -f "\$0" 2>/dev/null); [ -z "\$F" ] && F="${PLAIN}"; K=\$(echo "${APPIMAGE_MD5}machctrl2024" | md5sum | cut -d" " -f1); T=\$(mktemp /tmp/.mc.XXXXXX); trap "rm -f \$T" EXIT; sed -n "/^__DATA_START__$/,\\$p" "\$F" | grep -v "^__DATA_START__" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -a -pass "pass:\${K}" -out "\$T" 2>/dev/null && chmod +x "\$T" && bash "\$T" || (kdialog --title MachCtrl --error "Falha ao iniciar instalador." 2>/dev/null || xmessage "Falha ao iniciar instalador.")'
Icon=${ICON_LOCAL}
Terminal=false
Type=Application
Categories=System;
StartupNotify=true
X-KDE-SubstituteVariables=false
X-MachCtrl-Version=${VERSION}
X-MachCtrl-MD5=${APPIMAGE_MD5}
__DATA_START__
WRAPEOF

# Cifra o instalador plaintext e appenda em base64 após o wrapper
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -a \
  -pass "pass:${KEY}" -in "$PLAIN" >> "${PLAIN}.wrap" 2>/dev/null

mv "${PLAIN}.wrap" "$PLAIN"
chmod 700 "$PLAIN"
echo "OK"
SIZE=$(du -sh "$OUT" | cut -f1)
MD5=$(md5sum "$OUT" | cut -d' ' -f1)

# Arquivo .desktop já tem ícone embutido — nada extra necessário

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Instalador gerado com sucesso!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Instalador: %-39s║\n" "MachCtrl-Installer.desktop"

printf "║  Tamanho:    %-39s║\n" "$SIZE"
printf "║  MD5:        %-39s║\n" "$MD5"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Distribua apenas este arquivo:                      ║"
echo "║    • MachCtrl-Installer.desktop                      ║"
echo "║  O usuário clica duas vezes para instalar            ║"
echo "╚══════════════════════════════════════════════════════╝"
