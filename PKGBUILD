# Maintainer: MachCtrl <machctrl@linux>
pkgname=machctrl
pkgver=2.0.0
pkgrel=1
pkgdesc="Monitor e Otimizador de Hardware para Linux"
arch=('x86_64')
url="https://github.com/araujo791/machctrl"
license=('MIT')
depends=('electron' 'python' 'python-psutil' 'lm_sensors' 'dmidecode' 'lshw')
makedepends=('npm' 'nodejs')
options=(!strip)
source=("git+${url}.git")
sha256sums=('SKIP')

prepare() {
  cd "$srcdir/machctrl-desktop"
  npm install
}

build() {
  cd "$srcdir/machctrl-desktop"
  npm run build
}

package() {
  cd "$srcdir/machctrl-desktop"

  install -dm755 "$pkgdir/opt/machctrl"
  cp -r dist electron backend "$pkgdir/opt/machctrl/"
  cp package.json "$pkgdir/opt/machctrl/"

  # Launcher
  install -dm755 "$pkgdir/usr/bin"
  cat > "$pkgdir/usr/bin/machctrl" << 'EOF'
#!/bin/bash
exec electron /opt/machctrl/electron/main.js "$@"
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
}
