#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MachCtrl — Instalador Online (arquivo único)
#  Uso: baixe este arquivo e clique duas vezes no gerenciador de arquivos
#       ou rode: bash MachCtrl-Setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

REPO_URL="https://github.com/araujo791/machctrl.git"
APP_VERSION="2.0.0"
INSTALL_DIR="/opt/machctrl"
WORK_DIR="/tmp/machctrl-setup-$$"
LOG_FILE="/tmp/machctrl-install.log"
CURRENT_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"

# ── Detecta ferramenta de diálogo gráfico ─────────────────────────────────────
if command -v kdialog &>/dev/null; then
  msg()     { kdialog --title "MachCtrl" --msgbox "$1" 2>/dev/null || echo "$1"; }
  yesno()   { kdialog --title "MachCtrl" --yesno "$1" 2>/dev/null; }
  info()    { kdialog --title "MachCtrl" --passivepopup "$1" 4 2>/dev/null || true; }
  progress(){ kdialog --title "MachCtrl — Instalando" --progressbar "$1" 0 2>/dev/null & PROGRESS_PID=$!; }
  progress_end() { kill "$PROGRESS_PID" 2>/dev/null || true; }
elif command -v zenity &>/dev/null; then
  msg()     { zenity --info --title "MachCtrl" --text "$1" --width 420 2>/dev/null || echo "$1"; }
  yesno()   { zenity --question --title "MachCtrl" --text "$1" --width 420 2>/dev/null; }
  info()    { zenity --notification --text "$1" 2>/dev/null || true; }
  progress(){ zenity --progress --title "MachCtrl — Instalando" --text "$1" --pulsate --auto-close --width 420 2>/dev/null & PROGRESS_PID=$!; }
  progress_end() { kill "$PROGRESS_PID" 2>/dev/null || true; }
elif command -v yad &>/dev/null; then
  msg()     { yad --title "MachCtrl" --text "$1" --button=OK:0 --width 420 2>/dev/null || echo "$1"; }
  yesno()   { yad --title "MachCtrl" --text "$1" --button=Sim:0 --button=Não:1 --width 420 2>/dev/null; }
  info()    { yad --notification --text "$1" 2>/dev/null || true; }
  progress(){ yad --title "MachCtrl" --text "$1" --progress --pulsate --auto-close --width 420 2>/dev/null & PROGRESS_PID=$!; }
  progress_end() { kill "$PROGRESS_PID" 2>/dev/null || true; }
else
  # Fallback terminal
  msg()     { echo -e "\n[MachCtrl] $1\n"; }
  yesno()   { read -rp "[MachCtrl] $1 (s/N): " r; [[ "$r" =~ ^[Ss]$ ]]; }
  info()    { echo "[MachCtrl] $1"; }
  progress(){ echo "[MachCtrl] $1"; PROGRESS_PID=""; }
  progress_end() { true; }
fi

# ── Verifica se já está instalado ─────────────────────────────────────────────
if [[ -f "$INSTALL_DIR/MachCtrl.AppImage" ]]; then
  yesno "MachCtrl já está instalado.\n\nDeseja reinstalar / atualizar para a versão mais recente?" || exit 0
fi

# ── Confirmação ────────────────────────────────────────────────────────────────
yesno "MachCtrl v${APP_VERSION} — Monitor de Hardware para Linux

O instalador irá:
  ✦ Baixar o MachCtrl do GitHub (~90 MB)
  ✦ Instalar dependências (python, lm_sensors, etc.)
  ✦ Compilar a interface (~1-2 min)
  ✦ Criar serviço em segundo plano
  ✦ Adicionar ao menu de aplicativos

Deseja continuar?" || exit 0

# ── Script root (será executado com pkexec / sudo) ────────────────────────────
ROOT_SCRIPT=$(mktemp /tmp/machctrl-root.XXXXXX.sh)
chmod +x "$ROOT_SCRIPT"

cat > "$ROOT_SCRIPT" << ROOTSCRIPT
#!/bin/bash
exec > "$LOG_FILE" 2>&1
set -euo pipefail

WORK_DIR="$WORK_DIR"
INSTALL_DIR="$INSTALL_DIR"
CURRENT_USER="$CURRENT_USER"
REPO_URL="$REPO_URL"

step() { echo "[\$1/7] \$2"; }

step 1 "Instalando dependências..."
DEPS=(git python python-psutil python-websockets lm_sensors dmidecode lshw nodejs npm fuse2 fuse3)
for pkg in "\${DEPS[@]}"; do
  pacman -Qi "\$pkg" &>/dev/null || pacman -S --noconfirm --needed "\$pkg" &>/dev/null || true
done
python3 -c "import websockets" 2>/dev/null || pip install websockets --break-system-packages &>/dev/null || true

step 2 "Baixando MachCtrl..."
rm -rf "\$WORK_DIR"
sudo -u "\$CURRENT_USER" git clone --depth=1 "\$REPO_URL" "\$WORK_DIR" 2>&1 || \
  git clone --depth=1 "\$REPO_URL" "\$WORK_DIR" 2>&1

step 3 "Compilando interface..."
cd "\$WORK_DIR"
sudo -u "\$CURRENT_USER" npm install 2>&1 || npm install 2>&1
sudo -u "\$CURRENT_USER" npm run build:appimage 2>&1 || npm run build:appimage 2>&1

APP_IMAGE=\$(find "\$WORK_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
[[ -n "\$APP_IMAGE" ]] || { echo "ERRO: AppImage não gerado"; exit 1; }

step 4 "Instalando arquivos..."
mkdir -p "\$INSTALL_DIR/backend"
cp "\$APP_IMAGE" "\$INSTALL_DIR/MachCtrl.AppImage"
chmod +x "\$INSTALL_DIR/MachCtrl.AppImage"
cp "\$WORK_DIR/backend/machctrl_server.py" "\$INSTALL_DIR/backend/"

cat > /usr/local/bin/machctrl << 'LAUNCHER'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "\$@"
LAUNCHER
chmod +x /usr/local/bin/machctrl

step 5 "Configurando serviço..."
cat > /etc/sudoers.d/machctrl << EOF
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

step 6 "Detectando sensores..."
yes "" | sensors-detect --auto &>/dev/null || true

step 7 "Criando atalho no menu..."
ICON_SRC="\$(find "\$WORK_DIR" -name 'app-icon.png' 2>/dev/null | head -1)"
if [[ -n "\$ICON_SRC" ]]; then
  install -Dm644 "\$ICON_SRC" /usr/share/pixmaps/machctrl.png
  install -Dm644 "\$ICON_SRC" /usr/share/icons/hicolor/256x256/apps/machctrl.png
  gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
fi

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
sudo -u "\$CURRENT_USER" bash -c 'kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true; xdg-desktop-menu forceupdate 2>/dev/null || true' 2>/dev/null || true

rm -rf "\$WORK_DIR"
echo "SUCESSO"
ROOTSCRIPT

# ── Eleva privilégios com janela gráfica ──────────────────────────────────────
progress "Instalando MachCtrl...\nIsso pode levar 1-2 minutos."

EXIT_CODE=0
if command -v pkexec &>/dev/null; then
  pkexec bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v kdesu &>/dev/null; then
  kdesu bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v gksu &>/dev/null; then
  gksu bash "$ROOT_SCRIPT" || EXIT_CODE=$?
elif command -v konsole &>/dev/null; then
  konsole --hold -e bash -c "sudo bash '$ROOT_SCRIPT'; echo 'Pressione Enter para fechar...'; read" || EXIT_CODE=$?
elif command -v xterm &>/dev/null; then
  xterm -hold -e bash -c "sudo bash '$ROOT_SCRIPT'; echo 'Pressione Enter para fechar...'; read" || EXIT_CODE=$?
else
  sudo bash "$ROOT_SCRIPT" || EXIT_CODE=$?
fi

progress_end
rm -f "$ROOT_SCRIPT"


# ── Recarrega menu no KDE/GNOME ───────────────────────────────────────────────
reload_menu_for_user() {
  local RUSER="$1"
  [[ -z "$RUSER" || "$RUSER" == "root" ]] && return
  # Pega DBUS_SESSION_BUS_ADDRESS do processo do usuario
  local DBUS_ADDR
  DBUS_ADDR=$(grep -z DBUS_SESSION_BUS_ADDRESS \
    /proc/$(pgrep -u "$RUSER" -x "kwin_wayland\|kwin_x11\|gnome-shell\|plasmashell" | head -1)/environ \
    2>/dev/null | tr -d '\0' | sed 's/DBUS_SESSION_BUS_ADDRESS=//')
  if [[ -z "$DBUS_ADDR" ]]; then
    # Fallback: pega de qualquer processo do usuario
    DBUS_ADDR=$(grep -z DBUS_SESSION_BUS_ADDRESS \
      /proc/$(pgrep -u "$RUSER" | head -1)/environ \
      2>/dev/null | tr -d '\0' | sed 's/DBUS_SESSION_BUS_ADDRESS=//' || true)
  fi
  update-desktop-database /usr/share/applications 2>/dev/null || true
  sudo -u "$RUSER" env DBUS_SESSION_BUS_ADDRESS="$DBUS_ADDR" \
    bash -c 'kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true; xdg-desktop-menu forceupdate 2>/dev/null || true' \
    2>/dev/null || true
}

REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
reload_menu_for_user "$REAL_USER"

# ── Resultado ─────────────────────────────────────────────────────────────────
if [[ $EXIT_CODE -eq 0 ]] && grep -q "SUCESSO" "$LOG_FILE" 2>/dev/null; then
  msg "✅  MachCtrl instalado com sucesso!

Abra pelo menu de aplicativos → MachCtrl
Ou pelo terminal: machctrl"
else
  msg "❌  Erro na instalação.

Veja o log completo em:
$LOG_FILE

Ou rode no terminal:
bash MachCtrl-Setup.sh"
fi
