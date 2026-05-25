# Maintainer: MachCtrl <machctrl@linux>
pkgname=machctrl
pkgver=2.0.0
pkgrel=1
pkgdesc="Monitor e Otimizador de Hardware para Linux"
arch=('x86_64')
url="https://github.com/araujo791/machctrl"
license=('MIT')
depends=('electron' 'python' 'python-psutil' 'lm_sensors' 'dmidecode')
makedepends=('npm' 'nodejs' 'git')
options=(!strip)
source=("git+${url}.git")
sha256sums=('SKIP')

prepare() {
  cd "$srcdir/$pkgname"
  npm ci || npm install
}

build() {
  cd "$srcdir/$pkgname"

  # Força apenas a compilação de produção do Vite (evita o electron-builder quebrado)
  npx vite build
}

package() {
  cd "$srcdir/$pkgname"

  # Criação do diretório /opt/machctrl
  install -dm755 "$pkgdir/opt/machctrl"

  # Copia arquivos necessários de produção para o diretório final
  cp -r dist electron backend node_modules package.json "$pkgdir/opt/machctrl/"

  # Garante permissão de execução no script do servidor Python do Systemd
  chmod +x "$pkgdir/opt/machctrl/backend/machctrl_server.py"

  # Launcher binário com suporte a Wayland/X11 dinâmico
  install -dm755 "$pkgdir/usr/bin"
  cat > "$pkgdir/usr/bin/machctrl" << 'EOF'
#!/bin/bash
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    exec electron /opt/machctrl/electron/main.js --enable-features=UseOzonePlatform --ozone-platform=wayland "$@"
else
    exec electron /opt/machctrl/electron/main.js "$@"
fi
EOF
  chmod +x "$pkgdir/usr/bin/machctrl"

  # Systemd service
  install -dm755 "$pkgdir/usr/lib/systemd/system"
  cat > "$pkgdir/usr/lib/systemd/system/machctrl-backend.service" << EOF
[Unit]
Description=MachCtrl Backend
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/machctrl/backend/machctrl_server.py
Restart=on-failure
User=root
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

  # Desktop entry
  install -dm755 "$pkgdir/usr/share/applications"
  cat > "$pkgdir/usr/share/applications/machctrl.desktop" << EOF
[Desktop Entry]
Name=MachCtrl
Comment=Monitor e Otimizador de Hardware
Exec=machctrl
Terminal=false
Type=Application
Categories=System;Monitor;
EOF

  # Cópia do arquivo de licença MIT do repositório
  if [ -f "LICENSE" ]; then
    install -Dm644 "LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  fi
}
