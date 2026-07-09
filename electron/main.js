const { app, BrowserWindow, shell } = require('electron')
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
  // Try multiple possible locations for the Go binary
  const possiblePaths = [
    path.join(__dirname, 'SorarinBot.exe'),
    path.join(process.resourcesPath || __dirname, 'SorarinBot.exe'),
    path.join(path.dirname(process.execPath), 'SorarinBot.exe'),
  ]

  let exePath = null
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) { exePath = p; break }
  }

  if (!exePath) {
    console.error('SorarinBot.exe not found in any of:', possiblePaths)
    return
  }

  console.log('Starting Go backend from:', exePath)

  goProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    env: { ...process.env, SORARINBOT_ELECTRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  goProcess.stdout.on('data', (data) => console.log('[go]', data.toString().trim()))
  goProcess.stderr.on('data', (data) => console.error('[go]', data.toString().trim()))
  goProcess.on('error', (err) => console.error('Go backend error:', err))
  goProcess.on('exit', (code) => { console.log('Go backend exited:', code); goProcess = null })
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

  mainWindow.loadURL(GO_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  startGoBackend()
  try {
    await waitForServer(GO_URL)
    createWindow()
  } catch (err) {
    console.error('Failed to start:', err)
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
