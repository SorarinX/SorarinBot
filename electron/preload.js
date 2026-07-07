const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('sorarinbot', {
  platform: process.platform,
})
