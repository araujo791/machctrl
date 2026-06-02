#!/bin/bash
# MachCtrl — Desinstalador completo
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Execute como root: sudo bash uninstall.sh${NC}"; exit 1
fi

echo -e "${YELLOW}Desinstalando MachCtrl...${NC}"

pkill -f MachCtrl 2>/dev/null || true
pkill -f machctrl 2>/dev/null || true

systemctl stop machctrl-backend 2>/dev/null || true
systemctl disable machctrl-backend 2>/dev/null || true
rm -f /etc/systemd/system/machctrl-backend.service
systemctl daemon-reload

rm -rf /opt/machctrl
rm -f /usr/local/bin/machctrl
rm -f /usr/share/applications/machctrl.desktop
rm -f /etc/sudoers.d/machctrl
rm -f /etc/modules-load.d/machctrl.conf
rm -rf /etc/machctrl       # configurações salvas

CURRENT_USER="${SUDO_USER:-$USER}"
rm -f "/home/$CURRENT_USER/.config/autostart/machctrl.desktop"

echo -e "${GREEN}✅ MachCtrl desinstalado completamente.${NC}"
