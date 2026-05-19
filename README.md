# MachCtrl Desktop v2.0

Monitor e Otimizador de Hardware para Linux — estilo Sensei, feito para CachyOS / Arch Linux.

## Funcionalidades

| Módulo | Recursos |
|--------|----------|
| **Visão Geral** | Dashboard completo com todos os sensores |
| **CPU** | Por socket, por núcleo — dual ring (temp + atividade) |
| **Memória** | Uso, slots físicos, fabricante, part number, velocidade |
| **Discos** | Uso, I/O em tempo real, sparklines por disco |
| **Ventiladores** | RPM, PWM, controle de modo (auto/manual/max) |
| **Energia** | Perfis Economia / Equilibrado / Desempenho |
| **Limpeza** | Cache pacman, órfãos, journal, temp, thumbnails |
| **Benchmark** | CPU (crivo + ponto flutuante) + memória (largura de banda) |

## Instalação (CachyOS / Arch Linux)

```bash
git clone https://github.com/araujo791/solus-os-gateway.git
cd solus-os-gateway/machctrl-desktop
sudo bash install.sh
```

O instalador cuida de tudo:
- Instala dependências (`python-psutil`, `lm_sensors`, `dmidecode`, `lshw`, `electron`, `nodejs`)
- Configura `sudoers` para `dmidecode` sem senha (leitura dos pentes de RAM)
- Cria serviço `systemd` `machctrl-backend` (roda como root para acesso total ao hardware)
- Cria entrada `.desktop` no menu de aplicativos
- Gera `AppImage` e `.pkg.tar.zst` para instalação nativa

## Desenvolvimento

```bash
cd machctrl-desktop
npm install
npm run dev          # Abre Electron em modo dev (hot reload)
```

## Build manual

```bash
npm run build                  # Build Vite + Electron AppImage + pacman pkg
npm run build:appimage         # Só AppImage
npm run build:pacman           # Só .pkg.tar.zst (CachyOS/Arch)
```

## Arquitetura

```
machctrl-desktop/
├── electron/
│   ├── main.js          # Processo principal Electron (janela, IPC, backend spawn)
│   └── preload.js       # Bridge segura renderer ↔ main
├── src/
│   ├── App.tsx           # Layout principal + roteamento de abas
│   ├── hooks/
│   │   └── useSensorData.ts   # WebSocket → dados de sensores em tempo real
│   └── components/
│       ├── sidebar/      # Titlebar (frameless) + Sidebar (navegação)
│       ├── shared/       # RingGauge, CoreRing, Sparkline
│       ├── panels/       # Overview, CPU, Memory, Disks, Fans, Power
│       ├── benchmark/    # BenchmarkPanel
│       └── cleaner/      # CleanerPanel
├── backend/
│   └── machctrl_server.py     # Backend Python (WebSocket, psutil, sensores)
├── install.sh           # Instalador para CachyOS/Arch
└── PKGBUILD             # Para empacotamento AUR
```

## Comandos úteis

```bash
systemctl status machctrl-backend        # Status do backend
journalctl -u machctrl-backend -f        # Logs em tempo real
systemctl restart machctrl-backend       # Reiniciar backend
machctrl                                 # Abrir app pelo terminal
```

## Memória RAM — nota

Para ver os detalhes dos módulos (fabricante, part number, velocidade), o `dmidecode` precisa de root.
O instalador configura isso automaticamente via `sudoers`. Se os slots aparecerem vazios, verifique:

```bash
sudo dmidecode -t 17 | grep -A5 "Memory Device"
```
