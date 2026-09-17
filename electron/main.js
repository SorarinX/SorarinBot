const { app, BrowserWindow, shell, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')
const net = require('net')

let goProcess = null
let mainWindow = null
let backendPort = null

// The backend falls back to the next port when the configured one is busy, so
// hardcoding a port here meant the window could load a stranger's server or time
// out waiting for a backend that had moved. Instead we pick a free port, hand it
// to the backend with -listen, and then talk to that exact port.
const PORT_RANGE_START = 8080
const PORT_RANGE_END = 8180

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })
}

async function findFreePort() {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`no free port in ${PORT_RANGE_START}-${PORT_RANGE_END}`)
}

// waitForServer polls /api/status and requires our own status payload, so a
// different application squatting on the port can never be mistaken for the
// backend.
function waitForServer(baseUrl, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http
        .get(`${baseUrl}/api/status`, (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => { body += chunk })
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                if (JSON.parse(body).status === 'running') { resolve(); return }
              } catch {
                // Not our server; keep waiting.
              }
            }
            retry()
          })
        })
        .on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeout) { reject(new Error('Server timeout')); return }
      setTimeout(check, 500)
    }
    check()
  })
}

function locateBackend() {
  const candidates = [
    path.join(__dirname, 'SorarinBot.exe'),
    path.join(process.resourcesPath || __dirname, 'SorarinBot.exe'),
    path.join(path.dirname(process.execPath), 'SorarinBot.exe'),
  ]
  for (const candidate of candidates) {
    console.log('[electron] checking:', candidate, fs.existsSync(candidate) ? 'FOUND' : 'not found')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function startGoBackend(port) {
  const exePath = locateBackend()
  if (!exePath) {
    console.error('[electron] SorarinBot.exe not found')
    return false
  }

  console.log('[electron] starting Go backend from:', exePath, 'on port', port)

  // Spawned directly rather than through `cmd /c start`: a `start` child exits
  // immediately, so goProcess referred to a dead shell and the backend survived
  // as an orphan that outlived the window. A direct child is killable, and
  // windowsHide keeps the console from flashing.
  goProcess = spawn(exePath, ['-listen', `127.0.0.1:${port}`], {
    cwd: path.dirname(exePath),
    env: { ...process.env, SORARINBOT_ELECTRON: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  goProcess.stdout.setEncoding('utf8')
  goProcess.stderr.setEncoding('utf8')
  goProcess.stdout.on('data', (data) => process.stdout.write(`[backend] ${data}`))
  goProcess.stderr.on('data', (data) => process.stderr.write(`[backend] ${data}`))

  goProcess.on('error', (err) => {
    console.error('[electron] Go backend spawn error:', err)
  })
  goProcess.on('exit', (code, signal) => {
    console.log('[electron] Go backend exited:', code, signal)
    goProcess = null
  })

  return true
}

function stopGoBackend() {
  if (!goProcess) return
  console.log('[electron] stopping Go backend')
  try {
    goProcess.kill()
  } catch (err) {
    console.error('[electron] failed to stop Go backend:', err)
  }
  goProcess = null
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

  mainWindow.loadURL(`http://127.0.0.1:${backendPort}`)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  console.log('[electron] app ready, starting Go backend...')

  try {
    backendPort = await findFreePort()
  } catch (err) {
    dialog.showErrorBox('SorarinBot', '找不到可用端口：' + err.message)
    app.quit()
    return
  }

  if (!startGoBackend(backendPort)) {
    dialog.showErrorBox('SorarinBot', '找不到 SorarinBot.exe，请重新安装。')
    app.quit()
    return
  }

  try {
    await waitForServer(`http://127.0.0.1:${backendPort}`)
    console.log('[electron] Go server ready, creating window')
    createWindow()
  } catch (err) {
    console.error('[electron] server timeout:', err)
    stopGoBackend()
    dialog.showErrorBox('SorarinBot', '后端启动超时，请查看日志了解详情。')
    app.quit()
  }
})

app.on('window-all-closed', () => {
  stopGoBackend()
  app.quit()
})

app.on('activate', () => { if (mainWindow === null) createWindow() })

app.on('before-quit', stopGoBackend)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopGoBackend()
    app.quit()
  })
}
