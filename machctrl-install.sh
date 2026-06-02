#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MachCtrl — Instalador Gráfico (clique duplo no gerenciador de arquivos)
#  Compatível com: KDE, GNOME, XFCE, Arch/CachyOS/Manjaro e derivados
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_VERSION="2.0.0"
INSTALL_DIR="/opt/machctrl"
LOG_FILE="/tmp/machctrl-install.log"

# ── Detecta ferramenta de diálogo gráfico ─────────────────────────────────────
gui_msg()   { "$DIALOG" --title "MachCtrl" --msgbox "$1" 8 60 2>/dev/null || echo "$1"; }
gui_yesno() { "$DIALOG" --title "MachCtrl" --yesno "$1" 8 60 2>/dev/null; }
gui_info()  { "$DIALOG" --title "MachCtrl" --infobox "$1" 6 60 2>/dev/null || true; }

if command -v kdialog &>/dev/null; then
  DIALOG_TYPE="kdialog"
  gui_msg()   { kdialog --title "MachCtrl" --msgbox "$1" 2>/dev/null || echo "$1"; }
  gui_yesno() { kdialog --title "MachCtrl" --yesno "$1" 2>/dev/null; }
  gui_info()  { kdialog --title "MachCtrl" --passivepopup "$1" 3 2>/dev/null || true; }
  gui_progress_start() { kdialog --title "MachCtrl — Instalando" --progressbar "$1" 100 2>/dev/null & echo $!; }
elif command -v zenity &>/dev/null; then
  DIALOG_TYPE="zenity"
  gui_msg()   { zenity --info --title "MachCtrl" --text "$1" --width 400 2>/dev/null || echo "$1"; }
  gui_yesno() { zenity --question --title "MachCtrl" --text "$1" --width 400 2>/dev/null; }
  gui_info()  { zenity --notification --text "$1" 2>/dev/null || true; }
elif command -v yad &>/dev/null; then
  DIALOG_TYPE="yad"
  gui_msg()   { yad --title "MachCtrl" --text "$1" --button=OK --width 400 2>/dev/null || echo "$1"; }
  gui_yesno() { yad --title "MachCtrl" --text "$1" --button=Sim:0 --button=Não:1 --width 400 2>/dev/null; }
  gui_info()  { yad --notification --text "$1" 2>/dev/null || true; }
elif command -v xmessage &>/dev/null; then
  DIALOG_TYPE="xmessage"
  gui_msg()   { xmessage -center "$1"; }
  gui_yesno() { xmessage -center -buttons "Sim:0,Não:1" "$1"; return $?; }
  gui_info()  { true; }
else
  # Sem GUI — roda no terminal mesmo
  DIALOG_TYPE="terminal"
  gui_msg()   { echo "[MachCtrl] $1"; read -rp "Pressione Enter para continuar..."; }
  gui_yesno() { read -rp "[MachCtrl] $1 (s/N): " r; [[ "$r" =~ ^[Ss]$ ]]; }
  gui_info()  { echo "[MachCtrl] $1"; }
fi

# ── Verifica se já está instalado ─────────────────────────────────────────────
if [[ -f "$INSTALL_DIR/MachCtrl.AppImage" ]]; then
  if gui_yesno "MachCtrl já está instalado.\n\nDeseja reinstalar / atualizar?"; then
    : # continua
  else
    exit 0
  fi
fi

# ── Confirmação inicial ────────────────────────────────────────────────────────
gui_yesno "$(cat <<EOF
MachCtrl v${APP_VERSION} — Monitor de Hardware

Será instalado em: /opt/machctrl
Serviço do sistema: machctrl-backend
Entrada no menu de aplicativos: sim

Dependências (pacman):
  python, python-psutil, python-websockets
  lm_sensors, dmidecode, lshw, fuse2

Deseja instalar agora?
EOF
)" || exit 0

# ── Script de instalação que roda como root ───────────────────────────────────
INSTALL_SCRIPT=$(mktemp /tmp/machctrl-root-install.XXXXXX.sh)
chmod +x "$INSTALL_SCRIPT"

cat > "$INSTALL_SCRIPT" << ROOTSCRIPT
#!/bin/bash
set -euo pipefail
exec > "$LOG_FILE" 2>&1

SCRIPT_DIR="$SCRIPT_DIR"
INSTALL_DIR="$INSTALL_DIR"
CURRENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo $USER)}"
APP_VERSION="$APP_VERSION"

echo "[1/6] Instalando dependências..."
DEPS=(python python-psutil python-websockets lm_sensors dmidecode lshw fuse2 fuse3)
for pkg in "\${DEPS[@]}"; do
  pacman -Qi "\$pkg" &>/dev/null || pacman -S --noconfirm --needed "\$pkg" &>/dev/null || true
done

# pip fallback para websockets
python3 -c "import websockets" 2>/dev/null || \
  pip install websockets --break-system-packages &>/dev/null || true

echo "[2/6] Procurando AppImage..."
APP_IMAGE=""
for loc in \
  "\$SCRIPT_DIR/dist-electron/MachCtrl-\${APP_VERSION}.AppImage" \
  "\$SCRIPT_DIR/MachCtrl-\${APP_VERSION}.AppImage" \
  \$(find "\$SCRIPT_DIR" -maxdepth 3 -name '*.AppImage' 2>/dev/null | head -1); do
  [[ -f "\$loc" ]] && APP_IMAGE="\$loc" && break
done

if [[ -z "\$APP_IMAGE" ]]; then
  echo "  AppImage não encontrado — fazendo build..."
  cd "\$SCRIPT_DIR"
  sudo -u "\$CURRENT_USER" npm install --prefer-offline 2>/dev/null || npm install 2>/dev/null || true
  sudo -u "\$CURRENT_USER" npm run build:appimage 2>&1 || true
  APP_IMAGE=\$(find "\$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
  [[ -n "\$APP_IMAGE" ]] || { echo "ERRO: build falhou"; exit 1; }
fi

echo "[3/6] Instalando arquivos..."
mkdir -p "\$INSTALL_DIR/backend"
cp "\$APP_IMAGE" "\$INSTALL_DIR/MachCtrl.AppImage"
chmod +x "\$INSTALL_DIR/MachCtrl.AppImage"
cp "\$SCRIPT_DIR/backend/machctrl_server.py" "\$INSTALL_DIR/backend/"

# Launcher
cat > /usr/local/bin/machctrl << 'LAUNCHER'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "\$@"
LAUNCHER
chmod +x /usr/local/bin/machctrl

echo "[4/6] Configurando serviço systemd..."
cat > /etc/sudoers.d/machctrl << EOF
root ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode
\$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode
EOF
chmod 440 /etc/sudoers.d/machctrl

cat > /etc/systemd/system/machctrl-backend.service << EOF
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
EOF

systemctl daemon-reload
systemctl enable --now machctrl-backend.service

echo "[5/6] Detectando sensores..."
sensors-detect --auto 2>/dev/null | tail -2 || true

echo "[6/6] Criando atalho no menu..."
install -Dm644 "\$SCRIPT_DIR/src/assets/app-icon.png" /usr/share/pixmaps/machctrl.png 2>/dev/null || \
  install -Dm644"\$SCRIPT_DIR/dist-electron/linux-unpacked/resources/app-icon.png" /usr/share/pixmaps/machctrl.png 2>/dev/null || true
install -Dm644 /usr/share/pixmaps/machctrl.png /usr/share/icons/hicolor/256x256/apps/machctrl.png 2>/dev/null || true
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true

cat > /usr/share/applications/machctrl.desktop << 'DESKTOP'
[Desktop Entry]
Name=MachCtrl
GenericName=Monitor de Hardware
Comment=Monitor e Otimizador de Hardware para Linux
Exec=/usr/local/bin/machctrl
Icon=machctrl
Terminal=false
Type=Application
Categories=System;Monitor;
Keywords=hardware;cpu;gpu;ram;monitor;temperatura;benchmark;
StartupNotify=true
DESKTOP

update-desktop-database /usr/share/applications 2>/dev/null || true
echo "SUCESSO"
ROOTSCRIPT

# ── Executa como root via pkexec / kdesu / gksu / sudo ───────────────────────
ELEVATE=""
if command -v pkexec &>/dev/null; then
  ELEVATE="pkexec"
elif command -v kdesu &>/dev/null; then
  ELEVATE="kdesu --"
elif command -v gksu &>/dev/null; then
  ELEVATE="gksu"
elif command -v sudo &>/dev/null; then
  # Abre terminal para pedir senha
  if command -v konsole &>/dev/null; then
    ELEVATE="konsole -e sudo"
  elif command -v gnome-terminal &>/dev/null; then
    ELEVATE="gnome-terminal -- sudo"
  elif command -v xterm &>/dev/null; then
    ELEVATE="xterm -e sudo"
  else
    ELEVATE="sudo"
  fi
fi

gui_info "Instalando MachCtrl...\nIsso pode levar 1-2 minutos."

$ELEVATE bash "$INSTALL_SCRIPT"
RESULT=$?
rm -f "$INSTALL_SCRIPT"

if [[ $RESULT -eq 0 ]] && grep -q "SUCESSO" "$LOG_FILE" 2>/dev/null; then
  gui_msg "✅ MachCtrl instalado com sucesso!

Abra pelo menu de aplicativos → MachCtrl
ou pelo terminal: machctrl

Log: $LOG_FILE"
else
  gui_msg "❌ Erro na instalação.

Veja o log: $LOG_FILE
Ou rode no terminal: sudo bash install.sh"
fi
