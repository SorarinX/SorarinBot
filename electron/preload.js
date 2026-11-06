const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sorarinbot', {
  platform: process.platform,
  setTitleBarTheme: (theme) => ipcRenderer.send('titlebar-theme', theme),
})
