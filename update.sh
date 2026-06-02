#!/bin/bash
# MachCtrl — Atualiza, desinstala o antigo e instala o novo AppImage
set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗"
echo -e "║   MachCtrl — Atualização Completa    ║"
echo -e "╚══════════════════════════════════════╝${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Precisa de root para instalar
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Execute como root: sudo bash update.sh${NC}"; exit 1
fi

# 1. Git pull
echo -e "\n${YELLOW}[1/6]${NC} Baixando atualizações..."
sudo -u "${SUDO_USER:-$USER}" git pull origin main 2>&1 | tail -3

# 2. Para e REMOVE o antigo
echo -e "\n${YELLOW}[2/6]${NC} Removendo versão antiga..."
pkill -f MachCtrl 2>/dev/null || true
pkill -f machctrl 2>/dev/null || true
sleep 1
rm -f /opt/machctrl/MachCtrl.AppImage
echo -e "   ${GREEN}✓${NC} AppImage antigo removido"

# 3. Atualiza backend + ícone
echo -e "\n${YELLOW}[3/6]${NC} Atualizando backend e ícone..."
cp backend/machctrl_server.py /opt/machctrl/backend/
# Atualiza ícone no sistema
cp src/assets/app-icon.png /usr/share/pixmaps/machctrl.png 2>/dev/null || true
cp src/assets/app-icon.png /usr/share/icons/hicolor/256x256/apps/machctrl.png 2>/dev/null || true
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
systemctl restart machctrl-backend
sleep 1
STATUS=$(systemctl is-active machctrl-backend)
echo -e "   ${GREEN}✓${NC} Backend: $STATUS"

# 4. Rebuild
echo -e "\n${YELLOW}[4/6]${NC} Compilando interface (~1 min)..."
sudo -u "${SUDO_USER:-$USER}" npm run build:appimage 2>&1 | grep -E "(built|error|AppImage|Error|✓)" || true

# 5. Instala novo AppImage
echo -e "\n${YELLOW}[5/6]${NC} Instalando novo AppImage..."
APPIMAGE=$(find dist-electron -name '*.AppImage' 2>/dev/null | head -1)
if [[ -z "$APPIMAGE" ]]; then
  echo -e "   ${RED}✗ AppImage não encontrado — verifique erros acima${NC}"; exit 1
fi
cp "$APPIMAGE" /opt/machctrl/MachCtrl.AppImage
chmod +x /opt/machctrl/MachCtrl.AppImage
echo -e "   ${GREEN}✓${NC} Instalado: /opt/machctrl/MachCtrl.AppImage"

# 6. Abre
echo -e "\n${YELLOW}[6/6]${NC} Abrindo MachCtrl..."
sudo -u "${SUDO_USER:-$USER}" /usr/local/bin/machctrl &

echo -e "\n${GREEN}╔══════════════════════════════════════╗"
echo -e "║  ✅  MachCtrl atualizado com sucesso! ║"
echo -e "╚══════════════════════════════════════╝${NC}\n"
