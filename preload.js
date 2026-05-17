const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for commands from main process
  onFocus: (callback) => ipcRenderer.on('focus', (_, stream) => callback(stream)),
  onRefresh: (callback) => ipcRenderer.on('refresh', (_, stream) => callback(stream)),
  onFullscreen: (callback) => ipcRenderer.on('fullscreen', (_, stream) => callback(stream)),
  onExitFullscreen: (callback) => ipcRenderer.on('exitfullscreen', () => callback()),
  onConfig: (callback) => ipcRenderer.on('config', (_, streams) => callback(streams)),
  onPlay: (callback) => ipcRenderer.on('play', (_, stream) => callback(stream)),
  onPause: (callback) => ipcRenderer.on('pause', (_, stream) => callback(stream)),
  onClick: (callback) => ipcRenderer.on('click', () => callback()),
  onClickPosition: (callback) => ipcRenderer.on('clickPosition', (_, data) => callback(data)),
  
  // Get initial config
  getConfig: () => ipcRenderer.invoke('getConfig')
});