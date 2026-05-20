#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MachCtrl — Empacotador do Instalador Autoextraível
#  Rode após o build: bash scripts/pack-installer.sh
#  Gera: MachCtrl-Installer.sh (arquivo único autoextraível)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "2.0.0")
APPIMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
BACKEND="$SCRIPT_DIR/backend/machctrl_server.py"
ICON="$SCRIPT_DIR/src/assets/app-icon.png"
OUT="$SCRIPT_DIR/MachCtrl-Installer.sh"

[[ -f "$APPIMAGE" ]] || { echo "ERRO: AppImage não encontrado. Rode: npm run build:appimage"; exit 1; }
[[ -f "$BACKEND"  ]] || { echo "ERRO: backend não encontrado"; exit 1; }

echo "╔══════════════════════════════════════════╗"
echo "║  MachCtrl — Empacotando Instalador       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Versão:   $VERSION"
echo "  AppImage: $(du -sh "$APPIMAGE" | cut -f1)  ($APPIMAGE)"
echo "  Comprimindo... (pode levar ~30s para 100MB)"

APPIMAGE_MD5=$(md5sum "$APPIMAGE" | cut -d' ' -f1)
ICON_B64=""
[[ -f "$ICON" ]] && ICON_B64=$(gzip -9 -c "$ICON" | base64 -w0)

# ── Cabeçalho do instalador ───────────────────────────────────────────────────
cat > "$OUT" << HEADER
#!/bin/bash
# MachCtrl v${VERSION} — Instalador Autoextraível
# AppImage MD5: ${APPIMAGE_MD5}
# Gerado em: $(date)
APP_VERSION="${VERSION}"
INSTALL_DIR="/opt/machctrl"
LOG_FILE="/tmp/machctrl-install.log"
CURRENT_USER="\${SUDO_USER:-\$(logname 2>/dev/null || whoami)}"

# ── GUI ────────────────────────────────────────────────────────────────────────
if command -v kdialog &>/dev/null; then
  msg()        { kdialog --title "MachCtrl" --msgbox "\$1" 2>/dev/null || echo "\$1"; }
  yesno()      { kdialog --title "MachCtrl" --yesno "\$1" 2>/dev/null; }
  busy_start() { kdialog --title "MachCtrl" --passivepopup "Instalando MachCtrl \${APP_VERSION}... aguarde." 600 2>/dev/null & BUSY_PID=\$!; }
  busy_stop()  { kill "\$BUSY_PID" 2>/dev/null || true; wait "\$BUSY_PID" 2>/dev/null || true; }
elif command -v zenity &>/dev/null; then
  msg()        { zenity --info --title "MachCtrl" --text "\$1" --width 420 2>/dev/null || echo "\$1"; }
  yesno()      { zenity --question --title "MachCtrl" --text "\$1" --width 420 2>/dev/null; }
  busy_start() { zenity --progress --title "MachCtrl" --text "Instalando MachCtrl \${APP_VERSION}..." --pulsate --width 420 2>/dev/null & BUSY_PID=\$!; }
  busy_stop()  { kill "\$BUSY_PID" 2>/dev/null || true; wait "\$BUSY_PID" 2>/dev/null || true; }
elif command -v yad &>/dev/null; then
  msg()        { yad --title "MachCtrl" --text "\$1" --button=OK:0 --width 420 2>/dev/null || echo "\$1"; }
  yesno()      { yad --title "MachCtrl" --text "\$1" --button=Sim:0 --button="Não":1 --width 420 2>/dev/null; }
  busy_start() { yad --title "MachCtrl" --text "Instalando..." --progress --pulsate --width 420 2>/dev/null & BUSY_PID=\$!; }
  busy_stop()  { kill "\$BUSY_PID" 2>/dev/null || true; wait "\$BUSY_PID" 2>/dev/null || true; }
else
  msg()        { echo -e "\\n[MachCtrl] \$1\\n"; }
  yesno()      { read -rp "[MachCtrl] \$1 (s/N): " r; [[ "\$r" =~ ^[Ss]\$ ]]; }
  busy_start() { echo "[MachCtrl] Instalando..."; BUSY_PID=""; }
  busy_stop()  { true; }
fi

# ── Já instalado? ──────────────────────────────────────────────────────────────
if [[ -f "\$INSTALL_DIR/MachCtrl.AppImage" ]]; then
  yesno "MachCtrl já está instalado.\\n\\nDeseja reinstalar / atualizar para v\${APP_VERSION}?" || exit 0
fi

yesno "MachCtrl \${APP_VERSION} — Monitor de Hardware para Linux

  ✦ Instalado em: /opt/machctrl
  ✦ Serviço automático: machctrl-backend
  ✦ Atalho no menu de apps: sim
  ✦ Dependências: python, lm_sensors, dmidecode

Deseja instalar?" || exit 0

# ── Extrai payloads para arquivos temporários ──────────────────────────────────
TMPDIR_INST=\$(mktemp -d /tmp/machctrl-inst.XXXXXX)
trap 'rm -rf "\$TMPDIR_INST"' EXIT

echo "Extraindo AppImage..."
sed -n '/^__APPIMAGE_START__$/,/^__APPIMAGE_END__$/{/^__APPIMAGE/d;p}' "\$0" | base64 -d | gunzip > "\$TMPDIR_INST/MachCtrl.AppImage"
chmod +x "\$TMPDIR_INST/MachCtrl.AppImage"

sed -n '/^__BACKEND_START__$/,/^__BACKEND_END__$/{/^__BACKEND/d;p}' "\$0" | base64 -d | gunzip > "\$TMPDIR_INST/machctrl_server.py"

ICON_PRESENT=false
HEADER

# Adiciona bloco de ícone condicionalmente
if [[ -n "$ICON_B64" ]]; then
cat >> "$OUT" << HEADER2
sed -n '/^__ICON_START__$/,/^__ICON_END__$/{/^__ICON/d;p}' "\$0" | base64 -d | gunzip > "\$TMPDIR_INST/app-icon.png"
ICON_PRESENT=true
HEADER2
fi

cat >> "$OUT" << 'BODY'

# ── Script root ────────────────────────────────────────────────────────────────
ROOT_SCRIPT=$(mktemp /tmp/machctrl-root.XXXXXX.sh)
chmod +x "$ROOT_SCRIPT"

cat > "$ROOT_SCRIPT" << ROOTEOF
#!/bin/bash
exec > "$LOG_FILE" 2>&1
set -euo pipefail
TMPDIR_INST="$TMPDIR_INST"
INSTALL_DIR="$INSTALL_DIR"
CURRENT_USER="$CURRENT_USER"
ICON_PRESENT="$ICON_PRESENT"

echo "[1/5] Instalando dependências..."
for pkg in python python-psutil python-websockets lm_sensors dmidecode lshw fuse2 fuse3; do
  pacman -Qi "\$pkg" &>/dev/null || pacman -S --noconfirm --needed "\$pkg" &>/dev/null || true
done
python3 -c "import websockets" 2>/dev/null || pip install websockets --break-system-packages &>/dev/null || true

echo "[2/5] Copiando arquivos..."
mkdir -p "\$INSTALL_DIR/backend"
cp "\$TMPDIR_INST/MachCtrl.AppImage" "\$INSTALL_DIR/MachCtrl.AppImage"
chmod +x "\$INSTALL_DIR/MachCtrl.AppImage"
cp "\$TMPDIR_INST/machctrl_server.py" "\$INSTALL_DIR/backend/machctrl_server.py"

if [[ "\$ICON_PRESENT" == "true" && -f "\$TMPDIR_INST/app-icon.png" ]]; then
  install -Dm644 "\$TMPDIR_INST/app-icon.png" /usr/share/pixmaps/machctrl.png
  install -Dm644 "\$TMPDIR_INST/app-icon.png" /usr/share/icons/hicolor/256x256/apps/machctrl.png
  gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
fi

cat > /usr/local/bin/machctrl << 'LAUNCHEREOF'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "\$@"
LAUNCHEREOF
chmod +x /usr/local/bin/machctrl

echo "[3/5] Configurando serviço systemd..."
echo "\$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode" > /etc/sudoers.d/machctrl
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

echo "[4/5] Detectando sensores..."
sensors-detect --auto &>/dev/null || true

echo "[5/5] Criando atalho no menu..."
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
echo "SUCESSO"
ROOTEOF

# ── Eleva para root ────────────────────────────────────────────────────────────
busy_start
EXIT_CODE=0
if command -v pkexec &>/dev/null; then
  pkexec bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v kdesu &>/dev/null; then
  kdesu bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v gksu &>/dev/null; then
  gksu bash "$ROOT_SCRIPT" || EXIT_CODE=$?
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
  # Recarrega menu de apps no KDE/GNOME
  kbuildsycoca6 --noincremental 2>/dev/null || \
  kbuildsycoca5 --noincremental 2>/dev/null || true
  xdg-desktop-menu forceupdate 2>/dev/null || true
  msg "✅  MachCtrl ${APP_VERSION} instalado com sucesso!\n\nAbra pelo menu de apps → MachCtrl\nou pelo terminal: machctrl"
else
  msg "❌  Falha na instalação.\n\nLog: $LOG_FILE"
fi
exit 0
BODY

# ── Anexa payloads como seções no final do script ─────────────────────────────
echo "" >> "$OUT"
echo "__APPIMAGE_START__" >> "$OUT"
echo "  Comprimindo AppImage (~104MB, aguarde)..."
gzip -9 -c "$APPIMAGE" | base64 -w76 >> "$OUT"
echo "__APPIMAGE_END__" >> "$OUT"

echo "__BACKEND_START__" >> "$OUT"
gzip -9 -c "$BACKEND" | base64 -w76 >> "$OUT"
echo "__BACKEND_END__" >> "$OUT"

if [[ -n "$ICON_B64" ]]; then
  echo "__ICON_START__" >> "$OUT"
  echo "$ICON_B64" >> "$OUT"
  echo "__ICON_END__" >> "$OUT"
fi

chmod +x "$OUT"

SIZE=$(du -sh "$OUT" | cut -f1)
MD5=$(md5sum "$OUT" | cut -d' ' -f1)

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Instalador gerado com sucesso!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Arquivo: %-42s║\n" "MachCtrl-Installer.sh"
printf "║  Tamanho: %-42s║\n" "$SIZE"
printf "║  MD5:     %-42s║\n" "$MD5"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  O usuário:                                          ║"
echo "║    1. Baixa MachCtrl-Installer.sh                    ║"
echo "║    2. Clica duas vezes no gerenciador de arquivos    ║"
echo "║    3. Aguarda ~30 segundos                           ║"
echo "║    4. MachCtrl aparece no menu de apps               ║"
echo "╚══════════════════════════════════════════════════════╝"
