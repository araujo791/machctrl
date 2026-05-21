#!/bin/bash
# MachCtrl — Empacotador do Instalador Autoextraível
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "2.0.0")
APPIMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
BACKEND="$SCRIPT_DIR/backend/machctrl_server.py"
OUT="$SCRIPT_DIR/MachCtrl-Installer.desktop"

[[ -f "$APPIMAGE" ]] || { echo "ERRO: AppImage não encontrado. Rode: npm run build:appimage"; exit 1; }
[[ -f "$BACKEND"  ]] || { echo "ERRO: backend não encontrado"; exit 1; }

APPIMAGE_MD5=$(md5sum "$APPIMAGE" | cut -d' ' -f1)
KEY=$(echo "${APPIMAGE_MD5}machctrl2024" | md5sum | cut -d' ' -f1)

echo "╔══════════════════════════════════════════╗"
echo "║  MachCtrl — Empacotando Instalador       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Versão:   $VERSION"
echo "  AppImage: $(du -sh "$APPIMAGE" | cut -f1)"
echo "  MD5:      $APPIMAGE_MD5"

# ── Passo 1: Gera o script instalador interno (plaintext) ─────────────────────
TMP_INNER=$(mktemp /tmp/machctrl-inner.XXXXXX.sh)
trap 'rm -f "$TMP_INNER"' EXIT

cat > "$TMP_INNER" << INNEREOF
#!/bin/bash
APP_VERSION="${VERSION}"
INSTALL_DIR="/opt/machctrl"
LOG_FILE="/tmp/machctrl-install.log"
CURRENT_USER="\${SUDO_USER:-\$(logname 2>/dev/null || whoami)}"

if command -v kdialog &>/dev/null; then
  msg()        { kdialog --title "MachCtrl" --msgbox "\$1" 2>/dev/null || echo "\$1"; }
  yesno()      { kdialog --title "MachCtrl" --yesno "\$1" 2>/dev/null; }
  busy_start() { kdialog --title "MachCtrl" --passivepopup "Instalando MachCtrl \${APP_VERSION}... aguarde." 600 2>/dev/null & BUSY_PID=\$!; }
  busy_stop()  { kill "\$BUSY_PID" 2>/dev/null; wait "\$BUSY_PID" 2>/dev/null || true; }
elif command -v zenity &>/dev/null; then
  msg()        { zenity --info --title "MachCtrl" --text "\$1" --width 420 2>/dev/null || echo "\$1"; }
  yesno()      { zenity --question --title "MachCtrl" --text "\$1" --width 420 2>/dev/null; }
  busy_start() { zenity --progress --title "MachCtrl" --text "Instalando MachCtrl \${APP_VERSION}..." --pulsate --width 420 2>/dev/null & BUSY_PID=\$!; }
  busy_stop()  { kill "\$BUSY_PID" 2>/dev/null; wait "\$BUSY_PID" 2>/dev/null || true; }
else
  msg()        { echo -e "\n[MachCtrl] \$1\n"; }
  yesno()      { read -rp "[MachCtrl] \$1 (s/N): " r; [[ "\$r" =~ ^[Ss]\$ ]]; }
  busy_start() { echo "[MachCtrl] Instalando..."; BUSY_PID=""; }
  busy_stop()  { true; }
fi

if [[ -f "\$INSTALL_DIR/MachCtrl.AppImage" ]]; then
  yesno "MachCtrl já está instalado.\n\nDeseja reinstalar / atualizar para v\${APP_VERSION}?" || exit 0
fi

yesno "MachCtrl \${APP_VERSION} — Monitor de Hardware para Linux\n\n  ✦ Instalado em: /opt/machctrl\n  ✦ Serviço automático: machctrl-backend\n  ✦ Atalho no menu: sim\n  ✦ Dependências: python, lm_sensors, dmidecode\n\nDeseja instalar?" || exit 0

TMPDIR_INST=\$(mktemp -d /tmp/machctrl-inst.XXXXXX)
trap 'rm -rf "\$TMPDIR_INST"' EXIT

busy_start

sed -n '/^__APPIMAGE_START__$/,/^__APPIMAGE_END__$/{/^__APPIMAGE/d;p}' "\$0" | base64 -d | gunzip > "\$TMPDIR_INST/MachCtrl.AppImage"
chmod +x "\$TMPDIR_INST/MachCtrl.AppImage"
sed -n '/^__BACKEND_START__$/,/^__BACKEND_END__$/{/^__BACKEND/d;p}' "\$0" | base64 -d | gunzip > "\$TMPDIR_INST/machctrl_server.py"

ROOT_SCRIPT=\$(mktemp /tmp/machctrl-root.XXXXXX.sh)
chmod +x "\$ROOT_SCRIPT"

cat > "\$ROOT_SCRIPT" << ROOTEOF
#!/bin/bash
exec >> "\${LOG_FILE}" 2>&1
set -euo pipefail
echo "[1/5] Dependências..."
for pkg in python python-psutil python-websockets lm_sensors dmidecode fuse2 fuse3; do
  pacman -Qi "\\\$pkg" &>/dev/null || pacman -S --noconfirm --needed "\\\$pkg" &>/dev/null || true
done
python3 -c "import websockets" 2>/dev/null || pip install websockets --break-system-packages &>/dev/null || true
echo "[2/5] Instalando arquivos..."
mkdir -p "\${INSTALL_DIR}/backend"
cp "\${TMPDIR_INST}/MachCtrl.AppImage" "\${INSTALL_DIR}/MachCtrl.AppImage"
chmod +x "\${INSTALL_DIR}/MachCtrl.AppImage"
cp "\${TMPDIR_INST}/machctrl_server.py" "\${INSTALL_DIR}/backend/machctrl_server.py"
cat > /usr/local/bin/machctrl << 'LAUNCHEREOF'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "\\\$@"
LAUNCHEREOF
chmod +x /usr/local/bin/machctrl
echo "[3/5] Serviço systemd..."
echo "\${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode" > /etc/sudoers.d/machctrl
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
yes "" | sensors-detect --auto &>/dev/null || true
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
DBUS_ADDR=\$(grep -z DBUS_SESSION_BUS_ADDRESS /proc/\$(pgrep -u "\${CURRENT_USER}" | head -1)/environ 2>/dev/null | tr -d '\0' | sed 's/DBUS_SESSION_BUS_ADDRESS=//' || true)
sudo -u "\${CURRENT_USER}" env DBUS_SESSION_BUS_ADDRESS="\${DBUS_ADDR}" bash -c 'kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true' 2>/dev/null || true
echo "SUCESSO"
ROOTEOF

EXIT_CODE=0
if command -v pkexec &>/dev/null; then
  pkexec bash "\$ROOT_SCRIPT" || EXIT_CODE=\$?
elif command -v kdesu &>/dev/null; then
  kdesu bash "\$ROOT_SCRIPT" || EXIT_CODE=\$?
elif command -v konsole &>/dev/null; then
  konsole --hold -e sudo bash "\$ROOT_SCRIPT" || EXIT_CODE=\$?
else
  sudo bash "\$ROOT_SCRIPT" || EXIT_CODE=\$?
fi

busy_stop
rm -f "\$ROOT_SCRIPT"

if [[ \$EXIT_CODE -eq 0 ]] && grep -q "SUCESSO" "\$LOG_FILE" 2>/dev/null; then
  msg "✅  MachCtrl \${APP_VERSION} instalado!\n\nAbra pelo menu de apps → MachCtrl\nou pelo terminal: machctrl"
else
  msg "❌  Falha na instalação.\n\nLog: \$LOG_FILE"
fi
exit 0

__APPIMAGE_START__
__APPIMAGE_END__
__BACKEND_START__
__BACKEND_END__
INNEREOF

# ── Passo 2: Injeta os payloads no script interno ─────────────────────────────
echo -n "  Comprimindo AppImage (~104MB, aguarde)... "
APPIMAGE_ENCODED=$(gzip -9 -c "$APPIMAGE" | base64 -w76)
# Insere antes de __APPIMAGE_END__
python3 -c "
import sys
content = open('$TMP_INNER').read()
content = content.replace('__APPIMAGE_START__\n__APPIMAGE_END__', '__APPIMAGE_START__\n' + sys.stdin.read() + '__APPIMAGE_END__')
open('$TMP_INNER', 'w').write(content)
" <<< "$APPIMAGE_ENCODED"
echo "OK"

echo -n "  Backend... "
BACKEND_ENCODED=$(gzip -9 -c "$BACKEND" | base64 -w76)
python3 -c "
import sys
content = open('$TMP_INNER').read()
content = content.replace('__BACKEND_START__\n__BACKEND_END__', '__BACKEND_START__\n' + sys.stdin.read() + '__BACKEND_END__')
open('$TMP_INNER', 'w').write(content)
" <<< "$BACKEND_ENCODED"
echo "OK"

# ── Passo 3: Cifra o script interno com AES-256 ───────────────────────────────
echo -n "  Criptografando... "
TMP_ENCRYPTED=$(mktemp /tmp/machctrl-enc.XXXXXX)
trap 'rm -f "$TMP_INNER" "$TMP_ENCRYPTED"' EXIT
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -a \
  -pass "pass:${KEY}" -in "$TMP_INNER" -out "$TMP_ENCRYPTED" 2>/dev/null
echo "OK"

# ── Passo 4: Gera o .desktop wrapper com os dados cifrados no final ───────────
cat > "$OUT" << DESKTOPEOF
[Desktop Entry]
Name=Instalar MachCtrl ${VERSION}
Comment=Monitor de Hardware para Linux
Exec=bash -c 'K=\$(echo "${APPIMAGE_MD5}machctrl2024" | md5sum | cut -d" " -f1); F=\$(readlink -f "%k"); T=\$(mktemp /tmp/.mc.XXXXXX); trap "rm -f \$T" EXIT; sed -n "/^__DATA_START__/,\$ p" "\$F" | tail -n +2 | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -a -pass "pass:\${K}" -out "\$T" 2>/dev/null && chmod +x "\$T" && bash "\$T" || (kdialog --title MachCtrl --error "Falha." 2>/dev/null || echo "Falha ao instalar.")'
Icon=system-software-install
Terminal=false
Type=Application
Categories=System;
StartupNotify=true
X-KDE-SubstituteVariables=false
__DATA_START__
DESKTOPEOF

cat "$TMP_ENCRYPTED" >> "$OUT"
chmod 700 "$OUT"

SIZE=$(du -sh "$OUT" | cut -f1)
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Instalador gerado!                              ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Arquivo: %-42s║\n" "MachCtrl-Installer.desktop"
printf "║  Tamanho: %-42s║\n" "$SIZE"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Clique duas vezes para instalar                     ║"
echo "╚══════════════════════════════════════════════════════╝"
