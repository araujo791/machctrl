#!/usr/bin/env bash

# Configuração de Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Funções de Status/Feedback
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
fail() { echo -e "${RED}[ERRO]${NC} $1"; }

# 1. Garante que o script roda como ROOT
if [ "$EUID" -ne 0 ]; then
  fail "Por favor, execute este script como root (usando sudo)."
  exit 1
fi

# 2. Identifica o usuário real (quem digitou o sudo) e o diretório do script
CURRENT_USER=${SUDO_USER:-$USER}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Evita que o root quebre as permissões do diretório atual se rodado pelo sudo
chown -R "$CURRENT_USER":"$CURRENT_USER" "$SCRIPT_DIR"

echo "=================================================="
echo "   STEP 1: Instalando dependências do sistema     "
echo "=================================================="

pacotes=(python python-psutil python-websockets lm_sensors dmidecode nodejs npm fuse2 fuse3)

for pkg in "${pacotes[@]}"; do
  if pacman -Qi "$pkg" &>/dev/null; then
    ok "$pkg já está instalado."
  else
    info "Instalando $pkg..."
    if pacman -S --noconfirm --needed "$pkg" &>/dev/null; then
      ok "$pkg instalado com sucesso."
    else
      warn "$pkg não encontrado ou falhou ao instalar."
    fi
  fi
done

echo -e "\n=================================================="
echo "   STEP 2: Preparando AppImage                    "
echo "=================================================="

# Busca se já existe um AppImage pronto
for loc in \
  "$SCRIPT_DIR/dist-electron/MachCtrl-2.0.0.AppImage" \
  "$SCRIPT_DIR/MachCtrl-2.0.0.AppImage" \
  $(find "$SCRIPT_DIR" -maxdepth 3 -name '*.AppImage' 2>/dev/null | head -1); do
  [[ -f "$loc" ]] && APP_IMAGE="$loc" && ok "AppImage encontrado em: $loc" && break
done

if [[ -z "$APP_IMAGE" ]]; then
  info "AppImage não encontrado — gerando agora (pode demorar ~2 min)..."
  cd "$SCRIPT_DIR"

  # Instala dependências do Node como usuário comum
  sudo -u "$CURRENT_USER" npm install --prefer-offline 2>/dev/null || sudo -u "$CURRENT_USER" npm install 2>/dev/null || true

  # Roda o build do AppImage filtrando a saída relevante
  sudo -u "$CURRENT_USER" npm run build:appimage 2>&1 | grep -E "(built|error|AppImage|✓|✗)" || true

  APP_IMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
  [[ -n "$APP_IMAGE" ]] && ok "AppImage gerado: $APP_IMAGE" || { fail "Build falhou. Rode: cd $SCRIPT_DIR && npm run build:appimage"; exit 1; }
else
  info "Rebuilding interface com source mais recente..."
  cd "$SCRIPT_DIR"

  sudo -u "$CURRENT_USER" npm install --prefer-offline 2>/dev/null || true
  sudo -u "$CURRENT_USER" npm run build:appimage 2>&1 | grep -E "(built|error|AppImage|✓|✗)" || true

  NEW_IMAGE=$(find "$SCRIPT_DIR/dist-electron" -name '*.AppImage' 2>/dev/null | head -1)
  [[ -n "$NEW_IMAGE" ]] && APP_IMAGE="$NEW_IMAGE" && ok "AppImage atualizado: $APP_IMAGE"
fi

echo -e "\n=================================================="
echo "✨ Processo concluído com sucesso!"
echo "AppImage final em: $APP_IMAGE"
echo "=================================================="
