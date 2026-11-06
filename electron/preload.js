const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sorarinbot', {
  platform: process.platform,
  setTitleBarTheme: (theme) => ipcRenderer.send('titlebar-theme', theme),
  beginWindowDrag: (x, y) => ipcRenderer.send('window-drag-start', { x, y }),
  moveWindow: (x, y) => ipcRenderer.send('window-drag-move', { x, y }),
  endWindowDrag: () => ipcRenderer.send('window-drag-end'),
})
