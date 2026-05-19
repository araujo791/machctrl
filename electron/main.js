const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const net  = require('net')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow  = null
let backendProcess = null

// Getter para sempre pegar a janela atual
function getWin() {
  return BrowserWindow.getAllWindows()[0] ?? null
}

// Log silencioso — não escreve em nada (evita EIO no AppImage)
const log = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isPortInUse(port) {
  return new Promise(resolve => {
    const s = net.createConnection({ port, host: '127.0.0.1' })
    s.setTimeout(400)
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error',   () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

function resolveBackendPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'backend', 'machctrl_server.py')
  }
  const candidates = [
    path.join(process.resourcesPath, 'backend', 'machctrl_server.py'),
    path.join(path.dirname(process.execPath), 'resources', 'backend', 'machctrl_server.py'),
    '/opt/machctrl/backend/machctrl_server.py',
  ]
  return candidates.find(p => { try { return fs.existsSync(p) } catch { return false } }) || candidates[0]
}

// ─── Backend ─────────────────────────────────────────────────────────────────
async function startBackend() {
  const inUse = await isPortInUse(8765)
  if (inUse) {
    log.info('Porta 8765 em uso — reutilizando backend existente.')
    return
  }

  const backendPath = resolveBackendPath()
  log.info('Subindo backend:', backendPath)

  const env = Object.assign({}, process.env, {
    PYTHONUNBUFFERED: '1',
    LD_LIBRARY_PATH: '',
    PYTHONPATH: '',
    PYTHONHOME: '',
  })

  backendProcess = spawn('/usr/bin/python3', [backendPath], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env,
    detached: false,
  })

  backendProcess.on('exit', (code, signal) => {
    log.warn('Backend saiu código', code, 'sinal', signal)
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      setTimeout(async () => {
        const still = await isPortInUse(8765)
        if (!still) startBackend()
      }, 3000)
    }
  })

  log.info('Backend PID:', backendProcess.pid)
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app-icon.png')
    : path.join(__dirname, '..', 'src', 'assets', 'app-icon.png')

  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 960, minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0c14',
    titleBarStyle: 'hidden',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('window-minimize',     () => { const w = getWin(); if(w) w.minimize() })
ipcMain.handle('window-maximize',     () => { const w = getWin(); if(w) { if(w.isMaximized()) w.unmaximize(); else w.maximize() } })
ipcMain.handle('window-close',        () => { const w = getWin(); if(w) w.close() })
ipcMain.handle('window-is-maximized', () => { const w = getWin(); return w ? w.isMaximized() : false })
ipcMain.handle('get-platform',        () => ({ platform: process.platform, arch: process.arch, hostname: os.hostname(), release: os.release() }))
ipcMain.handle('open-external',       (_, url) => shell.openExternal(url))

ipcMain.handle('restart-backend', async () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
  await new Promise(r => setTimeout(r, 600))
  await startBackend()
  return { ok: true }
})

ipcMain.handle('set-autostart', (_, enable) => {
  try {
    app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true })
    if (process.platform === 'linux') {
      const dir  = path.join(os.homedir(), '.config', 'autostart')
      const file = path.join(dir, 'machctrl.desktop')
      fs.mkdirSync(dir, { recursive: true })
      if (enable) {
        fs.writeFileSync(file,
          '[Desktop Entry]\nType=Application\nName=MachCtrl\nExec=/usr/local/bin/machctrl\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n')
      } else {
        try { fs.unlinkSync(file) } catch {}
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── Lifecycle ───────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')

app.whenReady().then(async () => {
  await startBackend()
  await new Promise(r => setTimeout(r, 1200))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) backendProcess.kill()
    app.quit()
  }
})

app.on('before-quit', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
})
