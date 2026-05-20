#!/bin/bash
# MachCtrl — Desinstalador

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detecta diálogo
if command -v kdialog &>/dev/null; then
  confirm() { kdialog --title "MachCtrl" --yesno "$1" 2>/dev/null; }
  msg()     { kdialog --title "MachCtrl" --msgbox "$1" 2>/dev/null; }
elif command -v zenity &>/dev/null; then
  confirm() { zenity --question --title "MachCtrl" --text "$1" --width 400 2>/dev/null; }
  msg()     { zenity --info --title "MachCtrl" --text "$1" --width 400 2>/dev/null; }
else
  confirm() { read -rp "[MachCtrl] $1 (s/N): " r; [[ "$r" =~ ^[Ss]$ ]]; }
  msg()     { echo "[MachCtrl] $1"; }
fi

confirm "Deseja remover o MachCtrl completamente?" || exit 0

REMOVE_SCRIPT=$(mktemp /tmp/machctrl-remove.XXXXXX.sh)
chmod +x "$REMOVE_SCRIPT"
cat > "$REMOVE_SCRIPT" << 'ROOTSCRIPT'
#!/bin/bash
systemctl stop machctrl-backend 2>/dev/null || true
systemctl disable machctrl-backend 2>/dev/null || true
rm -f /etc/systemd/system/machctrl-backend.service
systemctl daemon-reload
rm -rf /opt/machctrl
rm -f /usr/local/bin/machctrl
rm -f /usr/share/applications/machctrl.desktop
rm -f /usr/share/pixmaps/machctrl.png
rm -f /usr/share/icons/hicolor/256x256/apps/machctrl.png
rm -f /etc/sudoers.d/machctrl
gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
update-desktop-database /usr/share/applications 2>/dev/null || true
echo "REMOVIDO"
ROOTSCRIPT

if command -v pkexec &>/dev/null; then
  pkexec bash "$REMOVE_SCRIPT"
else
  sudo bash "$REMOVE_SCRIPT"
fi

rm -f "$REMOVE_SCRIPT"
msg "✅ MachCtrl removido com sucesso."
