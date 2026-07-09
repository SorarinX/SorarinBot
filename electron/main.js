const { app, BrowserWindow, shell, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

let goProcess = null
let mainWindow = null

const GO_PORT = 8080
const GO_URL = `http://localhost:${GO_PORT}`

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve()
        else retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeout) { reject(new Error('Server timeout')); return }
      setTimeout(check, 500)
    }
    check()
  })
}

function startGoBackend() {
  const possiblePaths = [
    path.join(__dirname, 'SorarinBot.exe'),
    path.join(process.resourcesPath || __dirname, 'SorarinBot.exe'),
    path.join(path.dirname(process.execPath), 'SorarinBot.exe'),
  ]

  let exePath = null
  for (const p of possiblePaths) {
    console.log('[electron] checking:', p, fs.existsSync(p) ? 'FOUND' : 'not found')
    if (fs.existsSync(p)) { exePath = p; break }
  }

  if (!exePath) {
    console.error('[electron] SorarinBot.exe not found in any of:', possiblePaths)
    return false
  }

  console.log('[electron] starting Go backend from:', exePath)

  goProcess = spawn('cmd.exe', ['/c', 'start', 'SorarinBot.exe'], {
    cwd: path.dirname(exePath),
    env: { ...process.env, SORARINBOT_ELECTRON: '1' },
    detached: true
  })
  goProcess.unref()

  goProcess.on('error', (err) => {
    console.error('[electron] Go backend spawn error:', err)
  })
  goProcess.on('exit', (code) => {
    console.log('[electron] Go backend exited:', code)
    goProcess = null
  })

  return true
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'SorarinBot',
    icon: path.join(__dirname, 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('[electron] page load failed:', errorCode, errorDesc)
  })

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[electron] renderer crashed:', details)
  })

  mainWindow.loadURL(GO_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  console.log('[electron] app ready, starting Go backend...')

  const started = startGoBackend()
  if (!started) {
    dialog.showErrorBox('SorarinBot', '找不到 SorarinBot.exe，请重新安装。')
    app.quit()
    return
  }

  try {
    console.log('[electron] waiting for Go server at', GO_URL)
    await waitForServer(GO_URL)
    console.log('[electron] Go server ready, creating window')
    createWindow()
  } catch (err) {
    console.error('[electron] server timeout:', err)
    dialog.showErrorBox('SorarinBot', '后端启动超时，请检查端口 ' + GO_PORT + ' 是否被占用。')
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (goProcess) { goProcess.kill(); goProcess = null }
  app.quit()
})

app.on('activate', () => { if (mainWindow === null) createWindow() })

app.on('before-quit', () => {
  if (goProcess) { goProcess.kill(); goProcess = null }
})
