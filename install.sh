#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MachCtrl Desktop v2.0 — Instalador para CachyOS / Arch Linux
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

C_RESET='\033[0m'; C_BOLD='\033[1m'
C_BLUE='\033[38;5;75m'; C_GREEN='\033[38;5;83m'
C_YELLOW='\033[38;5;220m'; C_RED='\033[38;5;196m'
C_CYAN='\033[38;5;87m'; C_DIM='\033[2m'

step() { echo -e "\n${C_BLUE}${C_BOLD}[$1/$TOTAL]${C_RESET} ${C_BOLD}$2${C_RESET}"; }
ok()   { echo -e "   ${C_GREEN}✓${C_RESET} $1"; }
warn() { echo -e "   ${C_YELLOW}⚠${C_RESET}  $1"; }
fail() { echo -e "   ${C_RED}✗${C_RESET} $1"; }
info() { echo -e "   ${C_DIM}→ $1${C_RESET}"; }

TOTAL=6
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="${SUDO_USER:-$USER}"
INSTALL_DIR="/opt/machctrl"
APP_IMAGE=""

echo -e "\n${C_BLUE}${C_BOLD}"
echo "  ╔════════════════════════════════════════╗"
echo "  ║   MachCtrl Desktop v2.0               ║"
echo "  ║   Monitor de Hardware — CachyOS/Arch  ║"
echo "  ╚════════════════════════════════════════╝"
echo -e "${C_RESET}\n"

if [[ $EUID -ne 0 ]]; then
  fail "Execute como root: ${C_CYAN}sudo bash install.sh${C_RESET}"; exit 1
fi

# ── 1. Dependências ───────────────────────────────────────────────────────────
step 1 "Instalando dependências do sistema"
for pkg in python python-psutil python-websockets lm_sensors dmidecode lshw nodejs npm fuse2 fuse3; do
  if pacman -Qi "$pkg" &>/dev/null; then
    ok "$pkg"
  else
    info "Instalando $pkg..."
    pacman -S --noconfirm --needed "$pkg" &>/dev/null && ok "$pkg" || warn "$pkg não encontrado"
  fi
done

# Garante python-websockets (crítico para o backend WebSocket)
if ! python3 -c "import websockets" 2>/dev/null; then
  warn "python-websockets ausente — instalando via pip..."
  pip install websockets --break-system-packages 2>/dev/null && ok "websockets via pip" \
    || fail "ERRO: instale manualmente: pacman -S python-websockets"
else
  ok "python-websockets OK"
fi

# ── 2. Localiza / gera AppImage ───────────────────────────────────────────────
step 2 "Preparando AppImage"
for loc in \
  "$SCRIPT_DIR/dist-electron/MachCtrl-2.0.0.AppImage" \
  "$SCRIPT_DIR/MachCtrl-2.0.0.AppImage" \
  $(find "$SCRIPT_DIR" -maxdepth 3 -name '*.AppImage' 2>/dev/null | head -1); do
  [[ -f "$loc" ]] && APP_IMAGE="$loc" && ok "AppImage: $loc" && break
done

if [[ -z "$APP_IMAGE" ]]; then
  info "AppImage não encontrado — gerando agora (pode demorar ~2 min)..."
  cd "$SCRIPT_DIR"
  sudo -u "$CURRENT_USER" npm install --prefer-offline 2>/dev/null || npm install 2>/dev/null || true
  sudo -u "$CURRENT_USER" npm run build:appimage 2>&1 | grep -E "(built|error|AppImage|✓|✗)" || true
  APP_IMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
  [[ -n "$APP_IMAGE" ]] && ok "AppImage gerado: $APP_IMAGE" || { fail "Build falhou. Rode: cd machctrl-desktop && npm run build:appimage"; exit 1; }
fi

# ── 3. Instala em /opt/machctrl ───────────────────────────────────────────────
step 3 "Instalando em $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/backend"

cp "$APP_IMAGE" "$INSTALL_DIR/MachCtrl.AppImage"
chmod +x "$INSTALL_DIR/MachCtrl.AppImage"
ok "AppImage → $INSTALL_DIR/MachCtrl.AppImage"

# Backend Python sempre de fora do AppImage (precisa de root para sensores)
cp "$SCRIPT_DIR/backend/machctrl_server.py" "$INSTALL_DIR/backend/"
ok "Backend → $INSTALL_DIR/backend/machctrl_server.py"

# Launcher
cat > /usr/local/bin/machctrl << 'LAUNCHER'
#!/bin/bash
exec /opt/machctrl/MachCtrl.AppImage "$@"
LAUNCHER
chmod +x /usr/local/bin/machctrl
ok "Launcher → /usr/local/bin/machctrl"

# ── 4. Systemd backend ────────────────────────────────────────────────────────
step 4 "Serviço systemd"

# sudoers para dmidecode (leitura dos pentes de RAM)
cat > /etc/sudoers.d/machctrl << EOF
root ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/sbin/dmidecode
EOF
chmod 440 /etc/sudoers.d/machctrl
ok "sudoers: dmidecode sem senha"

cat > /etc/systemd/system/machctrl-backend.service << EOF
[Unit]
Description=MachCtrl Backend
After=network.target
Wants=lm-sensors.service

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
systemctl enable --now machctrl-backend.service 2>/dev/null \
  && ok "machctrl-backend ativo" \
  || warn "Verifique: journalctl -u machctrl-backend -n 20"

# ── 5. Sensores ───────────────────────────────────────────────────────────────
step 5 "Detectando sensores"
sensors-detect --auto 2>/dev/null | tail -2 || warn "Configure sensores manualmente: sudo sensors-detect"

# ── 6. Menu .desktop ──────────────────────────────────────────────────────────
step 6 "Entrada no menu"
# Copia ícone para o sistema
install -Dm644 "$SCRIPT_DIR/src/assets/app-icon.png" /usr/share/pixmaps/machctrl.png
install -Dm644 "$SCRIPT_DIR/src/assets/app-icon.png" /usr/share/icons/hicolor/256x256/apps/machctrl.png
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
ok "Ícone instalado"

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
ok ".desktop criado"

# ── Resumo ────────────────────────────────────────────────────────────────────
echo -e "\n${C_GREEN}${C_BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  ✅  MachCtrl instalado com sucesso!         ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  Abrir: menu de apps → MachCtrl              ║"
echo "  ║         ou terminal: machctrl                ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║  systemctl status machctrl-backend           ║"
echo "  ║  journalctl -u machctrl-backend -f           ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${C_RESET}"
