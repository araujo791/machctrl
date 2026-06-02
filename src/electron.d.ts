declare global {
  interface Window {
    electron?: {
      minimize:       () => Promise<void>
      maximize:       () => Promise<void>
      close:          () => Promise<void>
      isMaximized:    () => Promise<boolean>
      getPlatform:    () => Promise<{ platform: string; arch: string; hostname: string; release: string }>
      restartBackend: () => Promise<{ ok: boolean }>
      openExternal:   (url: string) => Promise<void>
      setAutostart:   (enable: boolean) => Promise<{ ok: boolean; error?: string }>
      readFileB64:    (filePath: string) => string | null
      onBackendStatus:(cb: (v: { connected: boolean; error?: string }) => void) => void
    }
  }
}
export {}

// Asset imports
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
