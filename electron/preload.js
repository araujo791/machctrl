const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')

contextBridge.exposeInMainWorld('electron', {
  minimize:       () => ipcRenderer.invoke('window-minimize'),
  maximize:       () => ipcRenderer.invoke('window-maximize'),
  close:          () => ipcRenderer.invoke('window-close'),
  isMaximized:    () => ipcRenderer.invoke('window-is-maximized'),
  getPlatform:    () => ipcRenderer.invoke('get-platform'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  openExternal:   (url) => ipcRenderer.invoke('open-external', url),
  setAutostart:   (enable) => ipcRenderer.invoke('set-autostart', enable),
  onBackendStatus:(cb) => ipcRenderer.on('backend-status', (_, v) => cb(v)),
  // Lê arquivo local para wallpaper (base64)
  readFileB64: (filePath) => {
    try {
      const buf = fs.readFileSync(filePath)
      const ext = filePath.split('.').pop().toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                 : ext === 'png' ? 'image/png'
                 : ext === 'webp' ? 'image/webp'
                 : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  },
})
