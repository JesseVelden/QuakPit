import { contextBridge, ipcRenderer } from 'electron'

export type Flight = {
  message: string
  durationMs: number
  sound?: boolean
  soundPack?: string
  theme?: string
  head?: string
  color?: string
  font?: string
}

// Single, minimal API exposed to both the overlay and settings renderers.
contextBridge.exposeInMainWorld('quakpit', {
  // Overlay
  onFlight: (cb: (flight: Flight) => void): (() => void) => {
    const listener = (_event: unknown, flight: Flight): void => cb(flight)
    ipcRenderer.on('flight:start', listener)
    return () => ipcRenderer.removeListener('flight:start', listener)
  },
  // Settings
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch: unknown) => ipcRenderer.invoke('prefs:set', patch),
  calStatus: () => ipcRenderer.invoke('cal:status'),
  calConnect: (provider: string, params?: { username?: string; password?: string }) =>
    ipcRenderer.invoke('cal:connect', provider, params),
  calDisconnect: (provider: string) => ipcRenderer.invoke('cal:disconnect', provider),
  calConfigure: (provider: string, params: { clientId?: string; clientSecret?: string }) =>
    ipcRenderer.invoke('cal:configure', provider, params),
  outlookListFolders: () => ipcRenderer.invoke('outlook:listFolders'),
  icalList: () => ipcRenderer.invoke('ical:list'),
  icalAdd: (url: string, name?: string) => ipcRenderer.invoke('ical:add', url, name),
  icalRemove: (id: string) => ipcRenderer.invoke('ical:remove', id),
  // Custom flier image (Pro)
  flierImport: () => ipcRenderer.invoke('flier:import'),
  flierGetCustom: () => ipcRenderer.invoke('flier:getCustom'),
  flierRemoveCustom: () => ipcRenderer.invoke('flier:removeCustom'),
  upcoming: () => ipcRenderer.invoke('events:upcoming'),
  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
  testFlight: () => ipcRenderer.invoke('flight:test'),
  // License / premium
  licenseStatus: () => ipcRenderer.invoke('license:status'),
  licenseActivate: (key: string) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate')
})
